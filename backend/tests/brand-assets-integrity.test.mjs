import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const backendRoot = new URL("..", import.meta.url);
const mobileRoot = new URL("../../mobile/", import.meta.url);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function inspectPng(buffer, label) {
  assert.ok(buffer.subarray(0, 8).equals(pngSignature), `${label}: invalid PNG signature`);
  let offset = 8;
  let dimensions;
  let complete = false;
  while (offset < buffer.length) {
    assert.ok(offset + 12 <= buffer.length, `${label}: truncated PNG chunk header`);
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const next = offset + 12 + length;
    assert.ok(next <= buffer.length, `${label}: truncated ${type} chunk`);
    if (type === "IHDR") {
      assert.equal(length, 13, `${label}: invalid IHDR length`);
      dimensions = [buffer.readUInt32BE(offset + 8), buffer.readUInt32BE(offset + 12)];
    }
    if (type === "IEND") {
      assert.equal(length, 0, `${label}: invalid IEND length`);
      assert.equal(next, buffer.length, `${label}: bytes found after IEND`);
      complete = true;
      break;
    }
    offset = next;
  }
  assert.ok(dimensions, `${label}: missing IHDR`);
  assert.ok(complete, `${label}: missing IEND (file is incomplete)`);
  return dimensions;
}

test("all app and web brand PNG files are complete at their intended resolution", async () => {
  const specs = [
    [backendRoot, "public/brand/logo-light-hq.png", 1984, 1156],
    [backendRoot, "public/brand/logo-dark-hq.png", 1984, 1156],
    [backendRoot, "public/brand/logo-light.png", 1984, 1156],
    [backendRoot, "public/brand/logo-dark.png", 1984, 1156],
    [backendRoot, "public/brand/mark-official-hq.png", 1600, 800],
    [backendRoot, "public/brand/mark-light.png", 1024, 1024],
    [backendRoot, "public/brand/mark-dark.png", 1024, 1024],
    [backendRoot, "public/brand/mark-m.png", 1024, 1024],
    [backendRoot, "public/brand/app-icon-192.png", 192, 192],
    [backendRoot, "public/brand/app-icon-512.png", 512, 512],
    [backendRoot, "public/brand/app-icon-maskable-512.png", 512, 512],
    [backendRoot, "public/brand/apple-touch-icon.png", 180, 180],
    [mobileRoot, "assets/icon.png", 1024, 1024],
    [mobileRoot, "assets/adaptive-icon.png", 1024, 1024],
    [mobileRoot, "assets/splash-icon.png", 1024, 1024],
    [mobileRoot, "assets/splash-icon-dark.png", 1024, 1024],
    [mobileRoot, "assets/favicon.png", 512, 512],
    [mobileRoot, "assets/notification-icon.png", 96, 96],
    [mobileRoot, "assets/monochrome-icon.png", 1024, 1024],
    [mobileRoot, "assets/brand-mark.png", 1600, 800],
    [mobileRoot, "assets/brand-mark-dark.png", 1600, 800],
    [mobileRoot, "assets/brand-logo-light.png", 1984, 1156],
    [mobileRoot, "assets/brand-logo-dark.png", 1984, 1156],
  ];
  for (const [root, relative, width, height] of specs) {
    const dimensions = inspectPng(await readFile(new URL(relative, root)), relative);
    assert.deepEqual(dimensions, [width, height], `${relative}: unexpected dimensions`);
  }
});

test("brand components preserve the complete official mark instead of cropping it", async () => {
  const [webCss, mobileBrand, mobileConfig] = await Promise.all([
    readFile(new URL("app/additions.css", backendRoot), "utf8"),
    readFile(new URL("src/components/Brand.tsx", mobileRoot), "utf8"),
    readFile(new URL("app.config.ts", mobileRoot), "utf8"),
  ]);
  assert.match(webCss, /\.brand-mark\s*\{[^}]*width:\s*54px;[^}]*height:\s*54px;/s);
  assert.match(mobileBrand, /assets\/brand-mark(?:-dark)?\.png/);
  assert.match(mobileBrand, /contentFit="contain"/);
  assert.match(mobileConfig, /monochromeImage:\s*["']\.\/assets\/monochrome-icon\.png["']/);
  assert.match(mobileConfig, /["']expo-notifications["'][^\]]*icon:\s*["']\.\/assets\/notification-icon\.png["']/s);
});
