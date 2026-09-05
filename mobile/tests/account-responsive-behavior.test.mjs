import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
function load(path, mocks = {}) {
  const source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, URL, Uint8Array, console, require: (name) => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected import ${name}`); } }, { filename: path });
  return exports;
}
const routing = load("src/lib/notification-routing.ts", { "expo-router": { router: {} }, "react-native": { Linking: {} } });
const access = load("src/lib/account-access.ts", { "@/src/lib/notification-routing": routing });
const position = load("src/lib/floating-position.ts");
const user = { id: 1, fullName: "Student Name", phone: "0501234567", universitySlug: "test-university", specialty: "Computer Science", academicLevel: "المستوى الأول", emailVerified: true, profileCompleted: true, onboardingCompleted: true };

test("verified complete account purchases repeatedly without another email challenge", () => {
  for (let purchase = 0; purchase < 10; purchase++) {
    assert.equal(access.purchaseAccountRequirement(user), null);
    assert.equal(access.authDestination(user, undefined, "/cart"), "/cart");
  }
});
test("email then profile requirements preserve the requested destination", () => {
  assert.equal(access.authDestination({ ...user, emailVerified: false, profileCompleted: false }, undefined, "/cart"), "/verify-email?return_to=%2Fcart");
  assert.equal(access.authDestination({ ...user, profileCompleted: false }, undefined, "/cart"), "/complete-profile?return_to=%2Fcart");
  assert.equal(access.authDestination({ ...user, onboardingCompleted: false }, undefined, "/cart"), "/onboarding?return_to=%2Fcart");
  assert.equal(access.authDestination(user, undefined, "//attacker.example"), "/(tabs)");
  assert.equal(access.authDestination(user, undefined, "/verify-email"), "/(tabs)");
});
test("every purchase needs actual profile fields even when the account is an admin", () => {
  for (const field of ["fullName", "phone", "universitySlug", "specialty", "academicLevel"]) assert.equal(access.purchaseAccountRequirement({ ...user, role: "admin", [field]: "" }), "/complete-profile");
  assert.equal(access.purchaseAccountRequirement({ ...user, emailVerified: false }), "/verify-email");
  assert.equal(access.purchaseAccountRequirement(null), "/(auth)/login");
});
test("one-time codes normalize Arabic and Persian digits without changing their length", () => {
  assert.equal(access.normalizeEmailCode("١٢٣٤٥٦"), "123456");
  assert.equal(access.normalizeEmailCode("۱۲۳۴۵۶"), "123456");
  assert.equal(access.normalizeEmailCode("12 34-56 extra789"), "123456");
});

function socialMock({ startUrl = "https://api.example/api/auth/oauth/google/start?bootstrap=opaque", result = { type: "success", url: "merasalelm://oauth/callback?code=" + "A".repeat(43) } } = {}) {
  const calls = [];
  class ApiError extends Error {}
  const oauth = load("src/lib/social-auth.ts", {
    "expo-crypto": { getRandomBytesAsync: async (length) => Uint8Array.from({ length }, (_, index) => index + 1), CryptoDigestAlgorithm: { SHA256: "SHA256" }, CryptoEncoding: { BASE64: "base64" }, digestStringAsync: async (_algorithm, value) => createHash("sha256").update(value).digest("base64") },
    "expo-web-browser": { openAuthSessionAsync: async (...args) => { calls.push({ kind: "browser", args }); return result; } },
    "@/src/lib/api": { API_URL: "https://api.example", ApiError, jsonBody: JSON.stringify, api: async (path, request) => { calls.push({ kind: "start", path, body: JSON.parse(request.body) }); return { url: startUrl }; } },
  });
  return { oauth, calls };
}
test("native Google sign-in uses a system browser, exact callback and SHA256 PKCE", async () => {
  const { oauth, calls } = socialMock();
  const exchange = await oauth.socialAuthCode("google", " meras-123 ");
  assert.match(exchange.codeVerifier, /^[a-f0-9]{64}$/);
  assert.equal(calls[0].body.codeChallenge, createHash("sha256").update(exchange.codeVerifier).digest("base64url"));
  assert.equal(calls[0].body.referralCode, "MERAS-123");
  assert.equal(calls[0].body.redirectUri, "merasalelm://oauth/callback");
  assert.equal(calls[1].args[1], "merasalelm://oauth/callback");
  assert.equal(exchange.code, "A".repeat(43));
  assert.equal("token" in exchange, false);
});
test("OAuth cancel never returns credentials and wrong redirect/start origin is rejected", async () => {
  const cancel = socialMock({ result: { type: "cancel" } });
  assert.equal(await cancel.oauth.socialAuthCode("google"), null);
  const badCallback = socialMock({ result: { type: "success", url: "evil://oauth/callback?code=" + "B".repeat(43) } });
  await assert.rejects(() => badCallback.oauth.socialAuthCode("google"));
  const badOrigin = socialMock({ startUrl: "https://attacker.example/api/auth/oauth/google/start" });
  await assert.rejects(() => badOrigin.oauth.socialAuthCode("google"));
  assert.equal(badOrigin.calls.some((call) => call.kind === "browser"), false);
});
test("provider error or bearer-token callback cannot become a native session", async () => {
  for (const query of ["error=access_denied", "token=secret", "code=short", "code=bad%2Fcode"]) {
    const { oauth } = socialMock({ result: { type: "success", url: `merasalelm://oauth/callback?${query}` } });
    await assert.rejects(() => oauth.socialAuthCode("google"));
  }
});
test("native Apple uses its own same-origin bootstrap and PKCE", async () => {
  const { oauth, calls } = socialMock({ startUrl: "https://api.example/api/auth/oauth/apple/start?bootstrap=opaque" });
  await oauth.socialAuthCode("apple");
  assert.equal(calls[0].path, "/api/auth/oauth/apple/start");
});

test("floating assistant remains in safe areas on phones, tablets and rotation", () => {
  for (const [width, height] of [[320, 568], [360, 800], [800, 360], [768, 1024], [1440, 900]]) {
    const bounds = position.floatingBounds(width, height, { top: 34, left: 12, right: 12, bottom: 24 });
    for (const source of [{ x: -10000, y: 99999 }, { x: 99999, y: -10000 }, { x: NaN, y: NaN }]) {
      const point = position.clampFloatingPoint(source, bounds);
      assert.ok(point.x >= 24 && point.y >= 46);
      assert.ok(point.x + position.ASSISTANT_SIZE <= width - 24);
      assert.ok(point.y + position.ASSISTANT_SIZE <= height - 36);
    }
  }
});
test("saved normalized position survives rotation and corrupt storage falls back", () => {
  const portrait = position.floatingBounds(360, 800, { top: 30, right: 0, bottom: 24, left: 0 });
  const landscape = position.floatingBounds(800, 360, { top: 0, right: 30, bottom: 0, left: 30 });
  const saved = position.normalizedFloatingPoint({ x: 220, y: 350 }, portrait);
  const restored = position.resolveFloatingPoint(saved, landscape, true);
  const normalized = position.normalizedFloatingPoint(restored, landscape);
  assert.ok(Math.abs(saved.x - normalized.x) < 1e-6);
  assert.ok(Math.abs(saved.y - normalized.y) < 1e-6);
  for (const raw of [null, "broken", '{"x":2,"y":0}', '{"x":0}', '"hello"']) assert.equal(position.parseFloatingPoint(raw), null);
});
test("a long press or drag never opens the assistant on release", () => {
  assert.equal(position.floatingReleaseAction(false, false), "open");
  assert.equal(position.floatingReleaseAction(true, false), "save");
  assert.equal(position.floatingReleaseAction(true, true), "save");
  assert.equal(position.floatingReleaseAction(false, true), "cancel");
});
test("mobile home keeps track descriptions, all tracks and wrapping button labels", () => {
  const tracks = read("src/components/LearningTracks.tsx");
  assert.doesNotMatch(tracks, /!compact\s*&&\s*track\.description|\.slice\(0,\s*3\)/);
  assert.match(tracks, /track\.description/);
  assert.match(tracks, /homeGrid:.*flexWrap: "wrap"/);
  assert.match(read("src/components/ui.tsx"), /buttonText:.*flexShrink: 1/);
  assert.doesNotMatch(read("src/components/HomePartners.tsx"), /numberOfLines/);
  assert.match(read("src/components/AssistantFab.tsx"), /meras_assistant_position_\$\{user\?\.id/);
  assert.match(read("src/components/AssistantFab.tsx"), /resetPosition/);
});
