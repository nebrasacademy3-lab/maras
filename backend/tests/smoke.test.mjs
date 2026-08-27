import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 3217;

async function waitForServer(url, child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.status >= 200) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("server did not start in time");
}

test("production server serves the public shell and reports missing database clearly", async (t) => {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:" + port, DATABASE_URL: "" },
    stdio: "ignore",
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(`http://127.0.0.1:${port}/login`, child);

  const page = await fetch(`http://127.0.0.1:${port}/login`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /تسجيل الدخول/);

  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 503);
  assert.equal((await health.json()).database, "unavailable");
});
