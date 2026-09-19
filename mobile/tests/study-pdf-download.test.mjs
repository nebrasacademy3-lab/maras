import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
function load(path, mocks) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { if (!(name in mocks)) throw new Error("Unexpected native module " + name); return mocks[name]; }, AbortController, Headers, Request, Response, URL, Blob, Uint8Array, TextEncoder, TextDecoder, setTimeout, clearTimeout });
  return exports;
}
const shared = load("../src/lib/study-pdf-download.ts", {});
const bytes = new Uint8Array(200); bytes.set(new TextEncoder().encode("%PDF-1.7")); bytes.set(new TextEncoder().encode("%%EOF\n"), 194);
function fixture({ platform = "android", badResponse = null, permission = true, switchAt = "", shareAvailable = true } = {}) {
  let token = "synthetic-owned-token", created = 0, removed = 0, copies = 0, externalDeleted = 0, shares = 0;
  const files = new Map(), requests = [], imports = [];
  class File {
    constructor(_directory, name) { this.uri = `file:///private/cache/${name}`; }
    create(options) { assert.equal(options.overwrite, false); assert.equal(files.has(this.uri), false); files.set(this.uri, new Uint8Array()); created++; }
    write(data) { files.set(this.uri, data); }
    get size() { return files.get(this.uri)?.length || 0; }
    get exists() { return files.has(this.uri); }
    delete() { files.delete(this.uri); removed++; }
  }
  class Directory { create() {} }
  const mocks = {
    "expo/fetch": { fetch: async (url, init) => {
      requests.push({ url, init }); assert.equal(init.headers.get("authorization"), "Bearer synthetic-owned-token"); assert.equal(new URL(url).origin, "https://maras-qa.example");
      if (url.endsWith("/api/profile")) return Response.json({ user: { id: 7 } });
      assert.equal(new URL(url).pathname, "/api/ai/artifacts/10/download");
      if (switchAt === "network") token = "other-account-token";
      return badResponse || new Response(bytes, { headers: { "content-type": "application/pdf", "content-length": "200" } });
    } },
    "react-native": { Platform: { OS: platform } },
    "@/src/lib/api": { getApiToken: () => token, apiRequestUrl: path => new URL(path, "https://maras-qa.example") },
    "@/src/lib/study-pdf-download": shared,
    "expo-file-system": { File, Directory, Paths: { cache: "file:///private/cache" } },
    "expo-crypto": { randomUUID: () => "synthetic-private-pdf" },
    "expo-file-system/legacy": {
      StorageAccessFramework: {
        requestDirectoryPermissionsAsync: async () => { if (switchAt === "permission") token = "other"; return { granted: permission, directoryUri: "content://owned-user-choice" }; },
        createFileAsync: async (path, name, mime) => { assert.equal(path, "content://owned-user-choice"); assert.match(name, /\.pdf$/); assert.equal(mime, "application/pdf"); return "content://new-exclusive-pdf"; },
      },
      copyAsync: async () => { copies++; if (switchAt === "copy") token = "other"; },
      deleteAsync: async uri => { assert.equal(uri, "content://new-exclusive-pdf"); externalDeleted++; },
    },
    "expo-sharing": { isAvailableAsync: async () => shareAvailable, shareAsync: async (_uri, options) => { assert.equal(options.mimeType, "application/pdf"); shares++; } },
  };
  const tracked = Object.fromEntries(Object.entries(mocks).map(([name, value]) => [name, new Proxy(value, { get(target, prop) { imports.push(name); return target[prop]; } })]));
  const native = load("../src/lib/study-pdf-native.ts", tracked);
  return { run: () => native.downloadStudyPdf({ id: 10, userId: 7, signal: new AbortController().signal }), state: () => ({ created, removed, copies, externalDeleted, shares, cachedFiles: files.size, requests: requests.length }), imports };
}
test("native PDF save validates transport, copies once to explicit Android destination and clears private cache", async () => {
  const f = fixture(); assert.equal((await f.run()).action, "saved");
  assert.deepEqual(f.state(), { created: 1, removed: 1, copies: 1, externalDeleted: 0, shares: 0, cachedFiles: 0, requests: 4 });
});
test("HTML and error responses never create a native file or launch a share sheet", async () => {
  for (const badResponse of [new Response("<html>error</html>", { headers: { "content-type": "text/html" } }), new Response("denied", { status: 403 }), new Response("broken", { headers: { "content-type": "application/pdf" } })]) {
    const f = fixture({ badResponse }); await assert.rejects(f.run()); assert.equal(f.state().created, 0); assert.equal(f.state().shares, 0); assert.equal(f.state().copies, 0);
  }
});
test("changing accounts during the response or Android picker never exports the previous account's document", async () => {
  for (const switchAt of ["network", "permission"]) {
    const f = fixture({ switchAt }); await assert.rejects(f.run(), e => e.code === "PDF_SESSION_CHANGED");
    assert.equal(f.state().copies, 0); assert.equal(f.state().cachedFiles, 0); assert.equal(f.state().shares, 0);
  }
});
test("a changed account during copy cleans only the new destination and private temporary file", async () => {
  const f = fixture({ switchAt: "copy" }); await assert.rejects(f.run(), e => e.code === "PDF_SESSION_CHANGED");
  assert.equal(f.state().externalDeleted, 1); assert.equal(f.state().cachedFiles, 0); assert.equal(f.state().shares, 0);
});
test("Android cancellation does not silently switch to sharing or export elsewhere", async () => {
  const f = fixture({ permission: false }); assert.equal((await f.run()).action, "cancelled"); assert.equal(f.state().copies, 0); assert.equal(f.state().shares, 0); assert.equal(f.state().cachedFiles, 0);
});
test("iOS shares a verified PDF and cleans its private cache after the sheet closes", async () => {
  const f = fixture({ platform: "ios" }); assert.equal((await f.run()).action, "shared"); assert.equal(f.state().shares, 1); assert.equal(f.state().cachedFiles, 0);
  const unavailable = fixture({ platform: "ios", shareAvailable: false }); await assert.rejects(unavailable.run(), e => e.code === "PDF_SHARING_UNAVAILABLE"); assert.equal(unavailable.state().cachedFiles, 0);
});
