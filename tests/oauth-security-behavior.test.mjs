import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, importPKCS8, jwtVerify, SignJWT } from "jose";

async function isolatedModule(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__oauthTest" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const code = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const environment = { NODE_ENV: "production", APP_URL: "https://meras.example", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-server-secret", APPLE_CLIENT_ID: "test-apple", APPLE_TEAM_ID: "test-team", APPLE_KEY_ID: "test-kid", APPLE_PRIVATE_KEY: "test-private-key" };
const provider = await isolatedModule("../lib/oauth-provider.ts", { createHash, randomBytes, timingSafeEqual, createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, process: { env: environment } });
const signing = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(signing.publicKey), kid: "unit-test-key", alg: "RS256", use: "sig" };
const localKeys = createLocalJWKSet({ keys: [jwk] });
async function token(overrides = {}, key = signing.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: "provider-subject", iss: "https://accounts.google.com", aud: "test-client", iat: now, exp: now + 300, nonce: "expected-nonce", email: "Student@Example.com", email_verified: true, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "unit-test-key" }).sign(key);
}
test("OAuth accepts a genuine signed claim and normalizes its email", async () => {
  const identity = await provider.verifyOAuthIdToken(await token(), "google", "test-client", "expected-nonce", localKeys);
  assert.deepEqual(identity, { subject: "provider-subject", email: "student@example.com", emailVerified: true, name: "" });
});
test("OAuth rejects forged signature, wrong issuer/audience/nonce and expired tokens", async () => {
  const attacker = await generateKeyPair("RS256");
  await assert.rejects(provider.verifyOAuthIdToken(await token({}, attacker.privateKey), "google", "test-client", "expected-nonce", localKeys));
  for (const claims of [{ iss: "https://attacker.example" }, { aud: "other-client" }, { nonce: "wrong-nonce" }, { exp: 1 }, { azp: "other-client" }, { aud: ["test-client", "other-client"] }, { sub: "" }, { nonce: undefined }]) {
    await assert.rejects(provider.verifyOAuthIdToken(await token(claims), "google", "test-client", "expected-nonce", localKeys), JSON.stringify(claims));
  }
});
test("Apple requires its own issuer and client audience; its verified-email string is handled", async () => {
  const identity = await provider.verifyOAuthIdToken(await token({ iss: "https://appleid.apple.com", aud: "test-apple", email_verified: "true" }), "apple", "test-apple", "expected-nonce", localKeys);
  assert.equal(identity.emailVerified, true);
  await assert.rejects(provider.verifyOAuthIdToken(await token(), "apple", "test-apple", "expected-nonce", localKeys));
  const unverified = await provider.verifyOAuthIdToken(await token({ email_verified: "true" }), "google", "test-client", "expected-nonce", localKeys);
  assert.equal(unverified.emailVerified, false, "Google boolean claim is not truthiness-coerced");
});
test("OAuth authorization has PKCE and nonce; Apple uses form_post without secrets in the URL", () => {
  const google = new URL(provider.authorizationUrl("google", "state", "nonce", "verifier"));
  assert.equal(google.searchParams.get("code_challenge"), provider.pkceChallenge("verifier"));
  assert.equal(google.searchParams.get("code_challenge_method"), "S256");
  assert.equal(google.searchParams.get("nonce"), "nonce");
  assert.equal(google.searchParams.get("client_secret"), null);
  assert.equal(google.searchParams.get("redirect_uri"), "https://meras.example/api/auth/oauth/google/callback");
  const apple = new URL(provider.authorizationUrl("apple", "state", "nonce", "verifier"));
  assert.equal(apple.searchParams.get("response_mode"), "form_post");
  assert.equal(apple.searchParams.get("response_type"), "code");
});
test("OAuth mobile destination is exact and configuration failure stays closed", () => {
  for (const raw of ["https://evil.example", "merasalelm://oauth/callback/extra", "merasalelm://oauth/callback?redirect=https://evil.example", "merasalelm://oauth/callback#token", "merasalelm://other/callback"]) {
    environment.OAUTH_MOBILE_REDIRECT_URI = raw;
    assert.throws(() => provider.mobileOAuthRedirect());
  }
  delete environment.OAUTH_MOBILE_REDIRECT_URI;
  assert.equal(provider.mobileOAuthRedirect(), "merasalelm://oauth/callback");
  environment.APP_URL = "http://production.example";
  assert.throws(() => provider.oauthOrigin());
  environment.APP_URL = "https://meras.example";
});

function memoryDb(initial = {}) {
  const names = ["users", "oauthStates", "oauthExchanges", "oauthIdentities"];
  const tables = Object.fromEntries(names.map(name => [name, new Proxy({ tableName: name }, { get: (value, key) => key in value ? value[key] : { table: name, key } })]));
  const data = Object.fromEntries(names.map(name => [name, structuredClone(initial[name] || [])]));
  const valueOf = (column, row) => column && typeof column === "object" && "key" in column ? (row[column.table] || row)[column.key] : column;
  const eq = (a, b) => row => valueOf(a, row) === valueOf(b, row);
  const and = (...items) => row => items.every(item => item(row));
  const gt = (a, b) => row => valueOf(a, row) > b;
  const lt = (a, b) => row => valueOf(a, row) < b;
  const isNull = a => row => valueOf(a, row) == null;
  const sql = (strings, ...args) => strings.join("").startsWith("lower(") ? row => String(valueOf(args[0], row)).toLowerCase() === args[1] : () => true;
  let lock = Promise.resolve();
  const db = {
    async execute() {},
    transaction: async fn => {
      const prior = lock;
      let release;
      lock = new Promise(resolve => { release = resolve; });
      await prior;
      const before = structuredClone(data);
      try { return await fn(db); } catch (error) { Object.assign(data, before); throw error; } finally { release(); }
    },
    select: projection => query("select", undefined, projection),
    insert: table => query("insert", table),
    update: table => query("update", table),
    delete: table => query("delete", table),
  };
  function query(kind, table, projection) {
    let condition = () => true, values, joinTable, count = Infinity, executed;
    const chain = {
      from(t) { table = t; return chain; },
      where(fn) { condition = fn; return chain; },
      set(v) { values = v; return chain; },
      values(v) { values = v; return chain; },
      limit(n) { count = n; return chain; },
      for() { return chain; },
      innerJoin(t) { joinTable = t; return chain; },
      returning() { return chain; },
      then(yes, no) {
        executed ||= Promise.resolve().then(() => {
          const rows = data[table.tableName];
          if (kind === "insert") {
            const row = { id: rows.length + 1, usedAt: null, emailVerifiedAt: null, ...structuredClone(values) };
            rows.push(row); return [structuredClone(row)];
          }
          let selected = joinTable ? rows.flatMap(row => data[joinTable.tableName].filter(other => other.id === row.userId).map(user => ({ [table.tableName]: row, [joinTable.tableName]: user }))) : rows;
          selected = selected.filter(condition).slice(0, count);
          if (kind === "delete") { data[table.tableName] = rows.filter(row => !condition(row)); return []; }
          if (kind === "update") selected.forEach(row => Object.assign(row, values));
          if (projection?.user) return selected.map(row => ({ user: structuredClone(row.users) }));
          return structuredClone(selected);
        });
        return executed.then(yes, no);
      },
    };
    return chain;
  }
  return { data, db, tables, eq, and, gt, lt, isNull, sql };
}
async function service(initial = {}, options = {}) {
  const mem = memoryDb(initial);
  const sessions = []; const emails = []; const referrals = [];
  const dependencies = {
    ...provider, ...mem.tables, and: mem.and, eq: mem.eq, gt: mem.gt, lt: mem.lt, isNull: mem.isNull, sql: mem.sql, getDb: () => mem.db,
    checkRateLimit: async () => true, clientIp: () => "unit-test",
    createSession: async (id) => { sessions.push(id); return { token: "never-in-a-url", cookie: "meras_session=session; HttpOnly", expiresAt: "future" }; },
    DeviceLimitError: class DeviceLimitError extends Error {},
    sameOriginRequest: request => !request.headers.get("origin") || request.headers.get("origin") === "https://meras.example",
    sessionUserFromRow: user => ({ ...user, emailVerified: !!user.emailVerifiedAt, profileCompleted: !!user.profileCompletedAt, onboardingCompleted: !!user.onboardingCompletedAt }),
    validEmail: value => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    accountNext: (user, native) => !user.emailVerified ? "/verify-email" : !user.profileCompleted ? "/complete-profile" : !user.onboardingCompleted ? "/onboarding" : native ? "/home" : "/dashboard",
    safeAccountReturnTo: value => typeof value === "string" && /^\/(?!\/)/.test(value) && !/[\\\u0000-\u0020]/.test(value) && !value.startsWith("/api/") ? value : "/dashboard",
    ensureVerificationEmail: async id => { emails.push(id); },
    provisionReferralCodeTx: async () => {},
    recordReferralRegistrationTx: async (_tx, info) => { referrals.push(info.referralCode); },
    referralCodeFromRegistration: body => typeof body.referralCode === "string" ? body.referralCode : "",
    isUniqueConstraintError: () => false,
    jsonError: (message, status = 400, code) => Response.json({ error: message, code }, { status }),
    readBoundedJsonObject: request => request.json(),
    readBoundedFormData: request => request.formData(),
    exchangeProviderCode: async () => ({ subject: "new-subject", email: "new@example.com", emailVerified: true, name: "طالب جديد" }),
    ...options,
  };
  const oauthService = await isolatedModule("../lib/oauth.ts", dependencies);
  return { module: oauthService, ...mem, sessions, emails, referrals };
}
const future = () => new Date(Date.now() + 120_000).toISOString();
function stateFixture(providerName = "google", mobile = false) {
  const state = provider.opaqueOAuthToken(); const binding = provider.opaqueOAuthToken();
  const row = { id: 1, stateHash: provider.oauthHash(state), provider: providerName, bindingHash: provider.oauthHash(binding), nonce: "nonce", verifier: "secret-verifier", returnTo: "/courses/example", usedAt: null, expiresAt: future(), ...(mobile ? { mobileChallenge: provider.pkceChallenge("v".repeat(43)), mobileRedirectUri: provider.mobileOAuthRedirect() } : {}) };
  const cookie = `__Host-meras_oauth_${providerName}_${state.slice(0, 16)}=${binding}`;
  return { state, binding, row, cookie };
}
test("state consumption requires the original browser, expires, and is single use under races", async () => {
  const fixture = stateFixture();
  const s = await service({ oauthStates: [fixture.row] });
  await assert.rejects(s.module.claimOAuthState(new Request("https://meras.example"), "google", fixture.state));
  const request = new Request("https://meras.example", { headers: { cookie: fixture.cookie } });
  const results = await Promise.allSettled([s.module.claimOAuthState(request, "google", fixture.state), s.module.claimOAuthState(request, "google", fixture.state)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(s.data.oauthStates[0].verifier, "");
  assert.equal(s.data.oauthStates[0].nonce, "");
  const expired = await service({ oauthStates: [{ ...fixture.row, expiresAt: new Date(0).toISOString() }] });
  await assert.rejects(expired.module.claimOAuthState(request, "google", fixture.state));
});
test("OAuth never links on email collision or logs in a disabled identity", async () => {
  const existing = { id: 7, email: "new@example.com", status: "active", emailVerifiedAt: "verified" };
  const identity = { subject: "new-subject", email: existing.email, emailVerified: true, name: "طالب" };
  for (const emailVerifiedAt of [null, "verified"]) {
    const s = await service({ users: [{ ...existing, emailVerifiedAt }] });
    await assert.rejects(s.module.resolveOAuthAccount("google", identity, new Request("https://meras.example")), error => error.code === "account_exists");
    assert.equal(s.data.oauthIdentities.length, 0, "pre-created unverified accounts must not auto-link either");
  }
  const disabled = await service({ users: [{ ...existing, status: "disabled" }], oauthIdentities: [{ userId: 7, provider: "google", subject: "new-subject" }] });
  await assert.rejects(disabled.module.resolveOAuthAccount("google", identity, new Request("https://meras.example")), error => error.code === "account_unavailable");
});
test("new OAuth identity is a student, requires platform OTP and retains referral", async () => {
  const s = await service();
  const result = await s.module.resolveOAuthAccount("google", { subject: "new-subject", email: "new@example.com", emailVerified: true, name: "طالب" }, new Request("https://meras.example"), "REF123");
  assert.equal(result.role, "student");
  assert.equal(result.emailVerifiedAt, null);
  assert.equal(result.profileCompletedAt, null);
  assert.equal(s.data.oauthIdentities[0].subject, "new-subject");
  assert.deepEqual(s.referrals, ["REF123"]);
});
test("existing OAuth identity retains verified email even when provider email changes", async () => {
  const user = { id: 7, email: "original@example.com", status: "active", emailVerifiedAt: "verified-once" };
  const s = await service({ users: [user], oauthIdentities: [{ userId: 7, provider: "google", subject: "stable-subject" }] });
  const result = await s.module.resolveOAuthAccount("google", { subject: "stable-subject", email: "new-address@example.com", emailVerified: true }, new Request("https://meras.example"));
  assert.equal(result.email, "original@example.com");
  assert.equal(result.emailVerifiedAt, "verified-once");
  assert.equal(s.data.users.length, 1);
});
test("mobile handoff rejects wrong verifier then redeems once; session is returned only in JSON", async () => {
  const code = provider.opaqueOAuthToken(); const verifier = "v".repeat(43);
  const s = await service({ users: [{ id: 3, status: "active", emailVerifiedAt: "done", profileCompletedAt: "done", onboardingCompletedAt: "done" }], oauthExchanges: [{ id: 1, codeHash: provider.oauthHash(code), userId: 3, challenge: provider.pkceChallenge(verifier), redirectUri: provider.mobileOAuthRedirect(), returnTo: "/dashboard", expiresAt: future(), usedAt: null }] });
  const request = value => new Request("https://meras.example/api/auth/oauth/exchange", { method: "POST", body: JSON.stringify({ code, codeVerifier: value }) });
  const wrong = await s.module.exchangeMobileOAuth(request("w".repeat(43)));
  assert.equal(wrong.status, 400);
  assert.equal(s.sessions.length, 0);
  const responses = await Promise.all([s.module.exchangeMobileOAuth(request(verifier)), s.module.exchangeMobileOAuth(request(verifier))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
  const success = responses.find(r => r.status === 200);
  assert.equal(success.headers.get("location"), null);
  assert.equal((await success.json()).token, "never-in-a-url");
  assert.equal(s.sessions.length, 1);
  assert.equal(s.emails.length, 0, "verified accounts do not receive another OTP");
});
test("web callback routes unverified identity to OTP, sets cookie, and does not expose tokens", async () => {
  const fixture = stateFixture();
  const s = await service({ oauthStates: [fixture.row] });
  const response = await s.module.finishOAuth(new Request(`https://meras.example/api/auth/oauth/google/callback?state=${fixture.state}&code=test-code`, { headers: { cookie: fixture.cookie } }), "google");
  assert.equal(response.status, 303);
  assert.match(response.headers.get("location"), /^https:\/\/meras.example\/verify-email\?return_to=/);
  assert.equal(response.headers.get("location").includes("never-in-a-url"), false);
  assert.match(response.headers.get("set-cookie"), /meras_session=session/);
  assert.deepEqual(s.emails, [1]);
});
test("mobile callback produces only opaque handoff and never a browser/app session", async () => {
  const fixture = stateFixture("google", true);
  const s = await service({ oauthStates: [fixture.row] });
  const response = await s.module.finishOAuth(new Request(`https://meras.example/api/auth/oauth/google/callback?state=${fixture.state}&code=test-code`, { headers: { cookie: fixture.cookie } }), "google");
  const target = new URL(response.headers.get("location"));
  assert.equal(target.protocol, "merasalelm:");
  assert.deepEqual([...target.searchParams.keys()], ["code"]);
  assert.match(target.searchParams.get("code"), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(s.sessions.length, 0);
  assert.equal(s.data.oauthExchanges[0].codeHash, provider.oauthHash(target.searchParams.get("code")));
});
test("native bootstrap creates Secure HttpOnly Apple binding in browser; forged destinations fail", async () => {
  const s = await service();
  const startRequest = redirectUri => new Request("https://meras.example/api/auth/oauth/apple/start", { method: "POST", body: JSON.stringify({ codeChallenge: provider.pkceChallenge("v".repeat(43)), redirectUri }) });
  const invalid = await s.module.beginOAuth(startRequest("https://evil.example"), "apple");
  assert.equal(invalid.status, 400);
  assert.equal(s.data.oauthStates.length, 0);
  const started = await s.module.beginOAuth(startRequest(provider.mobileOAuthRedirect()), "apple");
  const bootstrapUrl = (await started.json()).url;
  assert.equal(s.data.oauthStates[0].bindingHash, null);
  const browser = await s.module.beginOAuth(new Request(bootstrapUrl), "apple");
  assert.equal(new URL(browser.headers.get("location")).hostname, "appleid.apple.com");
  assert.match(browser.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=None/);
  assert.ok(s.data.oauthStates[0].bindingHash);
  const replay = await s.module.beginOAuth(new Request(bootstrapUrl), "apple");
  assert.match(replay.headers.get("location"), /oauth_error=invalid_state/);
});
