import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = await readFile(new URL("../lib/page-csp.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { pageContentSecurityPolicy } = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));

test("production script policy is nonce scoped and forbids inline handlers and eval", () => {
  const nonce = randomBytes(24).toString("base64");
  const policy = pageContentSecurityPolicy(nonce, { development: false, loopbackQa: false });
  const script = policy.split("; ").find((directive) => directive.startsWith("script-src "));
  assert.equal(script, `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
  assert.match(policy, /(?:^|; )script-src-attr 'none'(?:;|$)/);
  assert.match(policy, /(?:^|; )frame-ancestors 'self'(?:;|$)/);
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(policy, /gc\.kis|127\.0\.0\.1/);
  assert.notEqual(policy, pageContentSecurityPolicy(randomBytes(24).toString("base64"), { development: false, loopbackQa: false }));
});

test("development and isolated QA concessions cannot enter production policy", () => {
  const nonce = randomBytes(24).toString("base64");
  const dev = pageContentSecurityPolicy(nonce, { development: true, loopbackQa: false });
  const qa = pageContentSecurityPolicy(nonce, { development: false, loopbackQa: true });
  assert.match(dev, /script-src[^;]*'unsafe-eval'/);
  assert.doesNotMatch(qa, /script-src[^;]*'unsafe-eval'/);
  assert.match(qa, /connect-src[^;]*http:\/\/127\.0\.0\.1:3100/);
  assert.throws(() => pageContentSecurityPolicy("attacker-controlled", { development: false, loopbackQa: false }), /Invalid CSP nonce/);
});
