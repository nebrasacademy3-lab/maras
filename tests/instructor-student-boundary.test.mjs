import assert from "node:assert/strict";
import test from "node:test";
import { isolated } from "./helpers/business-fixtures.mjs";
const policy = await isolated("../lib/student-workspace-policy.ts"), api = await isolated("../lib/api.ts");
const user = { id: 9, role: "instructor", email: "synthetic@example.test", emailVerified: true, profileCompleted: true, onboardingCompleted: true, fullName: "Synthetic Account", phone: "+966512345678", universitySlug: "synthetic", specialty: "Synthetic", academicLevel: "1" };
const paths = {
 "checkout": ["GET", "POST"], "ai/subscription/checkout": ["GET", "POST"], "cart": ["GET", "POST"], "favorites": ["GET", "POST"], "progress": ["GET", "POST"], "waitlist": ["GET", "POST", "DELETE"], "course-requests": ["GET", "POST"], "course-requests/[id]/files": ["GET"], "course-requests/files/[fileId]": ["GET"], "coupons/validate": ["POST"], "learning-tracks/interest": ["GET", "POST", "DELETE"], "invoices/[orderNumber]/download": ["GET"], "reviews": ["POST"], "profile": ["PATCH"], "profile/onboarding": ["POST"], "course-resources/[id]/study": ["POST"],
 "ai/status": ["GET"], "ai/files": ["POST"], "ai/files/resumable": ["GET", "POST", "PUT", "DELETE"], "ai/files/[id]/actions": ["POST"], "ai/jobs/[id]": ["GET", "PATCH"], "ai/quizzes/[id]": ["GET"], "ai/quizzes/[id]/attempts": ["POST"], "ai/conversations": ["GET", "POST"], "ai/conversations/[id]": ["GET", "PATCH", "DELETE"], "ai/conversations/[id]/messages": ["POST"], "ai/artifacts/[id]/download": ["GET"],
};
test("instructor sessions receive explicit403 from student/payment APIs before data, provider, file or purchase work", async () => {
 let checked = 0;
 const io = () => { throw new Error("Protected operation must not run"); };
 for (const [path, methods] of Object.entries(paths)) {
  const route = await isolated("../app/api/" + path + "/route.ts", { ...policy, ...api, getSessionUser: async () => user, sameOriginRequest: () => true, isNativeAppRequest: () => true, isMobileRequest: () => true, checkRateLimit: async () => true, getDb: io, fetch: io, readBoundedJsonObject: io, isAdminRequest: () => false, observeRequest: (_request, _name, run) => run("synthetic"), aiJson: (value, init) => Response.json(value, init), aiError: error => { throw error; } });
  for (const method of methods) {
   assert.equal(typeof route[method], "function", path + " " + method);
   const response = await route[method](new Request("https://example.test/api/" + path.replace(/\[[^\]]+\]/g, "1"), { method, ...(method === "GET" ? {} : { body: "{}" }) }), { params: Promise.resolve({ id: "1", fileId: "1", orderNumber: "synthetic" }) });
   assert.equal(response.status, 403, path + " " + method); const result = await response.json(); assert.equal(result.code, "STUDENT_WORKSPACE_REQUIRED", path); assert.equal(result.next, "/instructor"); checked++;
  }
 }
 assert.ok(checked >= 40);
});
test("student policy preserves existing student/staff behavior and purchase readiness never accepts an instructor academic profile", async () => {
 for (const role of ["student", "admin", "supervisor"]) assert.equal(policy.studentWorkspaceRequirementResponse({ role }), null);
 assert.equal(policy.studentWorkspaceRequirementResponse(null), null);
 const readiness = await isolated("../lib/account-readiness.ts");
 assert.equal(readiness.purchaseRequirement(user).code, "STUDENT_WORKSPACE_REQUIRED"); assert.equal(readiness.purchaseRequirement({ ...user, role: "student" }), null);
});
test("shared own-profile read remains available while academic profile writes are denied", async () => {
 const route = await isolated("../app/api/profile/route.ts", { ...policy, ...api, getSessionUser: async () => user });
 const response = await route.GET(new Request("https://example.test/api/profile")); assert.equal(response.status, 200); assert.equal((await response.json()).user.id, user.id);
});
test("student server pages redirect instructor directly to workspace without academic onboarding", async () => {
 const auth = await isolated("../lib/server-auth.ts", { headers: async () => new Headers(), getSessionUserFromHeaders: async () => ({ ...user, profileCompleted: false }), redirect: path => { throw Object.assign(new Error("redirect"), { path }); } });
 for (const path of ["/dashboard", "/cart", "/study-tools", "/learn/synthetic", "/onboarding"]) await assert.rejects(auth.requireUser(path), { path: "/instructor" });
});

test("an instructor cannot reuse a student paid-video token or resource grant; public course metadata remains separate", async () => {
 const context = { ...policy, ...api, getSessionUser: async () => user, sameOriginRequest: () => true, isNativeAppRequest: () => true };
 const resource = await isolated("../lib/course-resource-access.ts", { ...context, getContentViewMode: async () => { throw new Error("Cannot reach student entitlement policy"); } });
 const resourceResult = await resource.authorizeCourseResourceRequest(new Request("https://example.test/api/course-resources/1"), "synthetic"); assert.equal(resourceResult.ok, false); assert.equal(resourceResult.response.status, 403);
 const route = await isolated("../app/api/video/session/route.ts", { ...context, process: { env: { VIDEO_SIGNING_SECRET: "synthetic-video-secret-long-enough" } }, isMobileRequest: () => true, readBoundedJsonObject: async () => ({ courseSlug: "synthetic", lessonId: "paid" }), checkRateLimit: async () => true, getCourseCatalog: async () => ({ units: [{ lessons: [{ id: "paid", free: false }] }] }), getDb: () => { throw new Error("Must deny before querying student access or minting token"); } });
 const response = await route.POST(new Request("https://example.test/api/video/session", { method: "POST", body: "{}" })); assert.equal(response.status, 403); assert.equal((await response.json()).code, "STUDENT_WORKSPACE_REQUIRED");
 let reads = 0; const video = await isolated("../lib/video-access.ts", { ...context, process: { env: { VIDEO_SIGNING_SECRET: "synthetic-long-secret" } }, verifyVideoToken: async () => ({ lessonId: "paid", courseSlug: "synthetic", email: user.email, client: "web" }), lessonsDb: { id: "id", courseSlug: "courseSlug", status: "status", freePreview: "freePreview", videoAssetId: "videoAssetId" }, and: () => true, eq: () => true, getContentViewMode: async () => "both", contentViewModeError: () => null, getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => { assert.equal(reads++, 0, "must not query student access after role denial"); return [{ freePreview: false, videoAssetId: 1 }]; } }) }) }) }) });
 const denied = await video.authorizeVideoRequest(new Request("https://example.test/api/video/paid"), "paid", "synthetic", "synthetic-valid-token"); assert.equal(denied.ok, false); assert.equal(denied.response.status, 403);
});
