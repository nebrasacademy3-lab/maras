import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const script = fileURLToPath(new URL('../scripts/android-startup-check.sh', import.meta.url));
const source = readFileSync(script, 'utf8');
const linux = process.platform === 'linux';
function harness(discoverable) {
  const root = mkdtempSync(join(tmpdir(), 'meras-avd-test-'));
  const bin = join(root, 'bin'), sdk = join(root, 'sdk');
  mkdirSync(bin); mkdirSync(join(sdk, 'emulator'), {recursive:true});
  const put = (path, text) => writeFileSync(path, '#!/usr/bin/env bash\nset -eu\n' + text, {mode:0o755});
  put(join(bin, 'adb'), 'if [[ "$*" == devices ]]; then exit 0; fi\nexit 1\n');
  put(join(bin, 'avdmanager'), '[[ "$ANDROID_USER_HOME" == "$ANDROID_SDK_HOME/.android" ]]\n[[ "$ANDROID_EMULATOR_HOME" == "$ANDROID_USER_HOME" ]]\n[[ "$ANDROID_AVD_HOME" == "$ANDROID_USER_HOME/avd" ]]\nprintf "consistent" > "$RUNNER_TEMP/paths-ok"\n');
  put(join(sdk, 'emulator/emulator'), `if [[ "$*" == -list-avds ]]; then ${discoverable ? 'printf "meras_ci\\n"' : ':'}; exit 0; fi\nprintf "Unknown AVD name" >&2\nexit 1\n`);
  return { root, run: () => spawnSync('bash', [script], {env:{...process.env,GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_TEMP:root,ANDROID_HOME:sdk,PATH:bin+':'+process.env.PATH},encoding:'utf8',timeout:12000}), clean: () => rmSync(root,{recursive:true,force:true}) };
}
test('native Android runner parses as bash', {skip:!linux}, () => {
  assert.equal(spawnSync('bash',['-n',script]).status,0);
});
test('native Android runner refuses non-CI computers before using adb', {skip:!linux}, () => {
  const result=spawnSync('bash',[script],{env:{...process.env,GITHUB_ACTIONS:'false'},encoding:'utf8',timeout:3000});
  assert.equal(result.status,2);assert.match(result.stderr,/isolated Linux GitHub runner/);
});
test('SDK tools share the same AVD home and undiscoverable AVD fails immediately', {skip:!linux}, () => {
  const h=harness(false);try {const result=h.run();assert.equal(result.error,undefined);assert.equal(result.status,1);assert.match(result.stderr,/not discoverable/);assert.equal(readFileSync(join(h.root,'paths-ok'),'utf8'),'consistent');}finally{h.clean();}
});
test('a dead emulator fails promptly instead of waiting forever for adb', {skip:!linux}, () => {
  const h=harness(true);try{const result=h.run();assert.equal(result.error,undefined);assert.equal(result.status,1);assert.match(result.stderr,/Unknown AVD name/);}finally{h.clean();}
});
test('native acceptance verifies rendered content and blocks checkout, not just pid', () => {
  assert.doesNotMatch(source,/adb[^\n]*wait-for-device/);
  assert.match(source,/boot_deadline=\$\(\(SECONDS \+ 300\)\)/);
  assert.match(source,/wait_screen startup/);assert.match(source,/wait_screen courses/);assert.match(source,/wait_screen blocked-checkout/);
  assert.match(source,/uiautomator dump/);assert.match(source,/checkout_link_blocked/);
});

test('native home does not repeat an unverified official-first marketing claim', () => {
  const home = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /أول منصة سعودية رسمية/);
  assert.match(home, /DIRECT_COMMERCE_ENABLED && platform\?\.first_platform_claim_text/);
  assert.match(home, /مساحة لتعلّم منظّم/);
});
test('private support audio has no request source after the account token is cleared', () => {
  const support = readFileSync(new URL('../src/components/SupportChat.tsx', import.meta.url), 'utf8');
  assert.match(support, /useMemo\(\(\) => token \? \([\s\S]*?\) : null, \[file\.id, token\]\)/);
});
