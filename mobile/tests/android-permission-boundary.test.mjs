import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const source = readFileSync(new URL("../app.config.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test("all native profiles strip unnecessary overlay and broad storage permissions from merged manifests", () => {
  for (const profile of ["production", "preview", "development"]) {
    const exports = {};
    vm.runInNewContext(code, {exports,URL,process:{env:{EAS_BUILD_PROFILE:profile}},require:name=>{assert.equal(name,"node:fs");return {existsSync:()=>false};}});
    const config = exports.default({config:{}});
    for (const permission of ["SYSTEM_ALERT_WINDOW", "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"]) {
      assert.ok(config.android.blockedPermissions.includes("android.permission." + permission), profile + ":" + permission);
      assert.ok(!config.android.permissions.includes(permission));
    }
    assert.equal(config.android.allowBackup,false);
    assert.ok(config.android.permissions.includes("POST_NOTIFICATIONS"));
    assert.ok(config.android.permissions.includes("RECORD_AUDIO"));
  }
  const gate=readFileSync(new URL("../../.github/workflows/mobile-native-acceptance.yml",import.meta.url),"utf8");
  assert.match(gate,/for permission in \["?['"]SYSTEM_ALERT_WINDOW/);
});
