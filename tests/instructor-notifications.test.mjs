import assert from "node:assert/strict";
import test from "node:test";
import { isolated } from "./helpers/business-fixtures.mjs";
const links = await isolated("../lib/instructor-notification-links.ts"), api = await isolated("../lib/api.ts"), body = await isolated("../lib/request-body.ts");
test("instructor notification actions allow only known shared/workspace destinations and discard arbitrary redirect data", () => {
 for (const value of ["javascript:alert(1)", "https://outside.test", "//outside.test", "/\\outside.test", "/admin/instructors", "/api/instructor/documents/1", "/checkout", "/dashboard?view=orders", "/learn/course", "/study-tools", "/instructor%2f..%2fadmin", "/%2561dmin", "/instructor\n", null, ""]) assert.equal(links.instructorNotificationHref(value), null, String(value));
 assert.equal(links.instructorNotificationHref("/instructor?tab=contracts&return_to=https://outside.test#untrusted"), "/instructor?tab=contracts");
 assert.equal(links.instructorNotificationHref("/support?redirect=/admin"), "/support");
 assert.equal(links.instructorNotificationHref("/notifications"), "/notifications");
});
const table = name => new Proxy({ table: name }, { get(target, key) { return key === "table" ? name : { table: name, key }; } });
const notificationsDb = table("n"), notificationReads = table("r");
const read = (row, value) => value && typeof value === "object" && "key" in value ? row[value.table]?.[value.key] : value;
const eq = (a,b) => row => read(row,a) === read(row,b), and = (...terms) => row => terms.filter(Boolean).every(term => term(row)), or = (...terms) => row => terms.filter(Boolean).some(term => term(row)), isNull = column => row => read(row,column) == null, lte = (a,b) => row => read(row,a) <= read(row,b), gt = (a,b) => row => read(row,a) > read(row,b);
const visibility = await isolated("../lib/notification-visibility.ts", { notificationsDb, eq, and, or, isNull });
async function fixture() {
 const user = { id: 9, role: "instructor", email: "synthetic@example.test" }, writes = [];
 const base = { userEmail: null, targetUserId: null, presentation: "inbox", startsAt: null, expiresAt: null, createdAt: "2026-09-20", title: "Synthetic", body: "Synthetic" };
 const notices = [
  { ...base, id: 1, targetUserId: 9, audience: "user" }, { ...base, id: 2, targetUserId: 10, audience: "public" },
  { ...base, id: 3, audience: "instructor" }, { ...base, id: 4, audience: "student" }, { ...base, id: 5, audience: "public" },
  { ...base, id: 6, targetUserId: 9, audience: "user", expiresAt: "2000-01-01" }, { ...base, id: 7, targetUserId: 9, audience: "user", startsAt: "2099-01-01" },
  { ...base, id: 8, targetUserId: null, userEmail: user.email, audience: "public" },
 ];
 const reads = [{ notificationId: 1, userId: 10, readAt: "2026-09-20" }];
 const db = {
  select(fields) { return { from() { let predicate = () => true, join = null, take = Infinity; const query = { leftJoin(_table, condition) { join = condition; return query; }, where(condition) { predicate = condition; return query; }, orderBy() { return query; }, limit(value) { take = value; return query; }, then(resolve, reject) { return Promise.resolve().then(() => { const rows = notices.map(n => ({ n, r: join ? reads.find(r => join({ n, r })) : undefined })).filter(predicate).slice(0, take); if (fields.value === "count") return [{ value: rows.length }]; return rows.map(row => Object.fromEntries(Object.entries(fields).map(([key,column]) => [key, column === notificationsDb ? row.n : read(row,column)]))); }).then(resolve, reject); } }; return query; } }; },
  insert() { return { values(values) { return { async onConflictDoUpdate() { for (const value of values) { writes.push(value); const existing = reads.find(row => row.userId === value.userId && row.notificationId === value.notificationId); if (existing) Object.assign(existing,value); else reads.push(value); } } }; } }; },
  transaction: async callback => callback(db),
 };
 let sessions = 0;
 const route = await isolated("../app/api/mobile/notifications/route.ts", { ...api, ...body, ...visibility, notificationsDb, notificationReads, eq, and, or, isNull, lte, gt, desc: column => column, count: () => "count", getDb: () => db, getSessionUser: async () => { sessions++; return user; }, checkRateLimit: async () => true, sameOriginRequest: request => request.headers.get("origin") === "https://example.test", mobileNoStoreHeaders: { "cache-control": "private, no-store" } });
 const request = (value, headers = {}) => new Request("https://example.test/api/mobile/notifications", { method: "PATCH", headers: { origin: "https://example.test", ...headers }, body: typeof value === "string" ? value : JSON.stringify(value) });
 return { route, request, writes, reads, sessions: () => sessions };
}
test("instructor inbox exposes only own current notices and instructor/public broadcasts; other users' read state is isolated", async () => {
 const f = await fixture(); const response = await f.route.GET(new Request("https://example.test/api/mobile/notifications"));
 assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.ownerId, 9); assert.equal(data.unreadCount, 3); assert.deepEqual(data.notifications.map(row => row.id), [1,3,5]); assert.equal(data.notifications[0].readAt, undefined);
});
test("single/all read writes never reach another recipient, student broadcasts, expired or future notices", async () => {
 const f = await fixture();
 for (const id of [2,4,6,7,8]) assert.equal((await f.route.PATCH(f.request({ id }))).status, 404);
 assert.equal(f.writes.length, 0);
 const response = await f.route.PATCH(f.request({ all: true })); const data = await response.json(); assert.equal(response.status, 200); assert.deepEqual(data.markedIds, [1,3,5]); assert.equal(data.unreadCount, 0); assert.ok(f.writes.every(row => row.userId === 9)); assert.equal(f.reads.find(row => row.userId === 10).readAt, "2026-09-20");
});
test("notification mutations reject foreign origins, account switches, unsafe IDs and oversized payloads", async () => {
 const f = await fixture();
 assert.equal((await f.route.PATCH(f.request({ all: true }, { origin: "https://foreign.test" }))).status, 403);
 assert.equal((await f.route.PATCH(f.request({ all: true }, { "x-meras-acting-user": "10" }))).status, 409);
 assert.equal((await f.route.GET(new Request("https://example.test/api/mobile/notifications", { headers: { "x-meras-acting-user": "10" } }))).status, 409);
 for (const id of [-1, 1.5, 0, "NaN", Number.MAX_SAFE_INTEGER + 1]) assert.equal((await f.route.PATCH(f.request({ id }))).status, 400);
 assert.equal((await f.route.PATCH(f.request(JSON.stringify({ all: true, huge: "x".repeat(4096) })))).status, 400); assert.equal(f.writes.length, 0);
});
