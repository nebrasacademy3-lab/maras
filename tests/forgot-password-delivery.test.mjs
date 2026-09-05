import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function isolated(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__forgotDelivery" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const user = { id: 7, email: "student@example.com", fullName: "طالب مراس", status: "active" };
const request = value => new Request("https://meras.example/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: value }) });
async function setup({ configured = true, account = user, delivery = async () => Response.json({ id: "sent-message" }), sameOrigin = true, rateAllowed = true } = {}) {
  const calls = { lookups: 0, inserts: 0, updates: 0, provider: [], rate: [] };
  const tokens = [];
  const env = configured ? { APP_URL: "https://meras.example", RESEND_API_KEY: "test-provider-key-not-real", EMAIL_FROM: "Meras <no-reply@example.com>" } : { APP_URL: "https://meras.example" };
  const mail = await isolated("../lib/transactional-email.ts", {
    process: { env },
    fetch: async (url, options) => { calls.provider.push({ url, options }); return delivery(); },
  });
  const tables = { users: new Proxy({}, { get: (_target, key) => key }), passwordResetTokens: new Proxy({}, { get: (_target, key) => key }) };
  const eq = (key, value) => row => row[key] === value;
  const and = (...filters) => row => filters.every(predicate => predicate(row));
  const db = {
    select: () => ({ from: () => ({ where: predicate => ({ limit: async () => { calls.lookups += 1; return account && predicate(account) ? [account] : []; } }) }) }),
    insert: () => ({ values: async row => { calls.inserts += 1; tokens.push({ ...row, usedAt: null }); } }),
    update: () => ({ set: values => ({ where: async predicate => { calls.updates += 1; tokens.filter(predicate).forEach(row => Object.assign(row, values)); } }) }),
  };
  const route = await isolated("../app/api/auth/forgot-password/route.ts", {
    ...mail, ...tables, eq, and, getDb: () => db,
    readBoundedJsonObject: value => value.json(),
    sameOriginRequest: () => sameOrigin,
    checkRateLimit: async (...args) => { calls.rate.push(args); return rateAllowed; },
    clientIp: () => "test-ip", validEmail: value => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    cleanText: (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "",
    jsonError: (error, status = 400, code) => Response.json({ error, code }, { status }),
    requestOrigin: () => "https://meras.example", process: { env },
    createOpaqueToken: () => randomBytes(32).toString("base64url"),
    hashOpaqueToken: async value => createHash("sha256").update(value).digest("hex"),
  });
  return { route, calls, tokens };
}
async function publicResult(response) {
  return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control"), referrer: response.headers.get("referrer-policy") };
}

test("forgot password with email disabled returns safe guidance without lookup, token or attempted delivery", async () => {
  for (const email of [user.email, "unknown@example.com"]) {
    const s = await setup({ configured: false });
    const result = await publicResult(await s.route.POST(request(email)));
    assert.equal(result.status, 200); assert.equal(result.body.delivery, "disabled");
    assert.equal(result.cache, "no-store"); assert.equal(result.referrer, "no-referrer");
    assert.match(result.body.message, /البريد.*غير مفع/);
    assert.equal(s.calls.lookups, 0); assert.equal(s.calls.inserts, 0); assert.equal(s.calls.provider.length, 0);
    assert.deepEqual(s.tokens, []);
  }
});
test("unknown, inactive and active accounts produce identical public response and headers", async () => {
  const existing = await setup();
  const unknown = await setup();
  const disabled = await setup({ account: { ...user, status: "disabled" } });
  const knownResult = await publicResult(await existing.route.POST(request(user.email)));
  assert.deepEqual(await publicResult(await unknown.route.POST(request("unknown@example.com"))), knownResult);
  assert.deepEqual(await publicResult(await disabled.route.POST(request(user.email))), knownResult);
  assert.equal(existing.calls.provider.length, 1);
  assert.equal(unknown.calls.provider.length, 0); assert.equal(disabled.calls.provider.length, 0);
  assert.equal(unknown.tokens.length, 0); assert.equal(disabled.tokens.length, 0);
  assert.equal(JSON.stringify(knownResult).includes(user.email), false);
});
test("successful reset email carries the opaque one-time link while database stores only its hash for15minutes", async () => {
  const s = await setup();
  const before = Date.now();
  const result = await publicResult(await s.route.POST(request("  STUDENT@EXAMPLE.COM  ")));
  const after = Date.now();
  assert.equal(result.status, 200); assert.equal(result.body.delivery, "email");
  assert.equal(s.tokens.length, 1); assert.equal(s.calls.provider.length, 1);
  const sent = s.calls.provider[0];
  assert.equal(sent.url, "https://api.resend.com/emails");
  assert.equal(sent.options.method, "POST");
  assert.equal(sent.options.headers.authorization, "Bearer test-provider-key-not-real");
  const email = JSON.parse(sent.options.body);
  assert.deepEqual(email.to, [user.email]);
  const link = email.text.match(/https:\/\/meras\.example\/reset-password\?token=([A-Za-z0-9_-]+)/);
  assert.ok(link);
  const opaque = link[1]; assert.match(opaque, /^[A-Za-z0-9_-]{43}$/);
  const stored = s.tokens[0];
  assert.equal(stored.tokenHash, createHash("sha256").update(opaque).digest("hex"));
  assert.equal(stored.userId, user.id); assert.equal(stored.usedAt, null);
  assert.ok(Date.parse(stored.expiresAt) >= before + 900_000 && Date.parse(stored.expiresAt) <= after + 900_000);
  assert.equal(Date.parse(stored.expiresAt) - Date.parse(stored.createdAt), 900_000);
  assert.equal(JSON.stringify(stored).includes(opaque), false);
  assert.equal(JSON.stringify(result).includes(opaque), false);
  assert.equal(JSON.stringify(result).includes("test-provider-key-not-real"), false);
  assert.match(sent.options.headers["idempotency-key"], /^reset-7-[a-f0-9]{24}$/);
});
test("Resend network, error response and malformed success each invalidate token and never expose provider error", async () => {
  const unknown = await setup();
  const generic = await publicResult(await unknown.route.POST(request("unknown@example.com")));
  for (const delivery of [
    async () => { throw new Error("PRIVATE_PROVIDER_DETAIL student@example.com test-provider-key-not-real"); },
    async () => new Response("PRIVATE_PROVIDER_DETAIL", { status: 401 }),
    async () => new Response("not-json-private-detail", { status: 200 }),
    async () => Response.json({ id: "" }),
  ]) {
    const s = await setup({ delivery });
    const result = await publicResult(await s.route.POST(request(user.email)));
    assert.deepEqual(result, generic);
    assert.equal(s.tokens.length, 1);
    assert.ok(s.tokens[0].usedAt, "an unsent token is invalidated");
    assert.equal(s.calls.updates, 1);
    assert.equal(JSON.stringify(result).includes("PRIVATE_PROVIDER_DETAIL"), false);
    assert.equal(JSON.stringify(result).includes(user.email), false);
  }
});
test("forgot password origin, email validation and rate limits reject before issuing tokens", async () => {
  const invalidOrigin = await setup({ sameOrigin: false });
  assert.equal((await invalidOrigin.route.POST(request(user.email))).status, 403);
  const malformedEmail = await setup();
  assert.equal((await malformedEmail.route.POST(request("not-an-email"))).status, 400);
  const throttled = await setup({ rateAllowed: false });
  assert.equal((await throttled.route.POST(request(user.email))).status, 429);
  for (const s of [invalidOrigin, malformedEmail, throttled]) { assert.equal(s.tokens.length, 0); assert.equal(s.calls.lookups, 0); assert.equal(s.calls.provider.length, 0); }
});
