import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function load(path, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (!(name in mocks)) throw new Error("Unexpected import " + name); return mocks[name]; }, URL, URLSearchParams, Headers, FormData, Blob, Response, ReadableStream, TextDecoder, TextEncoder, Uint8Array, AbortController, setTimeout, clearTimeout, __DEV__: false, ...globals });
  return exports;
}
const policy = load("src/lib/store-commerce.ts");
function client(fetch, extra = {}) {
  return load("src/lib/api.ts", {
    "expo-constants": { default: { expoConfig: { extra: { apiUrl: "https://example.test", storeMode: "reader" } } } },
    "react-native": { Platform: { OS: "ios" } },
    "@/src/lib/store-commerce": policy,
    "@/src/lib/interaction-events": { nativeToast() {}, requestNativeAdminMfa: async () => false, requestNativeAiConsent: async () => true, ...extra.interactions },
  }, { fetch, ...extra.globals });
}
const pdf = new TextEncoder().encode("%PDF-1.7\n" + "x".repeat(300) + "\n%%EOF\n");
const pdfResponse = () => new Response(pdf, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(pdf.length) } });
function downloads({ platform = "ios", request = async () => pdfResponse(), verify, choose, share } = {}) {
  const files = [], shares = [], destinations = [], removed = [];
  let counter = 0, mfa = 0;
  const api = client(async () => new Response('{}'));
  api.setApiToken("session-one");
  class File {
    constructor(_dir, name) { this.uri = "file:///private/" + name; this.exists = false; this.size = 0; this.parts = []; files.push(this); }
    create() { this.exists = true; }
    open() { return { writeBytes: bytes => { this.parts.push(bytes.slice()); this.size += bytes.length; }, close: () => { this.closed = true; } }; }
    delete() { this.exists = false; this.parts = []; }
  }
  const module = load("src/lib/downloads.ts", {
    "react-native": { Platform: { OS: platform } }, "@/src/lib/api": api,
    "@/src/lib/interaction-events": { requestNativeAdminMfa: async () => { mfa++; if (verify) return verify(api); api.setAdminStepUpToken("proof-one"); return true; } },
    "expo/fetch": { fetch: (url, init) => request(url, init, api) },
    "expo-file-system": { File, Directory: class { create() {} }, Paths: { cache: "file:///private" } },
    "expo-crypto": { randomUUID: () => "unique-" + (++counter) },
    "expo-sharing": { isAvailableAsync: async () => true, shareAsync: async (uri, options) => { shares.push({ uri, options }); if (share) await share(api); } },
    "expo-file-system/legacy": { StorageAccessFramework: { requestDirectoryPermissionsAsync: async () => choose ? choose(api) : { granted: true, directoryUri: "content://chosen" }, createFileAsync: async () => { const uri = "content://saved"; destinations.push(uri); return uri; } }, copyAsync: async () => {}, deleteAsync: async uri => removed.push(uri) },
  });
  return { ...module, api, files, shares, destinations, removed, mfa: () => mfa };
}

test("pending JSON from another session is rejected even if fetch ignores cancellation", async () => {
  let finish;
  const api = client(() => new Promise(resolve => { finish = resolve; }));
  api.setApiToken("old"); const pending = api.api("/api/profile");
  await new Promise(resolve => setTimeout(resolve, 0));
  api.setApiToken("new"); finish(new Response('{"private":"old account"}'));
  await assert.rejects(pending, error => error.code === "SESSION_CHANGED");
});
test("switching away and back cannot revive a stale response", async () => {
  let finish;
  const api = client(() => new Promise(resolve => { finish = resolve; }));
  api.setApiToken("one"); const pending = api.api("/api/profile"); await new Promise(resolve => setTimeout(resolve, 0));
  api.setApiToken("two"); api.setApiToken("one"); finish(new Response('{}'));
  await assert.rejects(pending, error => error.code === "SESSION_CHANGED");
});
test("callers cannot override redirect or cookie policy, and credentials stay scoped", async () => {
  let sent;
  const api = client(async (_url, init) => { sent = init; return new Response('{}'); });
  api.setApiToken("s"); api.setAdminStepUpToken("proof");
  await api.api("/api/profile", { redirect: "follow", credentials: "include", headers: { "x-meras-admin-stepup": "injected" } });
  assert.equal(sent.redirect, "error"); assert.equal(sent.credentials, "omit"); assert.equal(sent.headers.has("x-meras-admin-stepup"), false);
  assert.equal(api.authenticatedRequestHeaders("/api/admin/staff").get("x-meras-admin-stepup"), "proof");
  api.setApiToken("new"); assert.equal(api.authenticatedRequestHeaders("/api/admin/staff").has("x-meras-admin-stepup"), false);
});
test("a followed redirect is rejected defensively", async () => {
  const api = client(async () => ({ redirected: true, url: "https://evil.test", ok: true, text: async () => '{}' }));
  await assert.rejects(() => api.api("/api/profile"), error => error.code === "REDIRECT_BLOCKED");
});
test("logout revocation may finish after clearing the local token", async () => {
  let finish;
  const api = client(() => new Promise(resolve => { finish = resolve; })); api.setApiToken("old");
  const pending = api.api("/api/mobile/auth/logout", { method: "POST" });
  api.setApiToken(null); finish(new Response('{"ok":true}')); assert.equal((await pending).ok, true);
});
test("all native upload transports reject checkout and cart mutations without sending", async () => {
  let created = 0;
  const api = client(async () => { throw new Error("must not fetch"); }, { globals: { XMLHttpRequest: class { constructor() { created++; } } } });
  for (const path of ["/api/checkout", "/api/ai/subscription/checkout", "/api/cart"]) await assert.rejects(() => api.apiUpload(path, new FormData()), error => error.status === 403);
  assert.equal(created, 0);
});
test("AI denial sends no data, including native file uploads", async () => {
  let sent = 0;
  const api = client(async () => { sent++; return new Response('{}'); }, { interactions: { requestNativeAiConsent: async () => false } });
  for (const path of ["/api/assistant", "/api/ai/uploads", "/api/ai/conversations/1/messages"]) await assert.rejects(() => api.api(path, { method: "POST", body: '{}' }), error => error.code === "AI_CONSENT_REQUIRED");
  await assert.rejects(() => api.apiUpload("/api/ai/files", new FormData()), error => error.code === "AI_CONSENT_REQUIRED");
  assert.equal(sent, 0);
});
test("AI consent is deduplicated and invalidated on account changes", async () => {
  let prompts = 0;
  const api = client(async () => new Response('{}'), { interactions: { requestNativeAiConsent: async () => { prompts++; return true; } } });
  api.setApiToken("one");
  await Promise.all([api.api("/api/assistant", { method: "POST" }), api.api("/api/ai/uploads", { method: "POST" })]);
  assert.equal(prompts, 1);
  api.setApiToken("two"); await api.api("/api/assistant", { method: "POST" }); assert.equal(prompts, 2);
});
test("old-account AI consent cannot authorize the new account's request", async () => {
  let finish, sent = 0;
  const api = client(async () => { sent++; return new Response('{}'); }, { interactions: { requestNativeAiConsent: () => new Promise(resolve => { finish = resolve; }) } });
  api.setApiToken("one"); const pending = api.api("/api/assistant", { method: "POST" }); api.setApiToken("two"); finish(true);
  await assert.rejects(pending, error => error.code === "SESSION_CHANGED"); assert.equal(sent, 0);
});
for (const platform of ["android", "ios"]) test(platform + " contract downloads preserve MFA and delete private temporary files", async () => {
  let calls = 0;
  const d = downloads({ platform, request: async (_url, init) => {
    assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit");
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ code: "MFA_STEP_UP_REQUIRED" }), { status: 428 });
    assert.equal(init.headers.get("x-meras-admin-stepup"), "proof-one"); return pdfResponse();
  } });
  const result = await d.downloadProtectedFile({ path: "/api/admin/instructors/contracts/1/download", fileName: "contract.pdf", mimeType: "application/pdf", saveToFiles: true });
  assert.equal(result.action, platform === "ios" ? "shared" : "saved"); assert.equal(d.mfa(), 1); assert.equal(calls, 2);
  assert.ok(d.files.every(file => !file.exists && file.closed));
});
test("cancelled MFA neither retries nor creates a file", async () => {
  let calls = 0;
  const d = downloads({ verify: async () => false, request: async () => { calls++; return new Response('{"code":"MFA_STEP_UP_REQUIRED"}', { status: 428 }); } });
  await assert.rejects(() => d.downloadProtectedFile({ path: "/api/admin/instructors/contracts/1/download", fileName: "contract.pdf", mimeType: "application/pdf" }), error => error.status === 428);
  assert.equal(calls, 1); assert.equal(d.files.length, 0);
});
test("session change during MFA cannot retry a private download", async () => {
  let calls = 0;
  const d = downloads({ verify: async api => { api.setApiToken("two"); return true; }, request: async () => { calls++; return new Response('{"code":"MFA_STEP_UP_REQUIRED"}', { status: 428 }); } });
  await assert.rejects(() => d.downloadProtectedFile({ path: "/api/admin/instructors/contracts/1/download", fileName: "x.pdf" }), error => error.code === "SESSION_CHANGED"); assert.equal(calls, 1);
});
for (const kind of ["json", "html", "fake-pdf", "incomplete", "oversized"]) test("download rejects " + kind + " before exporting", async () => {
  const d = downloads({ request: async () => {
    if (kind === "json") return new Response('{}', { headers: { "content-type": "application/json" } });
    if (kind === "html") return new Response('<html>error</html>', { headers: { "content-type": "text/html" } });
    if (kind === "fake-pdf") return new Response('not-pdf'.repeat(50), { headers: { "content-type": "application/pdf" } });
    return new Response(pdf, { headers: { "content-type": "application/pdf", "content-length": kind === "oversized" ? String(129 * 1024 * 1024) : String(pdf.length + 10) } });
  } });
  await assert.rejects(() => d.downloadProtectedFile({ path: "/api/instructor/contracts/1/download", fileName: "x.pdf", mimeType: "application/pdf" }));
  assert.equal(d.shares.length, 0); assert.ok(d.files.every(file => !file.exists));
});
test("file choice cancelled on Android removes the temporary file", async () => {
  const d = downloads({ platform: "android", choose: async () => ({ granted: false }) });
  const result = await d.downloadProtectedFile({ path: "/api/instructor/contracts/1/download", fileName: "x.pdf", mimeType: "application/pdf", saveToFiles: true });
  assert.equal(result.action, "cancelled"); assert.ok(d.files.every(file => !file.exists));
});
test("account switch while choosing a save directory never copies the file", async () => {
  const d = downloads({ platform: "android", choose: async api => { api.setApiToken("new"); return { granted: true, directoryUri: "content://chosen" }; } });
  await assert.rejects(() => d.downloadProtectedFile({ path: "/api/instructor/contracts/1/download", fileName: "x.pdf", mimeType: "application/pdf", saveToFiles: true }), error => error.code === "SESSION_CHANGED");
  assert.equal(d.destinations.length, 0); assert.ok(d.files.every(file => !file.exists));
});
test("same named files get distinct cache paths and streaming handles close", async () => {
  const d = downloads();
  for (let i = 0; i < 2; i++) await d.downloadProtectedFile({ path: "/api/instructor/contracts/1/download", fileName: "x.pdf", mimeType: "application/pdf" });
  assert.notEqual(d.files[0].uri, d.files[1].uri); assert.ok(d.files.every(file => !file.exists && file.closed));
});
test("PDF signature validation survives every byte arriving separately", async () => {
  const d = downloads(); let writes = 0;
  const response = new Response(new ReadableStream({ start(controller) { for (const byte of pdf) controller.enqueue(new Uint8Array([byte])); controller.close(); } }), { headers: { "content-type": "application/pdf" } });
  assert.equal(await d.readProtectedDownload(response, "application/pdf", () => writes++, () => {}), pdf.length); assert.equal(writes, pdf.length);
});
test("query retries are bounded and never replay authorization or cancellation failures", () => {
  const { retryQuery } = load("src/lib/query-policy.ts");
  for (const status of [400, 401, 403, 404, 409, 413, 422, 428, 429, 499]) assert.equal(retryQuery(0, { status }), false);
  for (const status of [0, 408, 500, 502, 503]) { assert.equal(retryQuery(0, { status }), true); assert.equal(retryQuery(1, { status }), false); }
});
test("native help never renders web payment instructions or checkout FAQ", () => {
  const guide = load("src/lib/reader-guide.ts");
  for (const question of ["How do I pay?", "اشترك من وين", "أسعار المواد", "buy on the website"]) {
    const reply = guide.readerReply({ answer: "Pay via https://example.test/cart", actions: [] }, question);
    assert.doesNotMatch(reply.answer, /https:|example.test|زر الشراء|عبر الموقع/);
    assert.ok(reply.actions.every(action => ["/learn", "/support"].includes(action.href)));
  }
  assert.doesNotMatch(JSON.stringify(guide.READER_INFORMATION), /Tap|تمارا|تابي|https:|ادفع الآن|checkout/i);
});
test("system links map native pages, preserve cold OAuth safety and reject checkout", () => {
  const routes = load("src/lib/notification-routing.ts", { "expo-router": { router: {} }, "react-native": { Linking: {} }, "@/src/lib/api": { API_URL: "https://example.test", DIRECT_COMMERCE_ENABLED: false } });
  const intent = load("app/+native-intent.tsx", { "@/src/lib/api": { API_URL: "https://example.test" }, "@/src/lib/notification-routing": routes });
  const route = path => intent.redirectSystemPath({ path, initial: true });
  assert.equal(route("https://example.test/courses/math"), "/course/math");
  assert.equal(route("merasalelm://learn/math"), "/learn/math");
  assert.equal(route("merasalelm://oauth/callback?code=private"), "/oauth/callback");
  for (const path of ["https://evil.test/courses/math", "/cart", "https://example.test/cart", "/courses/%252fadmin", "javascript:bad", "//evil.test"]) assert.equal(route(path), "/(tabs)", path);
});
