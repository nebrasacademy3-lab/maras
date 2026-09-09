import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function isolated(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__checkoutRace" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}

const paths = { course: "../app/api/checkout/route.ts", ai: "../app/api/ai/subscription/checkout/route.ts" };
const table = name => new Proxy({ name }, { get: (target, key) => key === "name" ? target.name : { column: String(key) } });
const resolve = (value, row) => value?.column ? row[value.column] : value;
const eq = (left, right) => row => resolve(left, row) === resolve(right, row);
const and = (...conditions) => row => conditions.every(condition => condition(row));
const sql = (strings, ...values) => ({ sql: strings.join("?").replace(/\s+/g, " "), values });
const query = value => { const result = { where: () => result, limit: () => result, then: (yes, no) => Promise.resolve(value).then(yes, no) }; return result; };

async function setup(kind) {
  const stored = { id: 51, orderNumber: "AI-SYNTHETIC", status: "pending", couponCode: "TEST", paidAt: null, tapChargeId: null, checkoutUrl: null };
  const calls = { provider: 0, couponRelease: 0, applied: 0 };
  const tables = Object.fromEntries(["orders", "orderItems", "courseAccess", "courseBundles", "courseBundleItems", "analyticsEvents", "aiSubscriptionOrders"].map(name => [name, table(name)]));
  let beginProvider, finishProvider, failProvider;
  const started = new Promise(resolve => { beginProvider = resolve; });
  const providerResponse = new Promise((resolve, reject) => { finishProvider = resolve; failProvider = reject; });
  const db = {
    select: () => ({ from: () => query([]) }),
    transaction: async () => kind === "ai" ? { kind: "created", row: stored } : { kind: "created" },
    insert: () => ({ values: async () => undefined }),
    update: target => ({ set(patch) { return { where(predicate) {
      assert.equal(target, kind === "ai" ? tables.aiSubscriptionOrders : tables.orders);
      let result;
      const execute = () => {
        if (result) return result;
        result = [];
        if (!predicate(stored)) return result;
        const next = { ...patch };
        if (next.status?.sql) {
          assert.equal(next.status.sql, "CASE WHEN ? = 'pending' THEN 'initiated' ELSE ? END");
          assert.equal(next.status.values[0].column, "status");
          assert.equal(next.status.values[1].column, "status");
          next.status = stored.status === "pending" ? "initiated" : stored.status;
        }
        Object.assign(stored, next); calls.applied += 1; result.push({ orderNumber: stored.orderNumber });
        return result;
      };
      return { returning: async () => execute(), then: (yes, no) => Promise.resolve().then(execute).then(yes, no) };
    } }; } }),
  };
  const dependencies = {
    ...tables, eq, and, sql, gt: () => () => true, inArray: () => () => true, isNull: () => () => true, or: () => () => true, desc: value => value,
    getDb: () => db, sameOriginRequest: () => true, getSessionUser: async () => ({ id: 7, fullName: "Synthetic Student", email: "test@example.test", phone: "+966512345678" }),
    purchaseRequirementResponse: () => null, checkRateLimit: async () => true, clientIp: () => "synthetic",
    readBoundedJsonObject: request => request.json(), cleanText: (value, length = 500) => typeof value === "string" ? value.trim().slice(0, length) : "",
    jsonError: (error, status = 400) => Response.json({ error }, { status }), requestOrigin: () => "https://example.test", observeRequest: (_request, _name, callback) => callback(),
    getCoursesCatalog: async () => [{ slug: "test-course", title: "Test", availableForPurchase: true, price: 50 }],
    getAiMonthlyPrice: async () => 30, toMinorUnits: value => Math.round(value * 100), fromMinorUnits: value => value / 100,
    quoteCoupon: async () => ({ code: "TEST", discount: 5 }), quoteCouponForCart: async () => null,
    releaseCouponReservation: async () => { calls.couponRelease += 1; }, getActiveCourseBundleQuote: async () => null,
    allocateBundleDiscountMinor: (_prices, discount) => [discount], normalizeAccessDurationDays: () => 30,
    process: { env: { TAP_SECRET_KEY: "synthetic-no-network", APP_URL: "https://example.test" } },
    fetch: async (_url, init) => { calls.provider += 1; stored.orderNumber = JSON.parse(init.body).reference.order; beginProvider(); return providerResponse; },
  };
  const route = await isolated(paths[kind], dependencies);
  const request = new Request("https://example.test/api/checkout", { method: "POST", body: JSON.stringify({ courseSlug: "test-course", coupon: "TEST", checkoutKey: "synthetic-race-attempt" }) });
  return { stored, calls, started, finishProvider, failProvider, run: () => route.POST(request) };
}

for (const kind of Object.keys(paths)) {
  for (const webhookStatus of ["paid", "refunded", "partially_refunded", "payment_review"]) {
    test(`${kind}: delayed provider success preserves webhook ${webhookStatus} while attaching gateway metadata`, async () => {
      const state = await setup(kind);
      const response = state.run(); await state.started;
      Object.assign(state.stored, { status: webhookStatus, paidAt: "2026-09-09T12:00:00.000Z" });
      state.finishProvider(Response.json({ id: "charge_synthetic", transaction: { url: "https://checkout.tap.company/synthetic" } }));
      assert.equal((await response).status, 201);
      assert.equal(state.stored.status, webhookStatus);
      assert.equal(state.stored.paidAt, "2026-09-09T12:00:00.000Z");
      assert.equal(state.stored.tapChargeId, "charge_synthetic");
      assert.equal(state.stored.checkoutUrl, "https://checkout.tap.company/synthetic");
      assert.equal(state.calls.couponRelease, 0); assert.equal(state.calls.provider, 1);
    });
    for (const outcome of ["rejected", "timeout", "malformed"]) {
      test(`${kind}: delayed ${outcome} cannot overwrite ${webhookStatus} or release its coupon`, async () => {
        const state = await setup(kind);
        const response = state.run(); await state.started;
        state.stored.status = webhookStatus;
        if (outcome === "timeout") state.failProvider(new Error("Synthetic timeout after webhook"));
        else if (outcome === "malformed") state.finishProvider(new Response("invalid JSON"));
        else state.finishProvider(Response.json({ errors: [{ description: "Synthetic provider rejection" }] }, { status: 500 }));
        assert.equal((await response).status, outcome === "timeout" ? 202 : 502);
        assert.equal(state.stored.status, webhookStatus);
        assert.equal(state.calls.applied, 0); assert.equal(state.calls.couponRelease, 0); assert.equal(state.calls.provider, 1);
      });
    }
  }
  test(`${kind}: untouched pending order still advances, reconciles, or fails correctly`, async () => {
    for (const outcome of ["success", "timeout", "rejected"]) {
      const state = await setup(kind);
      const response = state.run(); await state.started;
      if (outcome === "timeout") state.failProvider(new Error("Synthetic timeout"));
      else if (outcome === "success") state.finishProvider(Response.json({ id: "charge_test", transaction: { url: "https://checkout.tap.company/test" } }));
      else state.finishProvider(Response.json({}, { status: 400 }));
      await response;
      assert.equal(state.stored.status, outcome === "success" ? "initiated" : outcome === "timeout" ? "verification_pending" : "failed");
      assert.equal(state.calls.couponRelease, kind === "course" && outcome === "rejected" ? 1 : 0);
      assert.equal(state.calls.provider, 1); assert.equal(state.calls.applied, 1);
    }
  });
}
