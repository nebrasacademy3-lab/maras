/** Read-only cross-session evidence against dedicated loopback fixtures; no credential logging. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { chromium } from "playwright";
const fixture = JSON.parse(readFileSync(".data/qa-security-fixtures.json", "utf8"));
const database = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
const origin = "http://127.0.0.1:3100";
if (fixture.origin !== origin || new URL(database.url).hostname !== "127.0.0.1" || new URL(database.url).pathname !== "/maras_qa" || process.env.DATABASE_URL !== database.url) throw new Error("Dedicated loopback QA fixtures required");
const pool = new pg.Pool({ connectionString: database.url });
try {
  const state = await pool.query("SELECT u.role, u.status, u.is_platform_owner AS owner, s.revoked_at IS NULL AS unrevoked, s.expires_at > now() AS unexpired, s.mfa_verified_at IS NOT NULL AS verified, EXISTS (SELECT 1 FROM admin_mfa_factors f WHERE f.user_id=u.id AND f.verified_at IS NOT NULL AND f.disabled_at IS NULL) AS requires_mfa FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND u.id=$2", [createHash("sha256").update(fixture.supervisor.token).digest("hex"), fixture.supervisor.id]);
  console.log(JSON.stringify({ event: "synthetic.supervisor.session-state", rows: state.rows }));
  assert.equal(state.rowCount, 1, "supervisor fixture owns one session");
  const row = state.rows[0];
  assert.equal(row.role, "supervisor"); assert.equal(row.owner, false); assert.equal(row.status, "active");
  assert.equal(row.unrevoked, true); assert.equal(row.unexpired, true); assert.ok(!row.requires_mfa || row.verified);
} finally { await pool.end(); }
const raw = await fetch(origin + "/api/auth/me", { headers: { cookie: "meras_session=" + fixture.supervisor.token }, signal: AbortSignal.timeout(15000) });
const rawIdentity = await raw.json();
console.log(JSON.stringify({ event: "synthetic.supervisor.raw-auth", status: raw.status, authenticated: Boolean(rawIdentity.user), role: rawIdentity.user?.role, owner: rawIdentity.user?.isPlatformOwner }));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext(); context.setDefaultTimeout(15000);
  await context.addCookies([{ name: "meras_session", value: fixture.supervisor.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  assert.equal((await context.cookies(origin)).filter(cookie => cookie.name === "meras_session").length, 1);
  const me = await context.request.get(origin + "/api/admin/me");
  const identity = await me.json();
  console.log(JSON.stringify({ event: "synthetic.supervisor.http-auth", status: me.status(), authenticated: Boolean(identity.user), owner: identity.user?.isPlatformOwner, permissions: identity.permissions }));
  assert.equal(me.status(), 200);
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
