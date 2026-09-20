import assert from "node:assert/strict";
import test from "node:test";
import { isolated, sql, eq, or, and, tables, database } from "./helpers/business-fixtures.mjs";
for (const name of ["instructorProfiles", "instructorContracts", "instructorAssignments", "instructorUnits", "instructorLessons", "catalogCourses", "courseResources", "courseUnitsDb", "lessonsDb", "videoAssets"]) tables[name] = new Proxy({ _name: name }, { get(target, key) { return key === "_name" ? target._name : { table: name, key }; } });
const api = await isolated("../lib/api.ts"), policy = await isolated("../lib/instructor-policy.ts"), requestBody = await isolated("../lib/request-body.ts"), resource = await isolated("../lib/course-resource-access.ts");
const actor = { id: 9, role: "instructor", status: "active", emailVerified: true, emailVerifiedAt: "2026-01-01" };
class AdminMfaError extends Error { constructor() { super("MFA required"); this.status = 403; this.code = "MFA_REQUIRED"; } }
async function fixture(options = {}) {
 let user = options.actor === undefined ? actor : options.actor;
 const calls = { get: 0, stepUp: 0, start: [], target: [] };
 const db = database({ users: [actor], instructorProfiles: [{ userId: 9, status: "approved" }], instructorContracts: [{ id: 20, userId: 9, status: options.contractStatus || "signed" }], instructorAssignments: [{ id: 1, userId: 9, contractId: 20, courseSlug: "assigned", status: "in_progress", revision: 3 }], instructorUnits: [{ id: 4, assignmentId: 1, title: "Unit", position: 0 }], instructorLessons: [{ id: 5, unitId: 4, title: "Lesson", videoAssetId: 6 }], videoAssets: [{ id: 6, courseSlug: "instructor-1", lessonId: "draft-5", objectKey: "private/video-source/instructor-1/draft-5/private.upload", sizeBytes: 10, contentType: "video/mp4", status: "ready", storageProvider: "local" }], courseResources: [{ id: 8, courseSlug: "assigned", objectKey: "private/assigned", originalName: "تجربة.pdf", contentType: "application/pdf", sizeBytes: 10, status: "active", scanStatus: "clean" }, { id: 9, courseSlug: "foreign", objectKey: "private/foreign", originalName: "foreign.pdf", contentType: "application/pdf", sizeBytes: 10, status: "active", scanStatus: "clean" }] });
 const inArray = (column, values) => or(...values.map(value => eq(column, value))), getSessionUser = async () => user, sameOriginRequest = request => request.headers.get("origin") === "https://example.test";
 const security = await isolated("../lib/instructor-security.ts", { getSessionUser, requireAdminStepUp: async () => { calls.stepUp++; if (options.stepUp === false) throw new AdminMfaError(); } });
 const onboarding = await isolated("../lib/instructor-onboarding.ts", { ...security, ...policy, ...api, ...requestBody, AdminMfaError, sameOriginRequest, isNativeAppRequest: () => false, sql, eq, ...tables });
 const dependencies = { ...tables, ...api, ...policy, ...requestBody, ...security, ...onboarding, ...resource, sql, eq, and, or, inArray, asc: value => value, getDb: () => db, getSessionUser, checkRateLimit: async () => true, enqueueStorageCleanupTx: async () => [], collectVideoCleanup: () => undefined, invalidateCatalogCache: () => undefined,
  getObject: async (_key, range) => { calls.get++; const bytes = new TextEncoder().encode("0123456789"); return { body: new Response(range ? bytes.slice(range.offset, range.offset + range.length) : bytes).body, size: bytes.length }; },
 };
 const service = await isolated("../lib/instructor-assignments.ts", dependencies); Object.assign(dependencies, service);
 const routes = {};
 for (const [name, path] of Object.entries({ resource: "instructor/assignments/[id]/resources/[resourceId]", video: "instructor/assignments/[id]/videos/[lessonId]", admin: "admin/instructors/assignments", review: "admin/instructors/assignments/[id]" })) routes[name] = await isolated("../app/api/" + path + "/route.ts", dependencies);
 class ResumableUploadError extends Error {}
 routes.upload = await isolated("../app/api/instructor/assignments/[id]/videos/route.ts", { ...dependencies, ResumableUploadError, instructorAssignmentUploadAuthorization: () => async () => 9, instructorAssignmentUploadTarget: (id, revision) => { calls.target.push({ id, revision }); return {}; }, startResumableVideo: async (_db, id, body) => { calls.start.push({ id, body }); return { id: "synthetic-upload" }; } });
 return { db, calls, routes, setActor: value => { user = value; } };
}
const context = values => ({ params: Promise.resolve({ id: "1", ...values }) });
const request = (method = "GET", value, headers = {}) => new Request("https://example.test/api/instructor/assignments/1", { method, headers: { origin: "https://example.test", ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
test("private assignment files reject foreign resources, different instructors and terminated contracts before storage access", async () => {
 const f = await fixture();
 assert.equal((await f.routes.resource.GET(request(), context({ resourceId: "9" }))).status, 404);
 f.setActor({ ...actor, id: 10 }); assert.equal((await f.routes.resource.GET(request(), context({ resourceId: "8" }))).status, 404);
 f.setActor(actor); f.db.rows.instructorContracts[0].status = "terminated";
 assert.equal((await f.routes.resource.GET(request(), context({ resourceId: "8" }))).status, 403); assert.equal(f.calls.get, 0);
});
test("assigned clean file is an attachment with private no-store metadata", async () => {
 const f = await fixture(); const response = await f.routes.resource.GET(request(), context({ resourceId: "8" }));
 assert.equal(response.status, 200); assert.match(response.headers.get("content-disposition"), /^attachment/); assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(await response.text(), "0123456789");
 f.db.rows.courseResources[0].scanStatus = "pending"; assert.equal((await f.routes.resource.GET(request(), context({ resourceId: "8" }))).status, 404);
});
test("video preview ranges are scoped to the exact assigned draft and published references cannot be substituted", async () => {
 const f = await fixture();
 const response = await f.routes.video.GET(request("GET", undefined, { range: "bytes=2-5" }), context({ lessonId: "5" }));
 assert.equal(response.status, 206); assert.equal(response.headers.get("content-range"), "bytes 2-5/10"); assert.equal(await response.text(), "2345");
 const bad = await f.routes.video.GET(request("GET", undefined, { range: "bytes=1-2,5-9" }), context({ lessonId: "5" })); assert.equal(bad.status, 416);
 f.db.rows.videoAssets[0].lessonId = "draft-900"; assert.equal((await f.routes.video.GET(request(), context({ lessonId: "5" }))).status, 409);
 f.db.rows.videoAssets[0].lessonId = "draft-5"; f.db.rows.lessonsDb.push({ id: "published-existing", videoAssetId: 6 });
 assert.equal((await f.routes.video.GET(request(), context({ lessonId: "5" }))).status, 409);
});
test("only the platform owner may review assignment content and writes always require step-up", async () => {
 for (const person of [actor, { ...actor, role: "supervisor" }, { ...actor, role: "admin", isPlatformOwner: false }]) {
  const f = await fixture({ actor: person }); assert.equal((await f.routes.admin.POST(request("POST", { action: "create" }))).status, 403); assert.equal(f.db.writes.length, 0);
 }
 const f = await fixture({ actor: { ...actor, role: "admin", isPlatformOwner: true }, stepUp: false });
 assert.equal((await f.routes.admin.POST(request("POST", { action: "create" }))).status, 403);
 assert.equal((await f.routes.review.POST(request("POST", { action: "publish", expectedRevision: 3, reason: "Synthetic reason" }), context({}))).status, 403); assert.equal(f.calls.stepUp, 2); assert.equal(f.db.writes.length, 0);
});
test("upload route assigns its own namespace and rejects invalid revision and cross-origin requests", async () => {
 const f = await fixture(); const value = { action: "start", lessonId: 5, expectedRevision: 3, courseSlug: "published-other", objectKey: "private/foreign", target: "published" };
 assert.equal((await f.routes.upload.POST(request("POST", value), context({}))).status, 200);
 assert.equal(f.calls.start[0].body.courseSlug, "instructor-1"); assert.equal(f.calls.start[0].body.lessonId, "draft-5"); assert.equal(f.calls.start[0].body.objectKey, undefined); assert.equal(f.calls.start[0].body.target, undefined); assert.deepEqual(f.calls.target, [{ id: 1, revision: 3 }]);
 assert.equal((await f.routes.upload.POST(request("POST", { ...value, expectedRevision: 0 }), context({}))).status, 409);
 assert.equal((await f.routes.upload.POST(request("POST", value, { origin: "https://foreign.test" }), context({}))).status, 403); assert.equal(f.calls.start.length, 1);
});
