import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../lib/seo-social-identity.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { organizationSocialIdentityUrls } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

test("organization identities omit social platform homepages and contact links", () => {
  assert.deepEqual(organizationSocialIdentityUrls(["https://x.com/", "https://instagram.com", "https://www.linkedin.com/", "https://wa.me/966555555555?text=test", "https://t.me/marasalelm"]), ["https://t.me/marasalelm"]);
});

test("organization identities retain configured specific profiles and remove tracking duplicates", () => {
  assert.deepEqual(organizationSocialIdentityUrls(["https://x.com/maras?utm_source=site#profile", "https://x.com/maras", "https://youtube.com/@maras", "https://linkedin.com/company/maras", "https://facebook.com/profile.php?id=12345"]), ["https://x.com/maras", "https://youtube.com/@maras", "https://linkedin.com/company/maras", "https://facebook.com/profile.php?id=12345"]);
});

test("organization identities reject scripts, insecure URLs, credentials and action destinations", () => {
  assert.deepEqual(organizationSocialIdentityUrls(["javascript:alert(1)", "http://x.com/maras", "https://user:password@x.com/maras", "https://x.com:444/maras", "https://x.com/intent/post", "https://facebook.com/sharer.php?u=x", "https://youtube.com/watch?v=x", "https://youtu.be/video", "https://t.me/+invite", "not a URL"]), []);
});
