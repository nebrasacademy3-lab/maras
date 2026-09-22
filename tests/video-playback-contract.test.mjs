import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("web player preserves the entire video frame instead of cropping it", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.secure-player video[^}]*object-fit:contain/);
  assert.doesNotMatch(css, /\.secure-player video[^}]*object-fit:cover/);
});

test("signed HLS keeps account authorization and never exposes the original range endpoint", async () => {
  const [route, access] = await Promise.all([read("app/api/video/[lessonId]/route.ts"), read("lib/video-access.ts")]);
  assert.match(route, /authorizeVideoRequest\(request,/);
  assert.match(access, /activeCourseAccessWhere\(user\.id, courseSlug\)/);
  assert.doesNotMatch(access, /activeCourseAccessWhere\(grant\.email/);
  assert.match(access, /if \(!user\)/);
  assert.match(access, /if \(user\.email !== grant\.email\)/);
  assert.doesNotMatch(route, /getObject|Accept-Ranges/);
  assert.match(route, /jsonError\([^;]+403\)/);
  const hls = await read("app/api/video/[lessonId]/hls/[...path]/route.ts");
  assert.match(hls, /encryptMediaBody/);
  assert.match(hls, /"referrer-policy": "no-referrer"/);
});

test("Expo web CORS includes device identity headers used by the mobile client", async () => {
  const proxy = await read("proxy.ts");
  for (const header of ["x-meras-device-id", "x-meras-device-label", "x-meras-platform"]) {
    assert.match(proxy, new RegExp(header));
  }
});
