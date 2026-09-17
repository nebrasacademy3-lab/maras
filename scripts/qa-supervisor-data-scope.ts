/** Real authorization, SQL pagination and route integration; disposable loopback database only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const parsed = new URL(local.url);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/maras_qa" || process.env.DATABASE_URL !== local.url) throw new Error("Dedicated loopback maras_qa required");
for (const key of ["GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "RESEND_API_KEY", "TAP_SECRET_KEY", "S3_BUCKET", "BUCKET"]) if (process.env[key]) throw new Error("Production credentials prohibited");
process.env.APP_URL = "https://maras-qa.example";
const [{ getDb, closeDb }, s, auth, scope, mutation, consoleRoute, studentRoute, roster, devices, resources, signing, support, supportFile, requests, requestFile, requestZip, workspace, mfa, catalog, legacyRequests] = await Promise.all([
  import("../db"), import("../db/schema"), import("../lib/auth"), import("../lib/supervisor-data-scope"), import("../lib/supervisor-console-policy"),
  import("../app/api/admin/console/route"), import("../app/api/admin/students/[email]/route"), import("../app/api/admin/courses/[slug]/route"),
  import("../app/api/admin/students/[email]/devices/route"), import("../app/api/admin/course-resources/route"), import("../app/api/admin/videos/direct/route"),
  import("../app/api/support/route"), import("../app/api/support/files/[id]/route"), import("../app/api/supervisor/requests/route"),
  import("../app/api/supervisor/request-files/[id]/route"), import("../app/api/admin/course-requests/[id]/download/route"),
  import("../app/api/supervisor/workspace/route"), import("../lib/admin-mfa"), import("../lib/catalog-store"), import("../app/api/course-requests/route"),
]);
const db = getDb(), nonce = randomUUID().slice(0, 8), now = new Date().toISOString();
const instA = `qa-scope-a-${nonce}`, instB = `qa-scope-b-${nonce}`, special = `qa-scope-${nonce}`, specialName = `علوم ${nonce}`;
const courseA = `${instA}-course`, courseB = `${instB}-course`;
const ownerId = (JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8")) as { users: { id: number; role: string }[] }).users.find(user => user.role === "admin")!.id;
const checks: string[] = [];
let ownerFactor: number | null = null;
const pass = (name: string) => { checks.push(name); console.log("PASS SCOPE", name); };
type Actor = { id: number; email: string; role: string; token: string; step?: string };
function request(path: string, actor?: Actor, body?: unknown, method?: string) {
  return new Request(process.env.APP_URL + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { origin: process.env.APP_URL!, "user-agent": "Synthetic scope QA", "content-type": "application/json", "x-meras-device-id": `scope-qa-${nonce}`, ...(actor ? { cookie: `${auth.SESSION_COOKIE}=${actor.token}${actor.step ? `; ${mfa.ADMIN_STEP_UP_COOKIE}=${actor.step}` : ""}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function actor(label: string, role = "supervisor", institution = instA): Promise<Actor> {
  const [row] = await db.insert(s.users).values({ email: `scope-${nonce}-${label}@example.test`, fullName: `اختبار نطاق ${label}`, role, status: "active", universitySlug: institution, specialty: specialName, emailVerifiedAt: now, profileCompletedAt: now, onboardingCompletedAt: now }).returning();
  const session = await auth.createSession(row.id, request("/api/auth/login"));
  return { ...row, token: session.token };
}
async function grants(user: Actor, permissions: string[]) {
  for (const permission of permissions) await db.insert(s.staffPermissions).values({ userId: user.id, permission, grantedBy: ownerId }).onConflictDoNothing();
}
async function grantScope(user: Actor, institution = instA) {
  return (await db.insert(s.supervisorAssignments).values({ supervisorId: user.id, institutionSlug: institution, specialty: specialName, active: true }).returning())[0];
}
async function stepup(user: Actor) {
  const [factor] = await db.insert(s.adminMfaFactors).values({ userId: user.id, secretEncrypted: mfa.encryptAdminMfaSecret("JBSWY3DPEHPK3PXP"), verifiedAt: now, label: "Synthetic scope QA", counter: -1 }).returning();
  await db.update(s.authSessions).set({ mfaVerifiedAt: now }).where(eq(s.authSessions.userId, user.id));
  const [row] = await db.select().from(s.users).where(eq(s.users.id, user.id));
  user.step = mfa.issueVerifiedAdminStepUp(auth.sessionUserFromRow(row), request("/api/admin/console", user), factor.id).token;
  return factor.id;
}
async function data(response: Response) {
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}
const context = (email: string) => ({ params: Promise.resolve({ email }) });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External network disabled in scope QA"); };
try {
  await db.insert(s.catalogInstitutions).values([instA, instB].map(slug => ({ slug, name: slug, region: "اختبار", type: "أهلية", status: "published" })));
  await db.insert(s.catalogSpecialties).values({ slug: special, name: specialName, status: "published" });
  await db.insert(s.institutionSpecialties).values([instA, instB].map(institutionSlug => ({ institutionSlug, specialtySlug: special, status: "published" })));
  await db.insert(s.catalogCourses).values([{ slug: courseA, institutionSlug: instA }, { slug: courseB, institutionSlug: instB }].map(value => ({ ...value, specialtySlug: special, title: value.slug, description: "مقرر اصطناعي لاختبار نطاقات المنصة", price: 100, status: "published", audienceScope: "specialty" })));
  const [unitA, unitB] = await db.insert(s.courseUnitsDb).values([courseA, courseB].map(courseSlug => ({ courseSlug, title: "وحدة اختبار", status: "published" }))).returning();
  await db.insert(s.lessonsDb).values([{ id: courseA + "-lesson", courseSlug: courseA, unitId: unitA.id }, { id: courseB + "-lesson", courseSlug: courseB, unitId: unitB.id }].map(value => ({ ...value, title: "درس اختبار", status: "published" })));
  const staff = await actor("staff"), secondStaff = await actor("second-staff"), studentA = await actor("student-a", "student"), studentB = await actor("student-b", "student", instB);
  await grants(staff, ["catalog.manage", "students.manage", "students.devices.manage", "finance.manage", "subscriptions.manage", "support.manage", "requests.manage", "records.delete"]);
  await grants(secondStaff, ["requests.manage"]);
  const allPermissionsUser = auth.sessionUserFromRow((await db.select().from(s.users).where(eq(s.users.id, staff.id)))[0]);
  assert.equal(await scope.supervisorScopeId(allPermissionsUser), staff.id);
  const empty = await data(await consoleRoute.GET(request("/api/admin/console?view=students&scope=screen", staff)));
  assert.equal(empty.users.length, 0); assert.equal(empty.pagination.total, 0);
  assert.equal((await studentRoute.GET(request(`/api/admin/students/${studentA.email}`, staff), context(studentA.email))).status, 403);
  assert.equal((await devices.GET(request(`/api/admin/students/${studentA.email}/devices`, staff), context(studentA.email))).status, 404);
  const unassignedWorkspace = await data(await workspace.GET(request("/api/supervisor/workspace", staff)));
  assert.equal(unassignedWorkspace.courses.length, 0);
  pass("finite action grants without a data scope reveal no students, devices, courses or counts");

  const assignment = await grantScope(staff); await grantScope(secondStaff);
  const outside = Array.from({ length: 60 }, (_, index) => ({ email: `scope-${nonce}-other-${index}@example.test`, fullName: "خارج النطاق", role: "student", status: "active", universitySlug: instB, specialty: specialName, createdAt: new Date(Date.now() + index * 1000).toISOString() }));
  await db.insert(s.users).values(outside);
  catalog.invalidateCatalogCache();
  const listing = await data(await consoleRoute.GET(request("/api/admin/console?view=students&scope=screen", staff)));
  assert.deepEqual(listing.users.map((row: { id: number }) => row.id), [studentA.id]);
  assert.equal(listing.pagination.total, 1);
  const overview = await data(await consoleRoute.GET(request("/api/admin/console?view=overview&scope=screen", staff)));
  assert.equal(overview.metrics.students, 1);
  assert.equal(JSON.stringify(listing).includes(studentB.email), false);
  pass("scope filters SQL before pagination and aggregate counts despite sixty newer outsiders");

  const ownNumber = `QA-SCOPE-${nonce}-own`, mixedNumber = `QA-SCOPE-${nonce}-mixed`, otherNumber = `QA-SCOPE-${nonce}-other`;
  await db.insert(s.orders).values([{ orderNumber: ownNumber, customerEmail: studentA.email, courseSlug: courseA }, { orderNumber: mixedNumber, customerEmail: studentA.email, courseSlug: courseA }, { orderNumber: otherNumber, customerEmail: studentB.email, courseSlug: courseB }].map(value => ({ ...value, customerName: "Synthetic", subtotal: 100, total: 100, status: "paid" })));
  await db.insert(s.orderItems).values([{ orderNumber: ownNumber, courseSlug: courseA }, { orderNumber: mixedNumber, courseSlug: courseA }, { orderNumber: mixedNumber, courseSlug: courseB }, { orderNumber: otherNumber, courseSlug: courseB }].map(value => ({ ...value, unitPrice: 100, total: 100 })));
  const orderData = await data(await consoleRoute.GET(request("/api/admin/console?view=orders&scope=screen", staff)));
  assert.deepEqual(orderData.orders.map((row: { orderNumber: string }) => row.orderNumber), [ownNumber]);
  assert.equal(orderData.pagination.total, 1);
  pass("a mixed order cannot disclose other courses through its eligible primary course");

  const [accessA, accessB] = await db.insert(s.courseAccess).values([{ userEmail: studentA.email, courseSlug: courseA }, { userEmail: studentB.email, courseSlug: courseB }, { userEmail: studentB.email, courseSlug: courseA }, { userEmail: studentA.email, courseSlug: courseB }]).returning();
  const ownRoster = await data(await roster.GET(request(`/api/admin/courses/${courseA}`, staff), { params: Promise.resolve({ slug: courseA }) }));
  assert.equal(ownRoster.rows.length, 1); assert.equal(ownRoster.rows[0].student.id, studentA.id); assert.equal(ownRoster.totals.subscriptions, 1);
  assert.equal((await roster.GET(request(`/api/admin/courses/${courseB}`, staff), { params: Promise.resolve({ slug: courseB }) })).status, 403);
  pass("rosters require both course and student scope, including counts");

  const [ticketA, ticketB] = await db.insert(s.supportTickets).values([{ userEmail: studentA.email, ticketNumber: `QA-SCOPE-${nonce}-A` }, { userEmail: studentB.email, ticketNumber: `QA-SCOPE-${nonce}-B` }].map(value => ({ ...value, category: "general", title: "استفسار اختبار", message: "سؤال اصطناعي" }))).returning();
  const [replyB] = await db.insert(s.supportReplies).values({ ticketId: ticketB.id, authorEmail: studentB.email, body: "fixture" }).returning();
  const [attachmentB] = await db.insert(s.supportReplyFiles).values({ ticketId: ticketB.id, replyId: replyB.id, originalName: "fixture.txt", contentType: "text/plain", sizeBytes: 1, objectKey: `qa/${nonce}/outside-support.txt`, scanStatus: "clean" }).returning();
  const supportData = await data(await consoleRoute.GET(request("/api/admin/console?view=support&scope=screen", staff)));
  assert.deepEqual(supportData.tickets.map((row: { id: number }) => row.id), [ticketA.id]); assert.equal(supportData.pagination.total, 1);
  assert.equal((await supportFile.GET(request(`/api/support/files/${attachmentB.id}`, staff), { params: Promise.resolve({ id: String(attachmentB.id) }) })).status, 403);
  assert.equal((await support.PATCH(request("/api/support", staff, { ticketId: ticketB.id, action: "reopen" }, "PATCH"))).status, 404);
  pass("support-only screen uses its own SQL scope, and attachment aliases reject outsiders before storage");

  const internalText = `Internal confidential fixture ${nonce}`;
  const beforeNotices = await db.select().from(s.notificationsDb).where(eq(s.notificationsDb.userEmail, studentA.email));
  assert.equal((await consoleRoute.POST(request("/api/admin/console", staff, { action: "updateTicket", id: ticketA.id, status: ticketA.status, reply: internalText, internal: true }))).status, 200);
  assert.equal((await db.select().from(s.notificationsDb).where(eq(s.notificationsDb.userEmail, studentA.email))).length, beforeNotices.length);
  assert.equal((await consoleRoute.POST(request("/api/admin/console", staff, { action: "updateTicket", id: ticketA.id, status: "closed", reply: internalText, internal: true }))).status, 200);
  const noticesAfter = await db.select().from(s.notificationsDb).where(eq(s.notificationsDb.userEmail, studentA.email));
  assert.equal(noticesAfter.length, beforeNotices.length + 1);
  assert.equal(JSON.stringify(noticesAfter).includes(internalText), false);
  assert.equal((await db.select().from(s.supportReplies).where(and(eq(s.supportReplies.ticketId, ticketA.id), eq(s.supportReplies.internal, true)))).length, 2);
  pass("internal support notes never leak into inbox or push text, even with a simultaneous status change");

  const [requestA, requestB, claimed] = await db.insert(s.courseRequests).values([{ universitySlug: instA, userId: studentA.id }, { universitySlug: instB, userId: studentB.id }, { universitySlug: instA, userId: studentA.id }].map(value => ({ ...value, university: value.universitySlug, specialty: specialName, courseName: "مادة اختبار", name: "طالب اصطناعي", phone: "+966500000000", notify: false }))).returning();
  const [fileB] = await db.insert(s.courseRequestFiles).values({ requestId: requestB.id, userId: studentB.id, originalName: "scope.txt", contentType: "text/plain", sizeBytes: 1, objectKey: `qa/${nonce}/request-b.txt`, scanStatus: "clean" }).returning();
  const ownRequests = await data(await requests.GET(request("/api/supervisor/requests", staff)));
  assert.deepEqual(ownRequests.requests.map((row: { id: number }) => row.id).sort(), [requestA.id, claimed.id].sort());
  assert.equal((await requestFile.GET(request(`/api/supervisor/request-files/${fileB.id}`, staff), { params: Promise.resolve({ id: String(fileB.id) }) })).status, 404);
  assert.equal((await requestZip.GET(request(`/api/admin/course-requests/${requestB.id}/download`, staff), { params: Promise.resolve({ id: String(requestB.id) }) })).status, 404);
  const claims = await Promise.all([staff, secondStaff].map(user => requests.PATCH(request("/api/supervisor/requests", user, { id: claimed.id, status: "assigned" }, "PATCH"))));
  assert.deepEqual(claims.map(response => response.status).sort(), [200, 403]);
  assert.equal((await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityType, "course_request"), eq(s.auditLogs.entityId, String(claimed.id))))).length, 1);
  pass("request attachments use the parent scope and concurrent claims choose one assignee without overwrite");

  const legacy = await data(await legacyRequests.GET(request("/api/course-requests", staff)));
  assert.ok(legacy.requests.every((row: { universitySlug: string }) => row.universitySlug === instA));
  const profile = await data(await studentRoute.GET(request(`/api/admin/students/${studentA.email}`, staff), context(studentA.email)));
  assert.deepEqual(profile.orders.map((row: { orderNumber: string }) => row.orderNumber), [ownNumber]);
  assert.equal(profile.summary.paidValue, 100); assert.equal(profile.pagination.orders.total, 1);
  assert.ok(profile.subscriptions.every((row: { courseSlug: string }) => row.courseSlug === courseA));
  assert.ok(profile.catalog.courses.every((row: { slug: string }) => row.slug === courseA));
  assert.equal(profile.referrals.referred.length, 0); assert.equal(profile.ai.orders.length, 0);
  pass("legacy request list and full student profile obey the same record scope and financial counts");

  const [resourceB] = await db.insert(s.courseResources).values({ courseSlug: courseB, title: "ملف خاص", objectKey: `qa/${nonce}/source.txt`, originalName: "source.txt", contentType: "text/plain", sizeBytes: 1 }).returning();
  const resourceData = await data(await resources.GET(request("/api/admin/course-resources", staff)));
  assert.deepEqual(resourceData.courses.map((row: { slug: string }) => row.slug), [courseA]);
  assert.equal((await resources.GET(request(`/api/admin/course-resources?course=${courseB}`, staff))).status, 403);
  assert.equal((await resources.PATCH(request("/api/admin/course-resources", staff, { action: "update", id: resourceB.id, title: "changed" }, "PATCH"))).status, 403);
  const signResponse = await signing.GET(request(`/api/admin/videos/direct?courseSlug=${courseB}&lessonId=${courseB}-lesson&contentType=video/mp4&sizeBytes=100`, staff));
  assert.equal(signResponse.status, 403);
  pass("file metadata, editing and direct upload signing cannot use another scope");

  const disallowed = [
    { action: "updateUser", id: studentB.id, role: "student", status: "suspended" },
    { action: "updateStudentProfile", id: studentA.id, universitySlug: instB, specialty: specialName },
    { action: "grantAccess", userEmail: studentA.email, courseSlug: courseB },
    { action: "grantAccess", userEmail: studentB.email, courseSlug: courseA },
    { action: "updateAccess", id: accessB.id, operation: "revoke" },
    { action: "saveUnit", id: unitB.id, courseSlug: courseA },
    { action: "saveLesson", id: courseB + "-lesson", courseSlug: courseA },
    { action: "saveCourse", slug: courseB, institutionSlug: instA, specialtySlug: special },
    { action: "saveCourse", slug: courseA, institutionSlug: instB, specialtySlug: special },
    { action: "saveCourse", slug: courseA, institutionSlug: instA, specialtySlug: special, audienceScope: "institution" },
    { action: "updateTicket", id: ticketB.id, status: "closed" },
    { action: "updateRequest", id: requestB.id, status: "declined" },
    { action: "deleteEntity", entityType: "course", entityId: courseB },
    { action: "deleteEntity", entityType: "user", entityId: String(studentB.id) },
  ];
  for (const payload of disallowed) {
    assert.equal(await mutation.supervisorConsoleMutationAllowed(allPermissionsUser, payload), false, payload.action);
    const response = await consoleRoute.POST(request("/api/admin/console", staff, payload));
    assert.equal(response.status, 403, JSON.stringify({ payload, response: await response.json() }));
  }
  for (const payload of [{ action: "saveUnit", id: unitA.id, courseSlug: courseA }, { action: "grantAccess", userEmail: studentA.email, courseSlug: courseA }, { action: "updateAccess", id: accessA.id }]) assert.equal(await mutation.supervisorConsoleMutationAllowed(allPermissionsUser, payload), true);
  assert.equal((await db.select().from(s.users).where(eq(s.users.id, studentB.id)))[0].status, "active");
  pass("fourteen cross-scope mutations reject source IDs and proposed destinations before state changes");

  const sensitive = { action: "updateUser", id: studentA.id, role: "student", status: "suspended" };
  assert.equal((await consoleRoute.POST(request("/api/admin/console", staff, sensitive))).status, 428);
  await stepup(staff);
  assert.equal((await consoleRoute.POST(request("/api/admin/console", staff, sensitive))).status, 200);
  await db.update(s.users).set({ status: "active" }).where(eq(s.users.id, studentA.id));
  pass("in-scope mutations still require MFA, and a valid step-up performs the authorized change");

  await db.update(s.supervisorAssignments).set({ active: false }).where(eq(s.supervisorAssignments.id, assignment.id));
  assert.equal((await studentRoute.GET(request(`/api/admin/students/${studentA.email}`, staff), context(studentA.email))).status, 403);
  assert.equal((await devices.GET(request(`/api/admin/students/${studentA.email}/devices`, staff), context(studentA.email))).status, 404);
  assert.equal((await requests.PATCH(request("/api/supervisor/requests", staff, { id: requestA.id, status: "reviewing" }, "PATCH"))).status, 404);
  pass("revoking a scope blocks the next read, device request and previously visible work item");

  await grants(secondStaff, ["data.all"]);
  const second = auth.sessionUserFromRow((await db.select().from(s.users).where(eq(s.users.id, secondStaff.id)))[0]);
  assert.equal(await scope.supervisorScopeId(second), null);
  const globalRequests = await data(await requests.GET(request("/api/supervisor/requests", secondStaff)));
  assert.ok(globalRequests.requests.some((row: { id: number }) => row.id === requestB.id));
  assert.equal((await studentRoute.GET(request(`/api/admin/students/${studentB.email}`, secondStaff), context(studentB.email))).status, 403);
  pass("explicit global scope widens only data for already granted actions, never student permissions");

  const ownerFixture = (JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8")) as { users: Actor[] }).users.find(user => user.role === "admin")!;
  const [ownerRow] = await db.select().from(s.users).where(eq(s.users.id, ownerId));
  const ownerActor: Actor = { ...ownerRow, token: ownerFixture.token };
  const grantTarget = await actor("scope-edit-target");
  const scopeChange = { action: "saveSupervisorAssignment", supervisorId: grantTarget.id, institutionSlug: instA, specialty: specialName, active: true };
  assert.equal((await consoleRoute.POST(request("/api/admin/console", ownerActor, scopeChange))).status, 428);
  assert.equal((await db.select().from(s.supervisorAssignments).where(eq(s.supervisorAssignments.supervisorId, grantTarget.id))).length, 0);
  assert.equal((await db.select().from(s.adminMfaFactors).where(eq(s.adminMfaFactors.userId, ownerId))).length, 0, "never overwrite an existing owner factor");
  ownerFactor = await stepup(ownerActor);
  const created = await consoleRoute.POST(request("/api/admin/console", ownerActor, scopeChange));
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
  assert.equal(await auth.getSessionUser(request("/api/profile", grantTarget)), null);
  const newAssignment = await created.json();
  grantTarget.token = (await auth.createSession(grantTarget.id, request("/api/auth/login"))).token;
  const changed = await consoleRoute.POST(request("/api/admin/console", ownerActor, { ...scopeChange, id: newAssignment.id, active: false }));
  assert.equal(changed.status, 200);
  assert.equal(await auth.getSessionUser(request("/api/profile", grantTarget)), null);
  assert.equal((await db.select().from(s.supervisorAssignments).where(eq(s.supervisorAssignments.id, newAssignment.id)))[0].active, false);
  assert.equal((await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityType, "supervisor_assignment"), eq(s.auditLogs.entityId, String(newAssignment.id))))).length, 2);
  pass("owner scope changes require MFA and atomically revoke staff sessions and record each grant or withdrawal");

  const report = { passed: checks.length, checks, database: "disposable loopback PostgreSQL", liveProviders: false, boundary: "server routes and SQL, not physical-device execution" };
  writeFileSync(".data/qa-supervisor-scope-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (ownerFactor) await db.delete(s.adminMfaFactors).where(eq(s.adminMfaFactors.id, ownerFactor));
  globalThis.fetch = originalFetch; await closeDb();
}
