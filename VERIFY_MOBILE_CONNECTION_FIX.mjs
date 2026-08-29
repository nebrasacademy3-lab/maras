import fs from "node:fs";
const api = fs.readFileSync("mobile/src/lib/api.ts", "utf8");
const auth = fs.readFileSync("lib/auth.ts", "utf8");
const mobileApi = fs.readFileSync("lib/mobile-api.ts", "utf8");
const eas = JSON.parse(fs.readFileSync("mobile/eas.json", "utf8"));
const config = fs.readFileSync("mobile/app.config.ts", "utf8");
const checks = [
  ["device label is ASCII-safe in fetch", api.includes('safeHeaderText(deviceIdentity.label)')],
  ["safeHeaderText percent-encodes Unicode", api.includes('encodeURIComponent')],
  ["backend decodes device label", auth.includes('decodeURIComponent(decoded)')],
  ["native Android bypasses browser-only same-origin check", mobileApi.includes('platform === "android"')],
  ["native iOS bypasses browser-only same-origin check", mobileApi.includes('platform === "ios"')],
  ["API URL is Railway HTTPS", api.includes('https://marase.up.railway.app') && config.includes('https://marase.up.railway.app')],
  ["preview APK auto increments", eas.build.preview.autoIncrement === true],
  ["preview API URL is Railway", eas.build.preview.env.EXPO_PUBLIC_API_URL === 'https://marase.up.railway.app'],
];
let passed=0;
for (const [name, ok] of checks) { console.log(`${ok ? "✓" : "✗"} ${name}`); if(ok) passed++; }
console.log(`mobile connection fix: ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);
