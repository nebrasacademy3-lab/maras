import assert from "node:assert/strict";
import test from "node:test";
import { isolated } from "./helpers/business-fixtures.mjs";
const primitives = await isolated("../lib/api.ts");

async function routeFor(user, { origin = true, native = false } = {}) {
  let sessionReads = 0, rateChecks = 0;
  const noSideEffect = () => assert.fail("unauthorized or invalid upload reached a protected side effect");
  const route = await isolated("../app/api/admin/videos/direct/route.ts", {
    ...primitives, process: { env: {} },
    getSessionUser: async request => { assert.equal(new URL(request.url).pathname, "/api/admin/videos/direct"); sessionReads++; return user; },
    roleAllowed: (value, roles) => Boolean(value && roles.includes(value.role)),
    sameOriginRequest: () => origin, isNativeAppRequest: () => native,
    checkRateLimit: async () => { rateChecks++; return true; },
    getDb: noSideEffect, activeStorageProvider: noSideEffect, createDirectUploadUrl: noSideEffect,
    headDirectUpload: noSideEffect, getObject: noSideEffect, getCourseCatalog: noSideEffect,
    deleteObject: noSideEffect, deletePrefix: noSideEffect, enqueueVideoProcessing: noSideEffect,
  });
  return { route, counts: () => ({ sessionReads, rateChecks }) };
}
function request(method, native = false) {
  return new Request("https://maras-qa.example/api/admin/videos/direct", {
    method,
    headers: { ...(native ? { "x-meras-client": "mobile-v1", "x-meras-platform": "android" } : {}), ...(method === "POST" ? { "content-type": "application/json" } : {}) },
    ...(method === "POST" ? { body: "invalid JSON must not be parsed before authorization" } : {}),
  });
}
for (const method of ["GET", "POST"]) {
  test(`${method}: capability-denied sessions and students receive forbidden before parsing or signing`, async () => {
    // The real shared getSessionUser boundary returns null for a staff member
    // missing catalog.manage; its actual grant enforcement is covered in RBAC integration.
    for (const user of [null, { id: 3, role: "student" }]) {
      const h = await routeFor(user), response = await h.route[method](request(method));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, "غير مصرح برفع الفيديو");
      assert.deepEqual(h.counts(), { sessionReads: 1, rateChecks: 0 });
    }
  });
  test(`${method}: native identification alone never grants direct-upload access`, async () => {
    const h = await routeFor(null, { origin: false, native: true });
    assert.equal((await h.route[method](request(method, true))).status, 403);
    assert.deepEqual(h.counts(), { sessionReads: 1, rateChecks: 0 });
  });
  test(`${method}: a foreign non-native request is rejected before the session lookup`, async () => {
    const h = await routeFor({ id: 2, role: "admin" }, { origin: false });
    assert.equal((await h.route[method](request(method))).status, 403);
    assert.deepEqual(h.counts(), { sessionReads: 0, rateChecks: 0 });
  });
  test(`${method}: an authorized supervisor still advances to ordinary upload validation`, async () => {
    const h = await routeFor({ id: 2, role: "supervisor" });
    assert.equal((await h.route[method](request(method))).status, 400);
    assert.deepEqual(h.counts(), { sessionReads: 1, rateChecks: 1 });
  });
}
