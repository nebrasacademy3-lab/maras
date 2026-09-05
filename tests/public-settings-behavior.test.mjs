import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/platform-settings.ts", import.meta.url), "utf8");

async function isolatedSettings({ query = async () => [], env = {} } = {}) {
  let queryCount = 0;
  let noStoreCount = 0;
  const dependencies = {
    process: { env: { ...env } },
    noStore: () => { noStoreCount += 1; },
    eq: (column, value) => ({ column, value }),
    platformSettings: { key: "key", value: "value", isPublic: "isPublic" },
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => { queryCount += 1; return query(); },
        }),
      }),
    }),
  };
  const key = "__merasSettingsTest" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const imports = "const { " + Object.keys(dependencies).join(", ") + " } = globalThis[" + JSON.stringify(key) + "];\n";
    const isolated = imports + source.replace(/^import .+;\r?\n/gm, "");
    const javascript = ts.transpileModule(isolated, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const settings = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
    return { settings, env: dependencies.process.env, counts: () => ({ queries: queryCount, noStore: noStoreCount }) };
  } finally { delete globalThis[key]; }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("settings coalesce concurrent reads and cache the public projection", { timeout: 2000 }, async () => {
  const read = deferred();
  const { settings, counts } = await isolatedSettings({ query: () => read.promise, env: { DATABASE_URL: "configured" } });
  const first = settings.getPublicSettings();
  const second = settings.getPublicSettings();
  assert.equal(counts().queries, 1);
  read.resolve([{ key: "commercial_registration_number", value: "1234567890" }]);
  assert.equal((await first).commercial_registration_number, "1234567890");
  assert.equal((await second).commercial_registration_number, "1234567890");
  assert.equal((await settings.getPublicSettings()).commercial_registration_number, "1234567890");
  assert.deepEqual(counts(), { queries: 1, noStore: 3 });
});

test("a stale in-flight settings read cannot overwrite a freshly invalidated cache", { timeout: 2000 }, async () => {
  const old = deferred();
  const fresh = deferred();
  const queue = [old, fresh];
  const { settings, counts } = await isolatedSettings({ query: () => queue.shift().promise, env: { DATABASE_URL: "configured" } });
  const oldRead = settings.getPublicSettings();
  settings.invalidatePublicSettingsCache();
  const freshRead = settings.getPublicSettings();
  fresh.resolve([{ key: "commercial_registration_number", value: "2222222222" }]);
  assert.equal((await freshRead).commercial_registration_number, "2222222222");
  old.resolve([{ key: "commercial_registration_number", value: "1111111111" }]);
  assert.equal((await oldRead).commercial_registration_number, "1111111111", "the earlier caller may complete with its own snapshot");
  assert.equal((await settings.getPublicSettings()).commercial_registration_number, "2222222222");
  assert.equal(counts().queries, 2, "the refreshed cache should remain usable without another database read");
});

test("settling an invalidated request does not clear the newer request being shared", { timeout: 2000 }, async () => {
  const old = deferred();
  const fresh = deferred();
  const queue = [old, fresh];
  const { settings, counts } = await isolatedSettings({ query: () => queue.shift().promise, env: { DATABASE_URL: "configured" } });
  const oldRead = settings.getPublicSettings();
  settings.invalidatePublicSettingsCache();
  const freshRead = settings.getPublicSettings();
  old.resolve([{ key: "support_hours", value: "old" }]);
  await oldRead;
  const sharedFreshRead = settings.getPublicSettings();
  assert.equal(counts().queries, 2, "the newer in-flight read must not be discarded by the old finally block");
  fresh.resolve([{ key: "support_hours", value: "fresh" }]);
  assert.equal((await freshRead).support_hours, "fresh");
  assert.equal((await sharedFreshRead).support_hours, "fresh");
});

test("public settings exclude unknown, private and credential-shaped database keys", async () => {
  const secret = "test-fixture-secret-never-exposed";
  const { settings } = await isolatedSettings({
    env: { DATABASE_URL: "configured", TAP_SECRET_KEY: secret, TAP_WEBHOOK_SECRET: secret },
    query: async () => [
      { key: "support_email", value: "support@example.test" },
      { key: "max_student_devices", value: "9" },
      { key: "TAP_SECRET_KEY", value: secret },
      { key: "SESSION_SECRET", value: secret },
      { key: "payments_ready", value: "injected" },
      { key: "__proto__", value: "injected" },
    ],
  });
  const output = await settings.getPublicSettings();
  assert.equal(output.support_email, "support@example.test");
  assert.deepEqual(Object.keys(output).sort(), Object.keys(settings.PUBLIC_SETTING_DEFAULTS).sort());
  assert.equal(Object.hasOwn(output, "max_student_devices"), false);
  assert.equal(Object.hasOwn(output, "payments_ready"), false);
  assert.equal(JSON.stringify(output).includes(secret), false);
});

test("failed settings reads use defaults without poisoning the next successful read", { timeout: 2000 }, async () => {
  let attempts = 0;
  const { settings, counts } = await isolatedSettings({
    env: { DATABASE_URL: "configured" },
    query: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary database failure");
      return [{ key: "support_email", value: "recovered@example.test" }];
    },
  });
  assert.equal((await settings.getPublicSettings()).support_email, settings.PUBLIC_SETTING_DEFAULTS.support_email);
  assert.equal((await settings.getPublicSettings()).support_email, "recovered@example.test");
  assert.equal(counts().queries, 2);
});

test("public payment capabilities fail closed and never expose credential values", async () => {
  const { settings, env, counts } = await isolatedSettings();
  const flags = settings.getPublicPaymentAvailability;
  assert.deepEqual(flags(), { payments_ready: "false", tabby_available: "false", tamara_available: "false" });
  env.TAP_TABBY_ENABLED = "true";
  env.TAP_TAMARA_ENABLED = "true";
  for (const [key, value] of [["TAP_SECRET_KEY", "secret-fixture"], ["TAP_WEBHOOK_SECRET", "   "]]) env[key] = value;
  assert.deepEqual(flags(), { payments_ready: "false", tabby_available: "false", tamara_available: "false" });
  env.TAP_WEBHOOK_SECRET = "webhook-fixture";
  assert.deepEqual(flags(), { payments_ready: "true", tabby_available: "true", tamara_available: "true" });
  env.TAP_TAMARA_ENABLED = "false";
  env.TAP_TABBY_ENABLED = "1";
  assert.deepEqual(flags(), { payments_ready: "true", tabby_available: "false", tamara_available: "false" });
  const serialized = JSON.stringify(flags());
  assert.equal(serialized.includes("secret-fixture"), false);
  assert.equal(serialized.includes("webhook-fixture"), false);
  assert.deepEqual(Object.keys(flags()).sort(), ["payments_ready", "tabby_available", "tamara_available"]);
  assert.equal(counts().queries, 0, "capability flags must not query or expose platform secrets");
});
