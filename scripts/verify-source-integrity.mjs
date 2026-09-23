/** Read-only CI integrity evidence. Never prints credentials, environment dumps or private fixtures. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// Latin-1 preserves every byte; ignore only CRLF versus LF checkout differences.
// Lone CR bytes, whitespace, encoding and all other content remain significant.
const sameSourceIgnoringLineEndings = (left, right) =>
  left.toString("latin1").replace(/\r\n/g, "\n") === right.toString("latin1").replace(/\r\n/g, "\n");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const head = git("rev-parse", "HEAD"), tree = git("rev-parse", "HEAD^{tree}");
const files = ["lib/admin-navigation.ts", "mobile/src/lib/admin-navigation.ts", "lib/staff-policy.ts", "mobile/src/lib/staff-policy.ts", "lib/device-access-policy.ts", "mobile/src/lib/device-access-policy.ts", "tests/auth-device-enrollment-behavior.test.mjs", "tests/platform-security-runtime.test.mjs", "lib/public-origin.ts", "lib/seo.ts"];
const report = files.map(path => {
  const actual = readFileSync(path);
  const committed = execFileSync("git", ["show", `HEAD:${path}`]);
  return { path, bytes: actual.length, trackedBlob: git("rev-parse", `HEAD:${path}`), actualBlob: git("hash-object", "--", path), sha256: createHash("sha256").update(actual).digest("hex"), matchesCommit: sameSourceIgnoringLineEndings(actual, committed) };
});
console.log("REVIEWED_SOURCE_INTEGRITY", JSON.stringify({ head, tree, event: process.env.GITHUB_EVENT_NAME || "local", workflowSha: process.env.GITHUB_SHA || null, files: report }));
for (const file of report) assert.equal(file.matchesCommit, true, `Tracked source changed during build/test: ${file.path}`);
for (const name of ["admin-navigation.ts", "staff-policy.ts", "staff-contracts.ts", "information-contract.ts", "device-access-policy.ts", "operations-contract.ts", "study-progress.ts", "lesson-experience.ts", "player-gestures.ts", "study-rich-text.mjs", "study-rich-text.d.mts", "study-markup.mjs", "ai-contracts.ts"]) assert.ok(sameSourceIgnoringLineEndings(readFileSync(`lib/${name}`), readFileSync(`mobile/src/lib/${name}`)), `Native/server contract mismatch: ${name}`);
const testSource = readFileSync("tests/auth-device-enrollment-behavior.test.mjs", "utf8");
console.log("DEVICE_TEST_DECLARATIONS", JSON.stringify(testSource.split("\n").filter(line => /^test\(/.test(line))));
console.log("DEVICE_POLICY_TEST_BINDINGS", JSON.stringify(testSource.split("\n").filter(line => /devicePolicy|const devices =/.test(line))));
assert.match(testSource, /const devicePolicy = await isolated\("\.\.\/lib\/device-access-policy\.ts"\)/);
assert.match(testSource, /const devices = await isolated\("\.\.\/lib\/auth-devices\.ts", \{ \.\.\.tables, \.\.\.devicePolicy,/);
assert.match(testSource, /\.\.\.bodies, \.\.\.devices, \.\.\.devicePolicy,/);
console.log("SOURCE_INTEGRITY_OK", head);
