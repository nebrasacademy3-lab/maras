import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/social-links.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL });
const { SOCIAL_CHANNELS, normalizedSocialLinks, normalizeSocialUrl, normalizeWhatsappNumber, publicWhatsappUrl } = exports;

test("all ten configured channels have a single ordered public representation", () => {
  const settings = { whatsapp_number: "0501234567", whatsapp_message: "مرحبًا مراس" };
  for (const channel of SOCIAL_CHANNELS) if (channel.key !== "whatsapp_number") settings[channel.key] = `https://${channel.hosts[0]}/meras`;
  const links = normalizedSocialLinks(settings);
  assert.equal(links.length, 10);
  assert.equal(new Set(links.map((link) => link.id)).size, 10);
  assert.equal(links.find((link) => link.id === "tiktok").icon, "logo-tiktok");
  assert.equal(links.find((link) => link.id === "x").icon, "logo-x");
  assert.equal(links[0].url, "https://wa.me/966501234567?text=" + encodeURIComponent(settings.whatsapp_message));
  assert.equal(links.some((link) => "hosts" in link), false);
});

test("only administrator configured and valid social accounts are published", () => {
  assert.equal(normalizedSocialLinks({}).length, 0);
  const links = normalizedSocialLinks({ social_x: " https://x.com/meras ", social_tiktok: "javascript:alert(1)", social_instagram: "https://facebook.com/wrong", social_youtube: "" });
  assert.equal(links.length, 1);
  assert.equal(links[0].url, "https://x.com/meras");
});

test("social URLs reject schemes, credentials, deceptive hosts, ports and control characters", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "http://x.com/meras", "https://x.com.evil.example/a", "https://evil-x.com/a", "https://user:password@x.com/a", "https://x.com@evil.example/a", "https://x.com:8443/a", "https://localhost/a", "https://x.com/a\n"]) assert.equal(normalizeSocialUrl("social_x", url), "", url);
  assert.equal(normalizeSocialUrl("social_x", "https://mobile.twitter.com/meras"), "https://mobile.twitter.com/meras");
  assert.equal(normalizeSocialUrl("social_threads", "https://www.threads.com/@meras"), "https://www.threads.com/@meras");
  assert.equal(normalizeSocialUrl("social_telegram", "https://t.me/meras"), "https://t.me/meras");
});

test("Saudi and international WhatsApp numbers normalize safely including Arabic digits", () => {
  for (const value of ["0501234567", "+966 50 123 4567", "00966501234567", "٠٥٠١٢٣٤٥٦٧", "۰۵۰۱۲۳۴۵۶۷"]) assert.equal(normalizeWhatsappNumber(value), "966501234567");
  assert.equal(normalizeWhatsappNumber("+44 7700 900123"), "447700900123");
  for (const value of ["", "123", "050123<script>", "+000123456789", "1234567890123456"]) assert.equal(normalizeWhatsappNumber(value), "");
  assert.equal(publicWhatsappUrl({ whatsapp_url: "javascript:alert(1)" }), "");
  assert.equal(publicWhatsappUrl({ whatsapp_url: "https://wa.me/966501234567" }), "https://wa.me/966501234567");
});

test("web footer and contact use normalized channels with safe external links", () => {
  const source = readFileSync(new URL("../components/social-links.tsx", import.meta.url), "utf8");
  assert.match(source, /normalizedSocialLinks\(settings\)/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /aria-label=/);
  const admin = readFileSync(new URL("../app/api/admin/console/route.ts", import.meta.url), "utf8");
  assert.match(admin, /!normalizeSocialUrl\(key, value\)/);
  assert.match(admin, /!normalizeWhatsappNumber\(value\)/);
  assert.ok(admin.indexOf("!normalizeSocialUrl(key, value)") < admin.indexOf("// Validate the entire form first"));
});
