/** Read-only cross-session browser evidence against dedicated loopback fixtures only. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const fixture = JSON.parse(readFileSync(".data/qa-security-fixtures.json", "utf8"));
const database = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
const origin = "http://127.0.0.1:3100";
if (fixture.origin !== origin || new URL(database.url).hostname !== "127.0.0.1" || new URL(database.url).pathname !== "/maras_qa" || process.env.DATABASE_URL !== database.url) throw new Error("Dedicated loopback QA fixtures required");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext(); context.setDefaultTimeout(15000);
  await context.addCookies([{ name: "meras_session", value: fixture.supervisor.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const me = await context.request.get(origin + "/api/admin/me");
  assert.equal(me.status(), 200);
  const identity = await me.json();
  assert.equal(identity.user.id, fixture.supervisor.id);
  assert.equal(identity.user.isPlatformOwner, false);
  assert.deepEqual([...identity.permissions].sort(), ["catalog.view", "security.manage_self"]);
  assert.equal((await context.request.get(origin + "/api/admin/staff")).status(), 403);
  const page = await context.newPage();
  const response = await page.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
  const links = await page.locator('a[href="/admin/staff"],a[href="/admin/finance"],a[href="/admin/content"]').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute("href"), text: node.textContent?.slice(0, 100), container: node.parentElement?.className })));
  console.log(JSON.stringify({ event: "supervisor.navigation.boundary", status: response.status(), path: new URL(page.url()).pathname, owner: identity.user.isPlatformOwner, permissions: identity.permissions, forbiddenLinks: links }, null, 2));
  await page.getByRole("heading", { name: "نظرة عامة", exact: true }).waitFor();
  await page.getByText("مشرف بصلاحيات محددة", { exact: true }).waitFor();
  const hydrated = await page.locator('a[href="/admin/staff"],a[href="/admin/finance"],a[href="/admin/content"]').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute("href"), text: node.textContent?.slice(0, 100), container: node.parentElement?.className })));
  console.log(JSON.stringify({ event: "supervisor.navigation.ready", forbiddenLinks: hydrated }, null, 2));
  mkdirSync(".data/platform-browser", { recursive: true });
  writeFileSync(".data/platform-browser/supervisor-boundary.json", JSON.stringify({ owner: identity.user.isPlatformOwner, permissions: identity.permissions, forbiddenLinks: hydrated }, null, 2));
  await page.screenshot({ path: ".data/platform-browser/supervisor-boundary.png", fullPage: true, animations: "disabled" });
  assert.equal(hydrated.length, 0, "restricted supervisor must not receive owner/finance/content links");
  await context.close();
} finally { await browser.close(); }
