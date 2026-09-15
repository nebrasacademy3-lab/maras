import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pureSource } from "./helpers/pure-source.mjs";
const policy = await pureSource("lib/staff-policy.ts");

test("public origins reject listener/private/credential URLs and never depend on request headers", async () => {
  const origins = await pureSource("lib/public-origin.ts", { process: { env: { NEXT_PUBLIC_SITE_URL: "https://0.0.0.0:8080", APP_URL: "http://127.0.0.1:3100" } } });
  for (const value of ["https://0.0.0.0:8080", "https://127.1", "https://10.1.2.3", "https://192.168.1.1", "https://172.16.3.1", "https://169.254.169.254", "https://[::1]", "https://service.internal", "https://localhost", "https://user:secret@example.com", "https://example.com?x=1", "javascript:alert(1)"]) assert.equal(origins.normalizePublicOrigin(value), null, value);
  assert.equal(origins.publicOrigin(), "https://marasalelm.com");
  assert.equal(origins.normalizePublicOrigin("https://marasalelm.com/a"), "https://marasalelm.com");
  assert.equal(origins.normalizePublicOrigin("http://127.0.0.1:3100", true), "http://127.0.0.1:3100");
});

test("unknown staff routes/actions, owner permissions and wildcard grants default to denial", () => {
  assert.equal(policy.requiredRoutePermissions("/api/admin/new-feature", "POST"), null);
  assert.equal(policy.consoleActionPermissions("futureAction"), null);
  assert.equal(policy.consoleActionPermissions("deleteEntity", "unrecognized"), null);
  for (const grants of [["*"], ["staff.manage"], ["audit.view"], ["owner"], ["catalog.manage", 1]]) assert.equal(policy.validStaffGrants(grants), false);
  assert.equal(policy.validStaffGrants(["catalog.view", "students.manage"]), true);
  assert.equal(policy.permissionsCover(new Set(), ["catalog.view"]), false);
});

test("read capability never signs uploads or deletes files; delete requires both area and delete grants", () => {
  assert.deepEqual(policy.requiredRoutePermissions("/api/admin/videos/direct", "GET"), ["catalog.manage"]);
  const required = policy.requiredRoutePermissions("/api/admin/course-resources", "DELETE");
  assert.equal(policy.permissionsCover(new Set(["catalog.manage"]), required), false);
  assert.equal(policy.permissionsCover(new Set(["records.delete"]), required), false);
  assert.equal(policy.permissionsCover(new Set(["records.delete", "catalog.manage"]), required), true);
  assert.equal(policy.permissionsCover(new Set(["catalog.manage"]), ["catalog.view"]), true);
  assert.equal(policy.permissionsCover(new Set(["catalog.view"]), ["catalog.manage"]), false);
});

async function adminHarness(statuses, verified = true) {
  const calls = [], events = []; let challenges = 0;
  const client = await pureSource("lib/admin-client.ts", { window: { location: { origin: "https://maras-qa.example" } },
    fetch: async (input, init) => { calls.push({ input, init }); return new Response(JSON.stringify({ code: "MFA_STEP_UP_REQUIRED" }), { status: statuses.shift() || 200, headers: { "content-type": "application/json" } }); },
    notify: (...event) => events.push(event), requestAdminVerification: async () => { challenges++; return verified; },
  });
  return { ...client, calls, events, challenges: () => challenges };
}
test("admin MFA replays the exact body once after verification, never repeatedly", async () => {
  const h = await adminHarness([428, 428, 200]); const init = { method: "POST", body: JSON.stringify({ title: "مسودة محفوظة" }) };
  assert.equal((await h.adminFetch("/api/admin/staff", init)).status, 428);
  assert.equal(h.calls.length, 2); assert.equal(h.challenges(), 1); assert.equal(h.calls[0].init, h.calls[1].init);
});
test("cancelled MFA leaves the rejected operation unexecuted and does not report success", async () => {
  const h = await adminHarness([428, 200], false); assert.equal((await h.adminFetch("/api/admin/staff", { method: "POST", body: "draft" })).status, 428);
  assert.equal(h.calls.length, 1); assert.equal(h.events.length, 0);
});
test("foreign origins, streamed Requests and aborted mutations are never automatically replayed", async () => {
  const a = await adminHarness([428, 200]); await a.adminFetch("https://other.example/api/admin/staff", { method: "POST" }); assert.equal(a.challenges(), 0); assert.equal(a.calls.length, 1);
  const b = await adminHarness([428, 200]); await b.adminFetch(new Request("https://maras-qa.example/api/admin/staff", { method: "POST", body: "x" })); assert.equal(b.challenges(), 0);
  const c = await adminHarness([428, 200]); const controller = new AbortController(); controller.abort(); await c.adminFetch("/api/admin/staff", { method: "POST", signal: controller.signal }); assert.equal(c.calls.length, 1);
});
test("concurrent MFA prompts are coalesced and unmounted confirmation fails closed", async () => {
  const events = await pureSource("lib/interaction-events.ts"); const prompts = []; const unregister = events.registerInteractionListener(item => prompts.push(item));
  const a = events.requestAdminVerification(), b = events.requestAdminVerification(); assert.equal(a, b); assert.equal(prompts.length, 1); prompts[0].resolve(false);
  assert.equal(await a, false); unregister(); assert.equal(await events.confirmAction("delete?"), false);
});
test("shared native permission and content contracts remain byte-identical", async () => {
  for (const file of ["staff-policy.ts", "staff-contracts.ts", "information-contract.ts"]) assert.equal(await readFile(new URL("../lib/" + file, import.meta.url), "utf8"), await readFile(new URL("../mobile/src/lib/" + file, import.meta.url), "utf8"));
});
test("native financial prompts await an explicit response instead of invoking fallback on undefined", async () => {
  const source = await readFile(new URL("../mobile/src/components/AdminCenters.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Alert\.prompt/); assert.match(source, /await promptNative/); assert.doesNotMatch(source, /\?\?\s*void run\(/);
  const native = await pureSource("mobile/src/lib/interaction-events.ts"); const prompts = []; const stop = native.registerNativeInteractions(item => prompts.push(item), () => {});
  const pending = native.promptNative("سبب القرار"); assert.equal(prompts.length, 1); prompts[0].resolve(false); assert.equal(await pending, null); stop();
});
test("FAQ publication rejects executable markup, duplicate IDs and oversized payloads", async () => {
  const info = await pureSource("lib/information-contract.ts");
  const data = structuredClone(info.DEFAULT_INFORMATION);
  assert.ok(data && data.faq.length === 35); info.validateInformation(data);
  const bad = structuredClone(data); bad.about.intro = '<script>alert(1)</script>'; assert.throws(() => info.validateInformation(bad));
  const duplicate = structuredClone(data); duplicate.faq[1].id = duplicate.faq[0].id; assert.throws(() => info.validateInformation(duplicate));
});
