import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("Expo Web origin is trusted consistently by CORS and CSRF validation", async () => {
  const [auth, proxy, assistant] = await Promise.all([
    read("lib/auth.ts"),
    read("proxy.ts"),
    read("app/api/assistant/route.ts"),
  ]);
  assert.match(auth, /process\.env\.EXPO_WEB_ORIGIN/);
  assert.match(proxy, /process\.env\.EXPO_WEB_ORIGIN/);
  assert.match(assistant, /sameOriginRequest\(request\)/);
  assert.match(proxy, /acceptedOrigins\(request\)\.has\(origin\)/);
});
