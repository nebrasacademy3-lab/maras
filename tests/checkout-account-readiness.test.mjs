import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function isolated(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__checkoutReadiness" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const readiness = await isolated("../lib/account-readiness.ts");
const complete = { id: 1, email: "student@example.com", emailVerified: true, profileCompleted: true, onboardingCompleted: true, fullName: "طالب مراس العلم", phone: "+966512345678", universitySlug: "university", specialty: "science", academicLevel: "1", role: "student" };
const coursePath = "../app/api/checkout/route.ts";
const aiPath = "../app/api/ai/subscription/checkout/route.ts";
const newRequest = () => new Request("https://meras.example/api/checkout", { method: "POST", body: JSON.stringify({ courseSlug: "course", checkoutKey: "readiness-test-key-123" }) });

async function checkout(path, user, options = {}) {
  const calls = { database: 0, provider: 0, mail: 0, parsed: 0, rate: 0, catalogs: 0, prices: 0, writes: 0 };
  const orders = { tableName: "orders" }, orderItems = { tableName: "orderItems" }, aiSubscriptionOrders = { tableName: "aiSubscriptionOrders" };
  const stored = { id: 9, userId: 1, customerEmail: complete.email, orderNumber: "ORDER-READY", courseSlug: "course", paymentMethod: "tap", couponCode: null, bundleSlug: null, status: "initiated", checkoutUrl: "https://checkout.tap.company/example", createdAt: new Date().toISOString(), subtotal: 50, discount: 0, total: 50, amount: 30, currency: "SAR" };
  const db = {
    select: () => ({ from(table) {
      const result = table === orderItems ? [{ courseSlug: "course" }] : [stored];
      const query = { where: () => query, limit: () => query, then: (yes, no) => Promise.resolve(result).then(yes, no) };
      return query;
    } }),
    transaction: async () => ({ kind: "existing", row: stored }),
    insert: () => { calls.writes += 1; throw new Error("unexpected insert"); },
    update: () => { calls.writes += 1; throw new Error("unexpected update"); },
  };
  const dependencies = {
    purchaseRequirementResponse: readiness.purchaseRequirementResponse,
    getSessionUser: async () => user,
    sameOriginRequest: () => true,
    checkRateLimit: async () => { calls.rate += 1; return true; },
    clientIp: () => "test-ip",
    jsonError: (error, status = 400, code) => Response.json({ error, code }, { status }),
    cleanText: (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "",
    readBoundedJsonObject: async request => { calls.parsed += 1; return request.json(); },
    observeRequest: (_request, _operation, handler) => handler("test-id"),
    getDb: () => { calls.database += 1; return db; },
    getCoursesCatalog: async () => { calls.catalogs += 1; return [{ slug: "course", title: "مادة تجريبية", availableForPurchase: true, price: 50 }]; },
    getAiMonthlyPrice: async () => { calls.prices += 1; return 30; },
    fromMinorUnits: value => value / 100, toMinorUnits: value => Math.round(value * 100),
    eq: () => ({}), and: () => ({}), gt: () => ({}), inArray: () => ({}), isNull: () => ({}), or: () => ({}), sql: () => ({}), desc: () => ({}),
    orders, orderItems, aiSubscriptionOrders,
    fetch: async () => { calls.provider += 1; throw new Error("Provider must not run in a replay test"); },
    ensureVerificationEmail: async () => { calls.mail += 1; throw new Error("Checkout must never issue another OTP"); },
    sendTransactionalEmail: async () => { calls.mail += 1; throw new Error("Checkout must never send another OTP"); },
    process: { env: { TAP_SECRET_KEY: "test-only", NODE_ENV: "test" } }, ...options,
  };
  return { api: await isolated(path, dependencies), calls };
}

test("purchase readiness prioritizes email then complete academic profile for every role", () => {
  assert.equal(readiness.purchaseRequirement({ ...complete, emailVerified: false, profileCompleted: false }).code, "EMAIL_VERIFICATION_REQUIRED");
  for (const role of ["student", "admin", "supervisor"]) {
    for (const field of ["phone", "universitySlug", "specialty", "academicLevel"]) {
      const requirement = readiness.purchaseRequirement({ ...complete, role, [field]: null });
      assert.equal(requirement.code, "PROFILE_INCOMPLETE", role + ":" + field);
    }
    assert.equal(readiness.purchaseRequirement({ ...complete, role, fullName: "أ" }).code, "PROFILE_INCOMPLETE");
    assert.equal(readiness.purchaseRequirement({ ...complete, role, profileCompleted: false }).code, "PROFILE_INCOMPLETE");
  }
});
test("verified complete account may purchase repeatedly without another verification transition", () => {
  for (let purchase = 0; purchase < 10; purchase += 1) {
    assert.equal(readiness.purchaseRequirement(complete), null);
    assert.equal(readiness.purchaseRequirementResponse(complete), null);
    assert.equal(readiness.accountNext(complete), "/dashboard");
  }
  assert.equal(readiness.accountNext(complete, true), "/home");
  assert.equal(readiness.accountNext({ ...complete, emailVerified: false }), "/verify-email");
  assert.equal(readiness.accountNext({ ...complete, profileCompleted: false }), "/complete-profile");
});
test("both course and AI checkout reject unverified/incomplete account before parsing, mutation or provider", async () => {
  for (const path of [coursePath, aiPath]) {
    for (const user of [{ ...complete, emailVerified: false }, { ...complete, profileCompleted: false }, { ...complete, phone: null }, { ...complete, role: "admin", specialty: null }]) {
      const state = await checkout(path, user);
      const response = await state.api.POST(newRequest());
      assert.equal(response.status, 403, path);
      assert.equal((await response.json()).code, !user.emailVerified ? "EMAIL_VERIFICATION_REQUIRED" : "PROFILE_INCOMPLETE");
      assert.deepEqual(state.calls, { database: 0, provider: 0, mail: 0, parsed: 0, rate: 0, catalogs: 0, prices: 0, writes: 0 });
    }
  }
});
test("both checkout routes admit verified complete accounts repeatedly and reuse existing checkout without OTP", async () => {
  for (const path of [coursePath, aiPath]) {
    const state = await checkout(path, complete);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await state.api.POST(newRequest());
      assert.equal(response.status, 200, path + ": response " + response.status);
      assert.equal((await response.json()).replayed, true);
    }
    assert.equal(state.calls.parsed, 3); assert.equal(state.calls.rate, 3);
    assert.equal(state.calls.provider, 0); assert.equal(state.calls.writes, 0); assert.equal(state.calls.mail, 0);
    assert.equal(complete.emailVerified, true);
  }
});
test("checkout endpoints reject anonymous or invalid-origin requests without account/provider access", async () => {
  for (const path of [coursePath, aiPath]) {
    const anonymous = await checkout(path, null);
    assert.equal((await anonymous.api.POST(newRequest())).status, 401);
    assert.equal(anonymous.calls.database, 0);
    const cross = await checkout(path, complete, { sameOriginRequest: () => false, getSessionUser: async () => { throw new Error("must not look up cross-site session"); } });
    assert.equal((await cross.api.POST(newRequest())).status, 403);
    assert.equal(cross.calls.provider, 0);
  }
});
test("return paths reject authority tricks, backslashes/control bytes and API destinations", () => {
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/\nevil", "/api", "/api/auth/logout", "/%61pi/auth/logout", "/%2f%2fevil.example", "/%5cevil", "/%00evil"]) {
    assert.equal(readiness.safeAccountReturnTo(value), "/dashboard", JSON.stringify(value));
  }
  assert.equal(readiness.safeAccountReturnTo("/courses/course?tab=lessons#lesson-1"), "/courses/course?tab=lessons#lesson-1");
});
