import assert from "node:assert/strict";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function isolated(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__emailSecurity" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    const javascript = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    return await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
  } finally { delete globalThis[key]; }
}
function database(initial = {}) {
  const names = ["users", "emailVerificationCodes", "authSessions", "passwordResetTokens", "pushDevices"];
  const tables = Object.fromEntries(names.map(name => [name, new Proxy({ tableName: name }, { get: (target, key) => key in target ? target[key] : { table: name, key } })]));
  const rows = Object.fromEntries(names.map(name => [name, structuredClone(initial[name] || [])]));
  const read = (column, row) => typeof column === "object" && column && "key" in column ? row[column.key] : column;
  const eq = (a, b) => row => read(a, row) === read(b, row);
  const ne = (a, b) => row => read(a, row) !== read(b, row);
  const gt = (a, b) => row => read(a, row) > read(b, row);
  const and = (...filters) => row => filters.filter(Boolean).every(fn => fn(row));
  const isNull = a => row => read(a, row) == null;
  const desc = column => column.key;
  let queue = Promise.resolve(); const operations = [];
  const db = {
    async execute() {},
    transaction: async callback => {
      const previous = queue; let release;
      queue = new Promise(resolve => { release = resolve; }); await previous;
      const snapshot = structuredClone(rows);
      try { const result = await callback(db); operations.push("commit"); return result; }
      catch (error) { Object.assign(rows, snapshot); operations.push("rollback"); throw error; }
      finally { release(); }
    },
    select: projection => query("select", null, projection),
    update: table => query("update", table),
    insert: table => query("insert", table),
  };
  function query(kind, table, projection) {
    let where = () => true, values, ordering, limit = Infinity, promise;
    const chain = {
      from(value) { table = value; return chain; },
      where(value) { where = value; return chain; },
      values(value) { values = value; return chain; },
      set(value) { values = value; return chain; },
      orderBy(value) { ordering = value; return chain; },
      limit(value) { limit = value; return chain; },
      returning(value) { projection = value; return chain; },
      then(yes, no) {
        promise ||= Promise.resolve().then(() => {
          const items = rows[table.tableName]; let chosen;
          if (kind === "insert") {
            const row = { id: Math.max(0, ...items.map(item => item.id || 0)) + 1, attempts: 0, usedAt: null, sentAt: null, ...values };
            items.push(row); chosen = [row]; operations.push("insert:" + table.tableName);
          } else {
            chosen = items.filter(where);
            if (ordering) chosen.sort((a, b) => a[ordering] < b[ordering] ? 1 : -1);
            chosen = chosen.slice(0, limit);
            if (kind === "update") { chosen.forEach(row => Object.assign(row, values)); operations.push("update:" + table.tableName); }
          }
          if (projection) return chosen.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.key]])));
          return structuredClone(chosen);
        });
        return promise.then(yes, no);
      },
    };
    return chain;
  }
  return { db, rows, tables, operations, eq, ne, gt, and, isNull, desc, sql: () => ({}) };
}
const baseUser = { id: 1, email: "student@example.com", fullName: "طالب مراس", role: "student", status: "active", emailVerifiedAt: null, passwordHash: "old-password", phone: "+966512345678", universitySlug: "university", specialty: "science", academicLevel: "1", profileCompletedAt: "done", onboardingCompletedAt: "done" };
const request = (body = {}) => new Request("https://meras.example/api/auth/email-verification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
async function setup(initial = {}, options = {}) {
  const memory = database({ users: [baseUser], ...initial });
  const emails = []; const env = { SESSION_SECRET: "independent-test-secret-not-a-real-key-1234567890" };
  class EmailDeliveryError extends Error { constructor() { super("delivery unavailable"); this.status = 503; this.code = "EMAIL_DELIVERY_FAILED"; } }
  const dependencies = {
    createHmac, randomBytes, timingSafeEqual, randomInt: (min, max) => { assert.equal(min, 0); assert.equal(max, 1_000_000); return 42; },
    ...memory.tables, and: memory.and, desc: memory.desc, eq: memory.eq, isNull: memory.isNull, sql: memory.sql,
    getDb: () => memory.db, checkRateLimit: async () => true, clientIp: () => "test-ip", EmailDeliveryError,
    emailDeliveryConfigured: () => true,
    sendTransactionalEmail: async input => { emails.push(input); },
    process: { env }, ...options,
  };
  const codes = await isolated("../lib/email-verification.ts", dependencies);
  const sessionUserFromRow = user => ({ ...user, emailVerified: !!user.emailVerifiedAt, profileCompleted: !!user.profileCompletedAt, onboardingCompleted: !!user.onboardingCompletedAt });
  const routeDeps = {
    ...memory.tables, and: memory.and, eq: memory.eq, isNull: memory.isNull, ne: memory.ne,
    ...codes, EmailDeliveryError,
    jsonError: (error, status = 400, code) => Response.json({ error, code }, { status }),
    getSessionUser: async () => sessionUserFromRow(memory.rows.users.find(user => user.id === 1)),
    sameOriginRequest: () => true, isNativeAppRequest: () => false, sessionUserFromRow,
    accountNext: user => !user.emailVerified ? "/verify-email" : !user.profileCompleted ? "/complete-profile" : "/dashboard",
    readBoundedJsonObject: value => value.json(),
    checkRateLimit: async () => true, hashOpaqueToken: async () => "current-token",
    hashPassword: async password => "hashed:" + password, requestSessionToken: () => "opaque-session",
    validPassword: password => password.length >= 10 && /\d/.test(password) && /[^a-z\d]/i.test(password),
  };
  return { codes, ...memory, emails, env, routeDeps, EmailDeliveryError };
}
async function issue(s, purpose = "verify_email") { await s.codes.requestEmailCode(1, purpose, request()); return s.rows.emailVerificationCodes.at(-1); }

test("email OTP is six zero-padded digits; only salted HMAC is stored and output omits code", async () => {
  const s = await setup();
  const response = await s.codes.requestEmailCode(1, "verify_email", request());
  const row = s.rows.emailVerificationCodes[0];
  assert.match(s.emails[0].text, /\n000042\n/);
  assert.match(row.codeHash, /^[a-f0-9]{32}\.[a-f0-9]{64}$/);
  assert.equal("code" in row, false);
  assert.equal(JSON.stringify(response).includes("000042"), false);
  assert.equal(s.codes.matchesEmailCode({ userId: 1, email: baseUser.email, purpose: "verify_email" }, "000042", row.codeHash), true);
});
test("OTP salt and HMAC bind user, email and purpose, reject malformed hashes and weak secrets", async () => {
  const s = await setup(); const identity = { userId: 1, email: baseUser.email, purpose: "verify_email" };
  const one = s.codes.hashEmailCode(identity, "000042"), two = s.codes.hashEmailCode(identity, "000042");
  assert.notEqual(one, two);
  for (const other of [{ ...identity, userId: 2 }, { ...identity, email: "other@example.com" }, { ...identity, purpose: "change_password" }]) assert.equal(s.codes.matchesEmailCode(other, "000042", one), false);
  for (const malformed of ["", "plain-000042", "x.y", one + ".suffix"]) assert.equal(s.codes.matchesEmailCode(identity, "000042", malformed), false);
  s.env.SESSION_SECRET = "too-short";
  assert.throws(() => s.codes.hashEmailCode(identity, "000042"), error => error.code === "EMAIL_VERIFICATION_NOT_CONFIGURED");
});
test("Arabic and Persian OTP digits normalize without admitting malformed non-six-digit codes", async () => {
  const s = await setup();
  assert.equal(s.codes.normalizeEmailCode(" ٠٠٠٠٤٢ "), "000042");
  assert.equal(s.codes.normalizeEmailCode("۰۰۰۰۴۲"), "000042");
  assert.equal(s.codes.normalizeEmailCode(42), "");
  await issue(s);
  for (const value of ["42", "0000042", "000 042"]) await assert.rejects(s.codes.consumeEmailCode(1, "verify_email", value, request(), async () => "invalid"), error => error.code === "EMAIL_CODE_INVALID");
  assert.equal(s.rows.emailVerificationCodes[0].attempts, 3);
});
test("wrong attempts persist after rejected promise and the fifth invalidates even the correct code", async () => {
  const s = await setup(); await issue(s);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await assert.rejects(s.codes.consumeEmailCode(1, "verify_email", "111111", request(), async () => "must-not-run"), error => error.code === "EMAIL_CODE_INVALID");
    assert.equal(s.rows.emailVerificationCodes[0].attempts, attempt);
    assert.equal(s.operations.at(-1), "commit", "rejection occurs outside the transaction");
  }
  assert.ok(s.rows.emailVerificationCodes[0].usedAt);
  await assert.rejects(s.codes.consumeEmailCode(1, "verify_email", "000042", request(), async () => "must-not-run"));
});
test("OTP rejects other users, changed email, another purpose, expiry and malformed expiration", async () => {
  const s = await setup({ users: [baseUser, { ...baseUser, id: 2, email: "other@example.com" }] });
  await issue(s); let executed = 0; const operation = async () => { executed += 1; };
  await assert.rejects(s.codes.consumeEmailCode(2, "verify_email", "000042", request(), operation));
  await assert.rejects(s.codes.consumeEmailCode(1, "change_password", "000042", request(), operation));
  s.rows.users[0].email = "changed@example.com";
  await assert.rejects(s.codes.consumeEmailCode(1, "verify_email", "000042", request(), operation));
  s.rows.users[0].email = baseUser.email;
  for (const expiration of [new Date(0).toISOString(), "not-a-date"]) {
    s.rows.emailVerificationCodes[0].expiresAt = expiration;
    await assert.rejects(s.codes.consumeEmailCode(1, "verify_email", "000042", request(), operation));
  }
  assert.equal(executed, 0);
});
test("OTP consumption is single-use under concurrent attempts and rolls back if protected mutation fails", async () => {
  const s = await setup(); await issue(s); let count = 0;
  await assert.rejects(s.codes.consumeEmailCode(1, "verify_email", "000042", request(), async () => { throw new Error("mutation-failed"); }));
  assert.equal(s.rows.emailVerificationCodes[0].usedAt, null, "failed protected operation can safely retry");
  const attempts = await Promise.allSettled([s.codes.consumeEmailCode(1, "verify_email", "000042", request(), async () => ++count), s.codes.consumeEmailCode(1, "verify_email", "000042", request(), async () => ++count)]);
  assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(count, 1);
});
test("resending enforces cooldown, then replaces the prior code; automatic requests reuse active code", async () => {
  const s = await setup(); await issue(s);
  const immediately = await s.codes.requestEmailCode(1, "verify_email", request());
  assert.equal(immediately.reused, true); assert.ok(immediately.retryAfterSeconds > 0); assert.equal(s.emails.length, 1);
  s.rows.emailVerificationCodes[0].createdAt = new Date(Date.now() - 61_000).toISOString();
  const auto = await s.codes.requestEmailCode(1, "verify_email", request(), true);
  assert.equal(auto.reused, true); assert.equal(s.emails.length, 1);
  await s.codes.requestEmailCode(1, "verify_email", request());
  assert.equal(s.emails.length, 2); assert.equal(s.rows.emailVerificationCodes.length, 2);
  assert.ok(s.rows.emailVerificationCodes[0].usedAt);
  assert.equal(s.rows.emailVerificationCodes[1].usedAt, null);
});
test("delivery failure invalidates the challenge; unsent and disabled-user codes cannot be consumed", async () => {
  const s = await setup({}, { sendTransactionalEmail: async () => { throw new Error("mail-failed"); } });
  await assert.rejects(s.codes.requestEmailCode(1, "verify_email", request()));
  const row = s.rows.emailVerificationCodes[0];
  assert.ok(row.usedAt); assert.equal(row.sentAt, null);
  assert.equal((await s.codes.emailCodeStatus(1, baseUser.email)).codeSent, false);
  row.usedAt = null;
  await assert.rejects(s.codes.consumeEmailCode(1, "verify_email", "000042", request(), async () => true));
  row.sentAt = new Date().toISOString(); s.rows.users[0].status = "disabled";
  await assert.rejects(s.codes.consumeEmailCode(1, "verify_email", "000042", request(), async () => true));
});
test("confirmed account remains confirmed; API ignores stale code submissions without resend or mutation", async () => {
  const s = await setup({ users: [{ ...baseUser, emailVerifiedAt: "verified-once" }] });
  const api = await isolated("../app/api/auth/email-verification/route.ts", s.routeDeps);
  for (const action of ["send", "verify", "send"]) {
    const response = await api.POST(request({ action, code: "wrong-stale-code" }));
    assert.equal(response.status, 200); assert.equal((await response.json()).alreadyVerified, true);
  }
  assert.equal(s.emails.length, 0); assert.equal(s.rows.emailVerificationCodes.length, 0);
  assert.equal(s.rows.users[0].emailVerifiedAt, "verified-once");
});
test("verification API stores one-time timestamp and never exposes HMAC/code in response", async () => {
  const s = await setup(); await issue(s);
  const api = await isolated("../app/api/auth/email-verification/route.ts", s.routeDeps);
  const response = await api.POST(request({ action: "verify", code: "٠٠٠٠٤٢" }));
  assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.user.emailVerified, true); assert.ok(s.rows.users[0].emailVerifiedAt);
  const timestamp = s.rows.users[0].emailVerifiedAt;
  assert.equal(JSON.stringify(result).includes(s.rows.emailVerificationCodes[0].codeHash), false);
  const repeat = await api.POST(request({ action: "verify", code: "000042" }));
  assert.equal((await repeat.json()).alreadyVerified, true); assert.equal(s.rows.users[0].emailVerifiedAt, timestamp);
});
test("password API rejects legacy current-password and missing/wrong-purpose email codes", async () => {
  const s = await setup();
  const api = await isolated("../app/api/profile/password/route.ts", s.routeDeps);
  const legacy = await api.POST(request({ currentPassword: "old-password", newPassword: "new-password123!" }));
  assert.equal(legacy.status, 400); assert.equal((await legacy.json()).code, "EMAIL_CODE_REQUIRED");
  await issue(s, "verify_email");
  const missing = await api.POST(request({ action: "confirm", newPassword: "new-password123!" }));
  const wrongPurpose = await api.POST(request({ action: "confirm", code: "000042", newPassword: "new-password123!" }));
  assert.equal(missing.status, 400); assert.equal(wrongPurpose.status, 400); assert.equal(s.rows.users[0].passwordHash, "old-password");
});
test("password API valid email code updates password, revokes other sessions/reset links/push and rejects replay", async () => {
  const s = await setup({
    authSessions: [{ id: 1, userId: 1, tokenHash: "current-token", deviceId: "current", revokedAt: null }, { id: 2, userId: 1, tokenHash: "old-token", deviceId: "old", revokedAt: null }, { id: 3, userId: 2, tokenHash: "another", deviceId: "other-user", revokedAt: null }],
    passwordResetTokens: [{ id: 1, userId: 1, usedAt: null }],
    pushDevices: [{ id: 1, userId: 1, deviceId: "old", status: "active" }, { id: 2, userId: 1, deviceId: "current", status: "active" }],
  });
  await issue(s, "change_password");
  const api = await isolated("../app/api/profile/password/route.ts", s.routeDeps);
  const payload = { action: "confirm", code: "000042", newPassword: "new-password123!" };
  const response = await api.POST(request(payload));
  assert.equal(response.status, 200); assert.equal((await response.json()).revokedSessions, 1);
  assert.equal(s.rows.users[0].passwordHash, "hashed:new-password123!");
  assert.equal(s.rows.authSessions[0].revokedAt, null); assert.ok(s.rows.authSessions[1].revokedAt); assert.equal(s.rows.authSessions[2].revokedAt, null);
  assert.ok(s.rows.passwordResetTokens[0].usedAt); assert.equal(s.rows.pushDevices[0].status, "revoked"); assert.equal(s.rows.pushDevices[1].status, "active");
  assert.equal((await api.POST(request(payload))).status, 400);
});
test("verification/password APIs reject unauthenticated and cross-site requests before protected work", async () => {
  const s = await setup();
  for (const path of ["../app/api/auth/email-verification/route.ts", "../app/api/profile/password/route.ts"]) {
    const unauth = await isolated(path, { ...s.routeDeps, getSessionUser: async () => null });
    assert.equal((await unauth.POST(request({ action: "send" }))).status, 401);
    const crossSite = await isolated(path, { ...s.routeDeps, sameOriginRequest: () => false });
    assert.equal((await crossSite.POST(request({ action: "send" }))).status, 403);
  }
  assert.equal(s.emails.length, 0);
});

test("email reset of a pre-created unverified account removes creator password, OTPs and every old session", async () => {
  const s = await setup({
    authSessions: [{ id: 1, userId: 1, deviceId: "creator-device", revokedAt: null }, { id: 2, userId: 1, deviceId: "other-old-device", revokedAt: null }],
    passwordResetTokens: [{ id: 1, userId: 1, tokenHash: "current-token", usedAt: null, expiresAt: new Date(Date.now() + 60_000).toISOString() }],
    pushDevices: [{ id: 1, userId: 1, deviceId: "creator-device", status: "active" }],
    emailVerificationCodes: [{ id: 1, userId: 1, purpose: "change_password", usedAt: null }],
  });
  const api = await isolated("../app/api/auth/reset-password/route.ts", {
    ...s.routeDeps, getDb: () => s.db, gt: s.gt, sql: s.sql, clientIp: () => "test-ip",
    cleanText: (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "",
  });
  const response = await api.POST(request({ token: "opaque-reset-token-delivered-by-email-123456", password: "owner-password123!" }));
  assert.equal(response.status, 200);
  assert.equal(s.rows.users[0].passwordHash, "hashed:owner-password123!");
  assert.equal(s.rows.users[0].emailVerifiedAt, null, "reset does not fake separate platform verification");
  assert.ok(s.rows.authSessions.every(session => session.revokedAt));
  assert.ok(s.rows.passwordResetTokens[0].usedAt);
  assert.ok(s.rows.emailVerificationCodes[0].usedAt);
  assert.equal(s.rows.pushDevices[0].status, "revoked");
  const replay = await api.POST(request({ token: "opaque-reset-token-delivered-by-email-123456", password: "attacker-password123!" }));
  assert.equal(replay.status, 400);
  assert.equal(s.rows.users[0].passwordHash, "hashed:owner-password123!");
});
