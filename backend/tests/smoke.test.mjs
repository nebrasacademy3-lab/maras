import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 3217;
const base = `http://127.0.0.1:${port}`;

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

test("production server serves public web/mobile contracts and reports database health", async (t) => {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: base, DATABASE_URL: "", ADMIN_API_TOKEN: "management-test-secret", ADMIN_UPLOAD_TOKEN: "upload-test-secret" },
    stdio: "ignore",
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(`${base}/login`, child);

  for (const path of ["/", "/login", "/register", "/courses", "/universities", "/api/catalog/search", "/api/mobile/catalog", "/api/catalog/programs?institution=ksu", "/api/public/settings"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, `${path} should be public and healthy`);
  }

  const page = await fetch(`${base}/login`);
  assert.match(await page.text(), /تسجيل الدخول/);
  const catalog = await (await fetch(`${base}/api/mobile/catalog`)).json();
  assert.ok(Array.isArray(catalog.courses));
  assert.ok(Array.isArray(catalog.institutions));

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 503);
  assert.equal((await health.json()).database, "unavailable");

  const unauthenticatedSupport = await fetch(`${base}/api/support`);
  assert.equal(unauthenticatedSupport.status, 401);
  const unauthenticatedSupportFile = await fetch(`${base}/api/support/files/1`);
  assert.equal(unauthenticatedSupportFile.status, 401);
  const unauthenticatedSupportDelete = await fetch(`${base}/api/support`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketId: 1 }) });
  assert.equal(unauthenticatedSupportDelete.status, 403);
  const crossOriginSupport = await fetch(`${base}/api/support`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ title: "test", message: "this should be rejected" }) });
  assert.equal(crossOriginSupport.status, 403);

  const unauthenticatedAdmin = await fetch(`${base}/api/admin/console`);
  assert.equal(unauthenticatedAdmin.status, 403);
  const uploadTokenOnAdminConsole = await fetch(`${base}/api/admin/console`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, "x-admin-token": "upload-test-secret" },
    body: JSON.stringify({ action: "unknown" }),
  });
  assert.equal(uploadTokenOnAdminConsole.status, 403);
  const crossOriginMutation = await fetch(`${base}/api/admin/console`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ action: "unknown" }),
  });
  assert.equal(crossOriginMutation.status, 403);
});
