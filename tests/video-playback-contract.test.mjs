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

test("signed video URLs remain playable by native/browser media range requests", async () => {
  const route = await read("app/api/video/[lessonId]/route.ts");
  assert.match(route, /eq\(courseAccess\.userEmail, grant\.email\)/);
  assert.match(route, /if \(user && user\.email !== grant\.email\)/);
  assert.match(route, /Accept-Ranges/);
  assert.match(route, /Cross-Origin-Resource-Policy", "cross-origin/);
  assert.match(route, /Referrer-Policy", "no-referrer/);
});

test("Expo web CORS includes device identity headers used by the mobile client", async () => {
  const proxy = await read("proxy.ts");
  for (const header of ["x-meras-device-id", "x-meras-device-label", "x-meras-platform"]) {
    assert.match(proxy, new RegExp(header));
  }
});
