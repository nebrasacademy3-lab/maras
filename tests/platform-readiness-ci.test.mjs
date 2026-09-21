import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("mobile release validation uses the actual reader production configuration", () => {
  const workflow = read(".github/workflows/mobile-release-validation.yml");
  assert.match(workflow, /EXPO_PUBLIC_STORE_MODE: reader/);
  assert.doesNotMatch(workflow, /EXPO_PUBLIC_STORE_MODE: iap/);
  assert.match(workflow, /npx expo config --type (?:public|prebuild)/);
  assert.match(workflow, /npx expo prebuild/);
  assert.match(workflow, /npx expo export/);
});

test("real Expo config rejects legacy IAP and direct store checkout while allowing reader and internal builds", async () => {
  const compiled = ts.transpileModule(read("mobile/app.config.ts"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const configure = (await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"))).default;
  const names = ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_STORE_MODE", "EAS_BUILD_PROFILE"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.EXPO_PUBLIC_API_URL = "https://maras-qa.example";
    process.env.EAS_BUILD_PROFILE = "production";
    process.env.EXPO_PUBLIC_STORE_MODE = "reader";
    assert.doesNotThrow(() => configure({ config: {} }));
    process.env.EXPO_PUBLIC_STORE_MODE = "iap";
    assert.throws(() => configure({ config: {} }), /must be reader or direct/);
    process.env.EXPO_PUBLIC_STORE_MODE = "direct";
    assert.throws(() => configure({ config: {} }), /cannot use direct checkout/);
    process.env.EAS_BUILD_PROFILE = "preview";
    assert.doesNotThrow(() => configure({ config: {} }));
  } finally {
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
});

test("instructor and privacy acceptance is part of the required Quality gates workflow", () => {
  assert.match(read(".github/workflows/quality.yml"), /run: node scripts\/qa-platform-readiness-ci\.mjs/);
  const runner = read("scripts/qa-platform-readiness-ci.mjs");
  for (const file of ["qa-instructor-assignments.ts", "qa-instructor-contracts.ts", "qa-account-deletion.ts"]) assert.ok(runner.includes(file));
  assert.ok(runner.includes('new URL(url).hostname !== "127.0.0.1"'));
  assert.ok(runner.includes('new URL(url).pathname !== "/maras_qa"'));
  assert.ok(runner.includes('randomBytes(32).toString("hex")'));
  assert.match(read("scripts/qa-study-ci.mjs"), /scripts\/qa-gemini-refresh-ordering\.ts/);
});
