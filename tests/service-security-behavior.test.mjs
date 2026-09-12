import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function isolated(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__serviceSecurity" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { fileName: path, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const body = await isolated("../lib/request-body.ts");
const primitives = await isolated("../lib/api.ts");
const jsonError = (message, status = 400) => Response.json({ error: message }, { status });
const trusted = { ...body, finiteNumber: primitives.finiteNumber, cleanText: primitives.cleanText, jsonError, sameOriginRequest: () => true, isMobileRequest: () => false, isNativeAppRequest: () => false, getSessionUser: async () => ({ id: 9, role: "admin", email: "admin@example.test" }), roleAllowed: () => true, isAdminRequest: () => false, checkRateLimit: async () => true, clientIp: () => "127.0.0.1", getDb: () => ({}), requireAdminStepUp: async () => {}, authorizePermission: async () => ({ id: 9, role: "admin" }), ADMIN_PERMISSIONS: { COMPLIANCE_MANAGE: "compliance.manage" }, process: { env: { VIDEO_SIGNING_SECRET: "test-only-signing-secret-do-not-deploy" } } };

test("reviewed student and staff mutations reject null, arrays and excessive JSON before database mutations", async () => {
  const endpoints = [
    ["cart", ["POST"]], ["favorites", ["POST"]], ["waitlist", ["POST", "DELETE"]], ["profile/sessions", ["DELETE"]],
    ["supervisor/workspace", ["POST"]], ["supervisor/requests", ["PATCH"]], ["support", ["POST", "PATCH", "DELETE"]],
    ["reviews", ["POST"]], ["coupons/validate", ["POST"]], ["video/session", ["POST"]], ["admin/staff", ["POST"]], ["admin/compliance", ["POST"]],
  ];
  for (const [endpoint, methods] of endpoints) {
    const route = await isolated(`../app/api/${endpoint}/route.ts`, { ...trusted, ...(endpoint === "waitlist" ? { getSessionUser: async () => ({ id: 9, role: "student", email: "student@example.test" }) } : {}) });
    for (const method of methods) for (const payload of ["null", "[]", '{"large":"' + "x".repeat(40_000) + '"}']) {
      const result = await route[method](new Request(`https://test/api/${endpoint}`, { method, body: payload }));
      assert.ok([400, 413].includes(result.status), `${method} ${endpoint} returned ${result.status}`);
    }
  }
});

test("support attachment download enforces reply visibility and ownership before reading storage", async () => {
  for (const scenario of [
    { role: "student", internal: true, email: "owner@example.test", status: 404 },
    { role: "student", internal: false, email: "owner@example.test", status: 200 },
    { role: "admin", internal: true, email: "staff@example.test", status: 200 },
    { role: "student", internal: false, email: "other@example.test", status: 403 },
    { role: "student", internal: false, email: "owner@example.test", replyTicket: 222, status: 404 },
    { role: "student", internal: true, email: "owner@example.test", scan: "pending", status: 404 },
  ]) {
    let reads = 0;
    const tables = { supportReplyFiles: { id: "file.id" }, supportTickets: { id: "ticket.id", userEmail: "ticket.email" }, supportReplies: { id: "reply.id", ticketId: "reply.ticket", internal: "reply.internal" } };
    const file = { id: 11, ticketId: 77, replyId: 88, objectKey: "private/support/file", contentType: "image/png", originalName: "document.png", scanStatus: scenario.scan || "clean" };
    const rows = new Map([[tables.supportReplyFiles, [file]], [tables.supportTickets, [{ userEmail: "owner@example.test" }]], [tables.supportReplies, [{ internal: scenario.internal, ticketId: scenario.replyTicket || 77 }]]]);
    const inspected = [];
    const db = { select: () => ({ from(table) { return { where(clause) { inspected.push(clause); return { limit: async () => rows.get(table) || [] }; } }; } }) };
    const route = await isolated("../app/api/support/files/[id]/route.ts", { fileScanService: { scanFile: async () => ({ status: file.scanStatus }) }, fileScanBlockedResponse: result => result.status === "clean" ? null : jsonError("pending", 423), fileStorageProvider: () => "local", checkRateLimit: async () => true, ...tables, jsonError, getDb: () => db, eq: (column, value) => ({ column, value }), getSessionUser: async () => ({ role: scenario.role, email: scenario.email }), getObject: async () => { reads += 1; return { body: new Uint8Array([1]) }; } });
    const result = await route.GET(new Request("https://test/api/support/files/11"), { params: Promise.resolve({ id: "11" }) });
    assert.equal(result.status, scenario.status, JSON.stringify(scenario));
    assert.equal(reads, scenario.status === 200 ? 1 : 0);
    if (scenario.status !== 403) assert.ok(inspected.some(item => item.column === "reply.id" && item.value === 88));
  }
});

test("staff privilege changes cannot bypass the configured administrator step-up", async () => {
  class AdminMfaError extends Error { constructor() { super("verification required"); this.code = "MFA_STEP_UP_REQUIRED"; this.status = 428; } }
  let verified = 0;
  const route = await isolated("../app/api/admin/staff/route.ts", { ...trusted, AdminMfaError, requireAdminStepUp: async () => { verified += 1; throw new AdminMfaError(); }, readBoundedJsonObject: async () => { throw new Error("payload read before authentication"); } });
  const response = await route.POST(new Request("https://test/api/admin/staff", { method: "POST", body: "{}" }));
  assert.equal(response.status, 428);
  assert.equal((await response.json()).code, "MFA_STEP_UP_REQUIRED");
  assert.equal(verified, 1);
});

test("supervisor writes are rate limited separately from reads before parsing or saving", async () => {
  const checked = [];
  const route = await isolated("../app/api/supervisor/workspace/route.ts", { ...trusted, checkRateLimit: async (key) => { checked.push(key); return false; }, readBoundedJsonObject: async () => { throw new Error("payload read despite rate limit"); } });
  const response = await route.POST(new Request("https://test/api/supervisor/workspace", { method: "POST", body: "{}" }));
  assert.equal(response.status, 429);
  assert.deepEqual(checked, ["supervisor-workspace-write"]);
});
test("numeric request fields never invoke object coercion and reject invalid IDs, ratings and times", async () => {
  const poison = JSON.parse('{"toString":null,"valueOf":null}');
  assert.ok(Number.isNaN(primitives.finiteNumber(poison)));
  assert.ok(Number.isNaN(primitives.finiteNumber([12])));
  assert.ok(Number.isNaN(primitives.finiteNumber(true)));
  assert.equal(primitives.finiteNumber("42"), 42);
  assert.equal(primitives.finiteNumber(42), 42);
  assert.equal(primitives.finiteNumber(null, 0), 0);
  const scenarios = [
    ["profile/sessions", "DELETE", { id: poison }],
    ["profile/sessions", "DELETE", { id: 2.5 }],
    ["supervisor/requests", "PATCH", { id: poison, status: "reviewing" }],
    ["supervisor/workspace", "POST", { action: "saveUnit", position: poison }],
    ["supervisor/workspace", "POST", { action: "saveLesson", durationSeconds: poison }],
    ["supervisor/workspace", "POST", { action: "saveLesson", unitId: poison }],
    ["support", "POST", { ticketId: poison }],
    ["support", "PATCH", { ticketId: poison, action: "reopen" }],
    ["support", "DELETE", { ticketId: poison }],
    ["reviews", "POST", { courseSlug: "physics", rating: poison, body: "A detailed course review." }],
    ["reviews", "POST", { courseSlug: "physics", rating: 2.5, body: "A detailed course review." }],
    ["progress", "POST", { courseSlug: "physics", lessonId: "velocity", watchedSeconds: poison }],
  ];
  for (const [path, method, payload] of scenarios) {
    const route = await isolated(`../app/api/${path}/route.ts`, { ...trusted, getCourseCatalog: async () => ({}), deleteStoredMultipartFiles: async () => {} });
    const result = await route[method](new Request(`https://test/api/${path}`, { method, body: JSON.stringify(payload) }));
    assert.equal(result.status, 400, `${method} ${path}`);
  }
  const ticket = { id: 77, userEmail: "admin@example.test", status: "closed" };
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [ticket] }) }) }) };
  const support = await isolated("../app/api/support/route.ts", { ...trusted, getDb: () => db, supportTickets: { id: "id" }, eq: () => ({}) });
  const result = await support.PATCH(new Request("https://test/api/support", { method: "PATCH", body: JSON.stringify({ ticketId: 77, action: "rate", rating: poison }) }));
  assert.equal(result.status, 400);
});

test("the separately authenticated staff machine integration does not require browser MFA", async () => {
  let bodyReads = 0;
  const route = await isolated("../app/api/admin/staff/route.ts", { ...trusted, isAdminRequest: () => true, sameOriginRequest: () => { throw new Error("machine integration must not require an Origin"); }, getSessionUser: async () => { throw new Error("unexpected browser session lookup"); }, requireAdminStepUp: async () => { throw new Error("unexpected browser MFA check"); }, readBoundedJsonObject: async () => { bodyReads += 1; throw new Error("invalid body"); } });
  const result = await route.POST(new Request("https://test/api/admin/staff", { method: "POST", body: "null" }));
  assert.equal(result.status, 400);
  assert.equal(bodyReads, 1);
});