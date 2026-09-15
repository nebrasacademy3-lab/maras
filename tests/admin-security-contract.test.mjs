import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as nodeCrypto from "node:crypto";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const read = (path) => readFile(join(root, path), "utf8");

const [permissions, mfa, mfaRoute, finance, compliance, notifications, consoleRoute, securityPage, deletion, mobileApi, mobileAdmin] = await Promise.all([
  read("lib/permissions.ts"),
  read("lib/admin-mfa.ts"),
  read("app/api/admin/security/mfa/route.ts"),
  read("app/api/admin/finance/route.ts"),
  read("app/api/admin/compliance/route.ts"),
  read("app/api/admin/notifications/dispatch/route.ts"),
  read("app/api/admin/console/route.ts"),
  read("components/admin-security.tsx"),
  read("lib/admin-deletion.ts"),
  read("mobile/src/lib/api.ts"),
  read("mobile/app/admin.tsx"),
]);

test("RBAC reads the existing role tables and keeps the admin fallback finite", () => {
  assert.match(permissions, /userRoles/);
  assert.match(permissions, /roles/);
  assert.match(permissions, /rolePermissions/);
  assert.match(permissions, /innerJoin\(roles/);
  assert.match(permissions, /innerJoin\(rolePermissions/);
  assert.match(permissions, /user\.role === "admin"/);
  assert.match(permissions, /BUILT_IN_ADMIN_PERMISSIONS/);
  assert.doesNotMatch(permissions, /permission\s*===\s*["']\*["']/);
  assert.match(permissions, /return new Set\(\)/, "lookup failures deny access for non-admin users");
});

test("financial, compliance, notification, and deletion routes enforce permissions", () => {
  assert.match(finance, /ADMIN_PERMISSIONS\.FINANCE_VIEW/);
  assert.match(finance, /ADMIN_PERMISSIONS\.FINANCE_EXPORT/);
  assert.match(finance, /requireAdminStepUp/);
  assert.doesNotMatch(finance, /isAdminRequest/, "the broad machine admin token cannot read financial data");

  assert.match(compliance, /ADMIN_PERMISSIONS\.COMPLIANCE_VIEW/);
  assert.match(compliance, /ADMIN_PERMISSIONS\.COMPLIANCE_MANAGE/);
  assert.match(compliance, /requireAdminStepUp/);

  assert.match(notifications, /isScheduledTaskRequest/);
  assert.match(notifications, /ADMIN_PERMISSIONS\.NOTIFICATIONS_DISPATCH/);
  assert.match(notifications, /requireAdminStepUp/);
  assert.match(consoleRoute, /action === "createNotification"[\s\S]*?ADMIN_PERMISSIONS\.NOTIFICATIONS_MANAGE/);

  assert.match(consoleRoute, /action === "deleteEntity"[\s\S]*?ADMIN_PERMISSIONS\.RECORDS_DELETE/);
  assert.match(consoleRoute, /action === "deleteEntity"[\s\S]*?requireAdminStepUp/);
  assert.match(consoleRoute, /!authorization\.user/,
    "a generic machine admin token cannot execute the sensitive console branches");
});

test("TOTP storage is encrypted, replay protected, and step-up is bound to the login session", () => {
  assert.match(mfa, /aes-256-gcm/);
  assert.match(mfa, /ADMIN_MFA_ENCRYPTION_KEY/);
  assert.match(mfa, /createHmac\("sha1"/);
  assert.match(mfa, /counter <= afterCounter/);
  assert.match(mfa, /pg_advisory_xact_lock/);
  assert.match(mfa, /sessionFingerprint/);
  assert.match(mfa, /HttpOnly/);
  assert.match(mfa, /SameSite=Strict/);
  assert.match(mfa, /Max-Age=\$\{maxAge\}/);
  assert.match(mfa, /STEP_UP_SECONDS = 60 \* 60/);
});

test("MFA API supports setup, activation, short step-up, and disable without returning stored secrets", () => {
  for (const action of ["setup", "verify", "stepUp", "disable"]) {
    assert.match(mfaRoute, new RegExp(`action === "${action}"`));
  }
  assert.match(mfaRoute, /sameOriginRequest/);
  assert.match(mfaRoute, /checkRateLimit/);
  assert.match(mfaRoute, /"set-cookie": stepUp\.cookie/);
  assert.match(mfa, /factor: enabledFactor \? \{/);
  assert.doesNotMatch(mfa, /factor: enabledFactor\s*[,}]/);
  assert.match(securityPage, /لن يظهر المفتاح مرة أخرى بعد التفعيل/);
  assert.match(deletion, /delete\(adminMfaFactors\).*userId/,
    "deleting an account also removes its MFA factors");
});

test("native administration carries a session-bound step-up token without persisting it", () => {
  assert.match(mfa, /x-meras-admin-stepup/);
  assert.match(mfa, /x-meras-client/);
  assert.match(mfaRoute, /stepUpToken: stepUp\.token/);
  assert.match(mobileApi, /let adminStepUpToken = ""/);
  assert.match(mobileApi, /headers\.set\("x-meras-admin-stepup"/);
  assert.match(mobileAdmin, /MobileAdminSecurity/);
  assert.match(mobileAdmin, /setAdminStepUpToken/);
});

test("TOTP follows the RFC vector and AES-GCM rejects tampering", () => {
  const moduleUrl = pathToFileURL(join(root, "lib/admin-mfa.ts")).href;
  const bootstrap = join(root, "scripts/tsx-runtime-bootstrap.cjs");
  const script = `
    process.env.ADMIN_MFA_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    const m = await import(${JSON.stringify(moduleUrl)});
    if (m.totpCodeForCounter("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1, 8) !== "94287082") throw new Error("RFC TOTP mismatch");
    const encrypted = m.encryptAdminMfaSecret("ABCDEFGHIJKLMNOP");
    if (encrypted.includes("ABCDEFGHIJKLMNOP")) throw new Error("plaintext leaked");
    if (m.decryptAdminMfaSecret(encrypted) !== "ABCDEFGHIJKLMNOP") throw new Error("round trip failed");
    const parts = encrypted.split(".");
    parts[2] = (parts[2].startsWith("A") ? "B" : "A") + parts[2].slice(1);
    let rejected = false;
    try { m.decryptAdminMfaSecret(parts.join(".")); } catch { rejected = true; }
    if (!rejected) throw new Error("tampered ciphertext accepted");
  `;
  const result = spawnSync(process.execPath, ["--require", bootstrap, "--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("admin step-up remains valid for one hour, expires at its boundary, and binds web/native sessions", async () => {
  let clock = 1_800_000_000_000;
  const initialClock = clock;
  class TestDate extends Date { static now() { return clock; } }
  const factor = { id: 4, counter: -1, secretEncrypted: "", verifiedAt: "verified", disabledAt: null };
  const db = {
    execute: async () => {},
    transaction: async callback => callback(db),
    select: () => ({ from() {
      const query = { where: () => query, orderBy: () => query, limit: async () => factor.disabledAt ? [] : [factor] };
      return query;
    } }),
    update: () => ({ set(value) { return { where: async () => { Object.assign(factor, value); } }; } }),
  };
  const key = "__adminHourTest" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = {
    createCipheriv: nodeCrypto.createCipheriv, createDecipheriv: nodeCrypto.createDecipheriv,
    createHash: nodeCrypto.createHash, createHmac: nodeCrypto.createHmac,
    randomBytes: nodeCrypto.randomBytes, timingSafeEqual: nodeCrypto.timingSafeEqual,
    and: () => ({}), desc: () => ({}), eq: () => ({}), isNull: () => ({}), sql: () => ({}),
    getDb: () => db, adminMfaFactors: {}, SESSION_COOKIE: "meras_session",
    process: { env: { ADMIN_MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef" } }, Date: TestDate,
  };
  let admin;
  try {
    const dependencies = Object.keys(globalThis[key]).join(",");
    const isolatedSource = "const {" + dependencies + "} = globalThis[" + JSON.stringify(key) + "];\n" + mfa.replace(/^import\s[\s\S]*?;\r?\n/gm, "");
    const javascript = ts.transpileModule(isolatedSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    admin = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
  } finally { delete globalThis[key]; }
  const user = { id: 7, role: "admin" };
  const session = "original-session-token-123456789012345678";
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  factor.secretEncrypted = admin.encryptAdminMfaSecret(secret);
  const browserRequest = token => new Request("https://meras.example/api/admin/security/mfa", { headers: { cookie: "meras_session=" + session + (token ? "; meras_admin_stepup=" + token : "") } });
  const totp = admin.totpCodeForCounter(secret, Math.floor(clock / 1000 / 30));
  const issued = await admin.createAdminStepUp(user, browserRequest(), totp);
  assert.match(issued.cookie, /Max-Age=3600(?:;|$)/);
  assert.equal(Date.parse(issued.expiresAt) - initialClock, 3_600_000);
  clock = initialClock + 11 * 60_000;
  assert.ok(await admin.validAdminStepUp(browserRequest(issued.token), user), "must remain valid after old ten-minute duration");
  clock = initialClock + 3_599_000;
  assert.ok(await admin.validAdminStepUp(browserRequest(issued.token), user));
  const native = new Request("https://meras.example/api/admin/console", { headers: { authorization: "Bearer " + session, "x-meras-client": "mobile-v1", "x-meras-admin-stepup": issued.token } });
  assert.ok(await admin.validAdminStepUp(native, user), "native bearer uses the same session binding");
  const different = new Request("https://meras.example/api/admin/console", { headers: { cookie: "meras_session=different-session; meras_admin_stepup=" + issued.token } });
  assert.equal(await admin.validAdminStepUp(different, user), null);
  assert.equal(await admin.validAdminStepUp(browserRequest(issued.token), { ...user, id: 8 }), null);
  clock = initialClock + 3_600_000;
  assert.equal(await admin.validAdminStepUp(browserRequest(issued.token), user), null);
  assert.equal(await admin.validAdminStepUp(native, user), null);
});
