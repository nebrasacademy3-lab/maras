import assert from "node:assert/strict";
import { isIP } from "node:net";
import { createHmac } from "node:crypto";
import test from "node:test";
import { isolated, sql } from "./helpers/business-fixtures.mjs";

async function client(env = {}) { return (await isolated("../lib/client-ip.ts", { isIP, process: { env } })).trustedClientIp; }
function request(headers = {}) { return new Request("https://example.test/", { headers }); }

test("Railway rate limits and audit identities use only the edge-overwritten address", async () => {
 const ip = await client({ RAILWAY_PROJECT_ID: "synthetic-project" });
 assert.equal(ip(request({ "x-real-ip": "198.51.100.4", "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8, 10.0.0.1" })), "198.51.100.4");
 assert.equal(ip(request({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" })), "unknown", "never fall back to an attacker-chosen header");
});

test("header trust outside Railway is explicit, single-address and cannot be selected by a client", async () => {
 const untrusted = await client();
 assert.equal(untrusted(request({ "x-real-ip": "198.51.100.4", "cf-connecting-ip": "1.2.3.4", "x-railway-request-id": "spoof" })), "unknown");
 const trusted = await client({ TRUSTED_CLIENT_IP_HEADER: "x-real-ip" });
 assert.equal(trusted(request({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
 for (const value of ["attacker", "198.51.100.4, 198.51.100.5", "127.0.0.1:80", "fe80::1%eth0"]) assert.equal(trusted(request({ "x-real-ip": value })), "unknown");
 const invalidConfig = await client({ TRUSTED_CLIENT_IP_HEADER: "user-agent" });
 assert.equal(invalidConfig(request({ "user-agent": "198.51.100.4" })), "unknown");
});

test("equivalent IPv6 addresses and mapped IPv4 addresses share their rate-limit bucket", async () => {
 const ip = await client({ RAILWAY_ENVIRONMENT_ID: "synthetic-env" });
 assert.equal(ip(request({ "x-real-ip": "2001:0DB8:0000:0000:0000:0000:0000:0001" })), "2001:db8::1");
 assert.equal(ip(request({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
 assert.equal(ip(request({ "x-real-ip": "::ffff:198.51.100.4" })), "198.51.100.4");
});

test("limiter returns remaining fixed-window time and keeps its boolean compatibility API", async () => {
 const writes = []; let returned;
 const db = { insert: () => ({ values: value => ({ onConflictDoUpdate: conflict => ({ returning: async () => { writes.push({ value, conflict }); return returned ? [returned] : []; } }) }) }) };
 const authRateLimits = { key: "key", attempts: "attempts", windowExpiresAt: "expiry" };
 const auth = await isolated("../lib/auth.ts", { sql, getDb: () => db, authRateLimits });
 returned = { attempts: 6, windowExpiresAt: new Date(Date.now() + 35000).toISOString() };
 const denied = await auth.consumeRateLimit("synthetic", " User@EXAMPLE.test ", 5, 900);
 assert.equal(denied.allowed, false); assert.ok(denied.retryAfterSeconds >= 34 && denied.retryAfterSeconds <= 35);
 returned = { attempts: 1, windowExpiresAt: new Date(Date.now() + 900000).toISOString() };
 assert.deepEqual(await auth.consumeRateLimit("synthetic", "user@example.test", 5, 900), { allowed: true, retryAfterSeconds: 0 });
 assert.equal(writes[0].value.key, writes[1].value.key);
 assert.equal(await auth.checkRateLimit("synthetic", "user@example.test", 5, 900), true);
 returned = null;
 assert.deepEqual(await auth.consumeRateLimit("synthetic", "user@example.test", 5, 900), { allowed: false, retryAfterSeconds: 900 });
 assert.match(writes[0].conflict.set.windowExpiresAt.text, /CASE WHEN/);
 assert.equal(writes[0].conflict.set.windowExpiresAt.values.at(-1), authRateLimits.windowExpiresAt, "a denied request cannot extend its existing lock");
});

async function referralHash(env = {}) {
 const values = { REFERRAL_HASH_SALT: "synthetic-only-referral-salt-at-least-32-bytes", NODE_ENV: "production", ...env };
 const trustedClientIp = await client(values);
 return (await isolated("../lib/referrals.ts", { trustedClientIp, createHmac, process: { env: values } }, "export { sourceIpHash };" )).sourceIpHash;
}

test("referral fraud signals cannot use spoofed Cloudflare or forwarded addresses on Railway", async () => {
 const hash = await referralHash({ RAILWAY_PROJECT_ID: "synthetic-project", REFERRAL_TRUSTED_IP_HEADER: "cf-connecting-ip" });
 const original = hash(request({ "x-real-ip": "198.51.100.4", "cf-connecting-ip": "1.2.3.4" }));
 assert.ok(original); assert.equal(original.length, 64);
 assert.equal(hash(request({ "x-real-ip": "198.51.100.4", "cf-connecting-ip": "5.6.7.8", "x-forwarded-for": "9.8.7.6" })), original);
 assert.equal(hash(request({ "cf-connecting-ip": "1.2.3.4" })), null);
 assert.notEqual(hash(request({ "x-real-ip": "198.51.100.5" })), original);
});

test("referral IP hashing keeps explicit non-Railway trust and refuses malformed or ambiguous addresses", async () => {
 const none = await referralHash(); assert.equal(none(request({ "x-real-ip": "198.51.100.4" })), null);
 const configured = await referralHash({ REFERRAL_TRUSTED_IP_HEADER: "x-real-ip" });
 assert.ok(configured(request({ "x-real-ip": "198.51.100.4" })));
 assert.equal(configured(request({ "x-real-ip": "198.51.100.4, 198.51.100.5" })), null);
 const shared = await referralHash({ TRUSTED_CLIENT_IP_HEADER: "x-real-ip" });
 assert.equal(shared(request({ "x-real-ip": "::ffff:198.51.100.4" })), configured(request({ "x-real-ip": "198.51.100.4" })));
});
