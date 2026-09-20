import assert from "node:assert/strict";
import test from "node:test";
import { pureSource } from "./helpers/pure-source.mjs";

// Execute the real handlers. Only database/transport boundaries are synthetic;
// this fixture deliberately refuses joins with data rather than faking SQL joins.
const names = ["favorites", "courseAccess", "lessonProgress", "orders", "invoices", "courseRequests",
  "notificationReads", "notificationsDb", "supportTickets", "supportReplies", "users", "authSessions",
  "courseRequestFiles", "supportReplyFiles", "lessonNotes", "storeCourseGrants", "courseReviews",
  "passwordResetTokens", "pushDevices", "supervisorAssignments", "auditLogs"];
const tables = Object.fromEntries(names.map(name => [name,
  new Proxy({ _name: name }, { get: (target, key) => key === "_name" ? target._name : { table: name, key } }),
]));
const eq = (column, value) => row => row[column.key] != null && row[column.key] === value;
const and = (...clauses) => row => clauses.filter(Boolean).every(clause => clause(row));
const or = (...clauses) => row => clauses.filter(Boolean).some(clause => clause(row));
const gt = (column, value) => row => row[column.key] > value;
const lte = (column, value) => row => row[column.key] <= value;
const isNull = column => row => row[column.key] == null;
const inArray = (column, values) => row => values.includes(row[column.key]);
const sql = (strings, ...values) => ({ text: strings.join("?"), values });
const primitives = { eq, and, or, gt, lte, isNull, inArray, sql, desc: column => column };
function database(initial) {
  const rows = Object.fromEntries(names.map(name => [name, structuredClone(initial[name] || [])]));
  const conflicts = [], writes = [];
  const project = (row, fields) => fields ? Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[column.key]])) : { ...row };
  const deferred = run => ({ then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject) });
  const db = {
    rows, conflicts, writes,
    select: fields => ({ from(table) {
      let predicate = () => true, limit = Infinity;
      const query = {
        where(value) { predicate = value; return query; }, limit(value) { limit = value; return query; },
        orderBy() { return query; }, for() { return query; },
        innerJoin() { assert.equal(rows[table._name].length, 0, "nonempty joins require a real PostgreSQL test"); return query; },
        leftJoin() { assert.equal(rows[table._name].length, 0, "nonempty joins require a real PostgreSQL test"); return query; },
        then(resolve, reject) { return Promise.resolve().then(() => rows[table._name].filter(predicate).slice(0, limit).map(row => project(row, fields))).then(resolve, reject); },
      };
      return query;
    } }),
    insert: table => ({ values(value) {
      let target = [];
      const query = deferred(() => {
        const selected = rows[table._name];
        if (target.length && selected.some(row => target.every(column => row[column.key] === value[column.key]))) return;
        selected.push({ id: selected.length + 1000, ...value });
        writes.push(table._name);
      });
      query.onConflictDoNothing = options => { target = options?.target || []; conflicts.push(target.map(column => column.key)); return query; };
      return query;
    } }),
    delete: table => ({ where: predicate => deferred(() => {
      rows[table._name] = rows[table._name].filter(row => !predicate(row));
      writes.push(table._name);
    }) }),
    update: table => ({ set: values => ({ where: predicate => deferred(() => {
      for (const row of rows[table._name].filter(predicate)) Object.assign(row, values);
      writes.push(table._name);
    }) }) }),
    execute: async query => { assert.match(query.text, /pg_advisory_xact_lock/); },
    transaction: async callback => callback(db),
  };
  return db;
}
const oldEmail = "reused@example.test";
const changed = { id: 1, email: "changed@example.test", role: "student", status: "active", passwordHash: "fixture" };
const reused = { id: 2, email: oldEmail, role: "student", status: "active", passwordHash: "fixture" };
const requestBody = await pureSource("lib/request-body.ts");
const jsonError = (error, status = 400) => Response.json({ ok: false, error }, { status });
const cleanText = (value, maximum) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
function request(method = "GET", payload) {
  return new Request("https://maras-qa.example/api/mobile/fixture", {
    method, ...(payload === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
  });
}
async function handler(path, user, db, dependencies = {}) {
  return pureSource(path, {
    ...tables, ...primitives, ...requestBody, jsonError, cleanText, getDb: () => db,
    getSessionUser: async () => user, isMobileRequest: () => true, checkRateLimit: async () => true,
    mobileNoStoreHeaders: { "cache-control": "no-store" }, getCourseCatalog: async slug => slug ? { slug } : null,
    ...dependencies,
  });
}

test("mobile favorites follow the stable owner after email changes and never adopt unresolved or reused-email rows", async () => {
  const db = database({ favorites: [
    { id: 11, userId: 1, userEmail: oldEmail, courseSlug: "owner-a" },
    { id: 12, userId: 2, userEmail: oldEmail, courseSlug: "owner-b" },
    { id: 13, userId: null, userEmail: oldEmail, courseSlug: "unresolved" },
  ] });
  for (const [user, expected] of [[changed, ["owner-a"]], [reused, ["owner-b"]]]) {
    const route = await handler("app/api/mobile/favorites/route.ts", user, db);
    const response = await route.GET(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual((await response.json()).courseSlugs, expected);
  }
});
test("mobile favorite removal cannot delete another owner's or unbound legacy favorite with the same email and course", async () => {
  const db = database({ favorites: [1, 2, null].map((userId, index) => ({ id: index + 1, userId, userEmail: oldEmail, courseSlug: "shared" })) });
  const route = await handler("app/api/mobile/favorites/route.ts", reused, db);
  assert.equal((await route.POST(request("POST", { courseSlug: "shared", active: false }))).status, 200);
  assert.deepEqual(db.rows.favorites.map(row => row.userId), [1, null]);
});
test("mobile favorite creation stores userId, uses the owner unique key and remains idempotent across an email change", async () => {
  const db = database({});
  for (const user of [{ ...changed, email: oldEmail }, changed, reused]) {
    const route = await handler("app/api/mobile/favorites/route.ts", user, db);
    assert.equal((await route.POST(request("POST", { courseSlug: "shared", active: true, userId: 99 }))).status, 200);
  }
  assert.deepEqual(db.rows.favorites.map(row => row.userId), [1, 2]);
  assert.ok(db.conflicts.every(target => JSON.stringify(target) === JSON.stringify(["userId", "courseSlug"])));
});
test("invalid or oversized favorite bodies and anonymous sessions cause no writes", async () => {
  const db = database({});
  const route = await handler("app/api/mobile/favorites/route.ts", reused, db);
  for (const payload of [null, [], { courseSlug: "x".repeat(20_000) }]) {
    assert.equal((await route.POST(request("POST", payload))).status, 400);
  }
  const anonymous = await handler("app/api/mobile/favorites/route.ts", null, db);
  assert.equal((await anonymous.GET(request())).status, 401);
  assert.equal((await anonymous.POST(request("POST", { courseSlug: "shared" }))).status, 401);
  assert.equal(db.writes.length, 0);
});
test("mobile dashboard scopes access, progress, support tickets and replies by ID before pagination", async () => {
  const base = [
    { id: 1, userId: 1, userEmail: oldEmail, courseSlug: "a", lessonId: 11 },
    { id: 2, userId: 2, userEmail: oldEmail, courseSlug: "b", lessonId: 22 },
    { id: 3, userId: null, userEmail: oldEmail, courseSlug: "unresolved", lessonId: 33 },
  ];
  const db = database({
    courseAccess: base.map(row => ({ ...row, source: "manual", startsAt: "2020-01-01", expiresAt: null })),
    lessonProgress: base.map(row => ({ ...row, completed: true, updatedAt: "2026-01-01" })),
    supportTickets: [...Array.from({ length: 60 }, (_, index) => ({ id: 100 + index, userId: 99, userEmail: oldEmail })), ...base],
    supportReplies: base.flatMap(row => [
      { id: row.id * 10, ticketId: row.id, internal: false, body: `public-${row.id}` },
      { id: row.id * 10 + 1, ticketId: row.id, internal: true, body: "internal-only" },
    ]),
  });
  const courses = base.map(row => ({ slug: row.courseSlug, title: row.courseSlug, units: [{ lessons: [{ id: row.lessonId, ready: true }] }] }));
  for (const user of [changed, reused]) {
    const route = await handler("app/api/mobile/dashboard/route.ts", user, db, {
      notificationRecipientWhere: () => () => false, effectiveAccessRows: async rows => rows,
      getCoursesCatalog: async () => courses, getInstitutionsCatalog: async () => [], getRecommendedCourses: async () => [],
    });
    const response = await route.GET(request());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.owned.map(row => row.slug), [user.id === 1 ? "a" : "b"]);
    assert.deepEqual(body.progress.map(row => row.userId), [user.id]);
    assert.deepEqual(body.tickets.map(row => row.userId), [user.id]);
    assert.deepEqual(body.tickets[0].replies.map(row => row.body), [`public-${user.id}`]);
  }
});
function accountFixture() {
  const seed = {
    users: [changed, reused],
    authSessions: [changed, reused].map(user => ({ id: user.id, userId: user.id, tokenHash: `token-${user.id}`, revokedAt: null, expiresAt: "2099-01-01" })),
  };
  for (const name of ["favorites", "courseAccess", "lessonProgress", "lessonNotes", "courseReviews", "storeCourseGrants", "supportTickets", "courseRequests"]) {
    seed[name] = [1, 2, null].map((userId, index) => ({ id: index + 1, userId, userEmail: oldEmail, courseSlug: "shared" }));
  }
  seed.supportReplies = [1, 2, 3].map(id => ({ id: id * 10, ticketId: id }));
  seed.supportReplyFiles = [1, 2, 3].map(id => ({ id, ticketId: id, replyId: id * 10, objectKey: `support/${id}` }));
  seed.courseRequestFiles = [1, 2, 3].map(id => ({ id, requestId: id, objectKey: `requests/${id}` }));
  return database(seed);
}
async function accountHandler(user, db, removed, dependencies = {}) {
  return handler("app/api/mobile/account/route.ts", user, db, {
    verifyPassword: async value => value === "correct", requestSessionToken: () => `token-${user.id}`,
    hashOpaqueToken: async value => value, deleteObject: async key => { removed.push(key); }, ...dependencies,
  });
}
for (const user of [changed, reused]) {
  test(`account ${user.id} deletion preserves every other owner's and unresolved email record, including their files`, async () => {
    const db = accountFixture(), removed = [];
    const route = await accountHandler(user, db, removed);
    const response = await route.DELETE(request("DELETE", { confirmation: "حذف حسابي", password: "correct" }));
    assert.equal(response.status, 200);
    const expected = [1, 2, null].filter(id => id !== user.id);
    for (const name of ["favorites", "courseAccess", "lessonProgress", "lessonNotes", "courseReviews", "supportTickets", "courseRequests"]) {
      assert.deepEqual(db.rows[name].map(row => row.userId), expected, name);
    }
    assert.deepEqual(removed.sort(), [`requests/${user.id}`, `support/${user.id}`]);
    assert.equal(db.rows.storeCourseGrants.find(row => row.userId === user.id).userEmail.startsWith("deleted+"), true);
    for (const id of expected) assert.equal(db.rows.storeCourseGrants.find(row => row.userId === id).userEmail, oldEmail);
    assert.equal(db.rows.users.find(row => row.id === user.id).status, "deleted");
    assert.equal(db.rows.users.find(row => row.id !== user.id).status, "active");
  });
}
test("password rejection or a revoked session cannot delete any account records or files", async () => {
  for (const failure of ["password", "session"]) {
    const db = accountFixture(), removed = [];
    if (failure === "session") db.rows.authSessions[1].revokedAt = "2026-01-01";
    const before = structuredClone(db.rows);
    const route = await accountHandler(reused, db, removed);
    const response = await route.DELETE(request("DELETE", { confirmation: "حذف حسابي", password: failure === "password" ? "wrong" : "correct" }));
    assert.equal(response.status, 401);
    assert.deepEqual(db.rows, before);
    assert.deepEqual(removed, []);
  }
});
