import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
const fixture = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
if (new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/maras_qa") || fixture.origin !== "http://127.0.0.1:3100") throw new Error("Local synthetic QA only");
const state = JSON.parse(readFileSync(".data/qa-browser-state.json", "utf8"));
const token = state.cookies.find(cookie => cookie.name === "meras_admin_stepup")?.value;
if (!token) throw new Error("Run qa-admin-security first to set up local MFA");
const db = new pg.Client({ connectionString: url }); await db.connect();
const admin = fixture.users.find(user => user.role === "admin"), student = fixture.users.find(user => user.role === "student-b");
const checks = [], now = new Date().toISOString(), expiry = new Date(Date.now() + 20 * 86400000).toISOString();
async function call(payload) { const response = await fetch(fixture.origin + "/api/admin/console", { method: "POST", headers: { authorization: `Bearer ${admin.token}`, origin: fixture.origin, "content-type": "application/json", "x-meras-client": "mobile-v1", "x-meras-admin-stepup": token }, body: JSON.stringify(payload) }); return { status: response.status, data: await response.json() }; }
async function change(id, operation, extra = {}) { return call({ action: "updateAccess", id, operation, reason: "اختبار التحكم بحقوق متجر اصطناعية", operationKey: crypto.randomUUID(), ...extra }); }
async function check(name, run) { await run(); checks.push({ name, status: "passed" }); console.log("PASS " + name); }
async function seed(suffix, source, suspended = null, blocked = null) {
  const slug = "qa-admin-store-" + suffix, txn = "qa-admin-store-transaction-" + suffix;
  await db.query("INSERT INTO catalog_courses(slug,institution_slug,specialty_slug,title,description,price,status) VALUES($1,'qa-university','qa-science','اختبار إدارة حقوق المتجر','بيانات اصطناعية',100,'draft') ON CONFLICT(slug) DO NOTHING", [slug]);
  await db.query("INSERT INTO store_products(product_key,ios_product_id,kind,title,status,created_at,updated_at) VALUES('qa-admin-store-controls','qa.admin.controls','course','اختبار إداري','draft',$1,$1) ON CONFLICT(product_key) DO NOTHING", [now]);
  await db.query("INSERT INTO store_transactions(id,user_id,product_key,provider_purchase_id,transaction_id,store,environment,kind,title,course_slugs_json,status,purchased_at,verified_at,created_at) VALUES($1,$2,'qa-admin-store-controls',$1,$1,'app_store','sandbox','course','اختبار إداري',$3,'owned',$4,$4,$4) ON CONFLICT(id) DO NOTHING", [txn, student.id, JSON.stringify([slug]), now]);
  await db.query("INSERT INTO store_course_grants(transaction_id,user_email,course_slug,starts_at,expires_at,status) VALUES($1,$2,$3,$4,$5,'active') ON CONFLICT(transaction_id,course_slug) DO UPDATE SET starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,status='active'", [txn, student.email, slug, now, expiry]);
  return (await db.query("INSERT INTO course_access(user_email,course_slug,source,order_number,starts_at,expires_at,suspended_at,revoked_at,store_access_blocked_at,updated_at) VALUES($1,$2,$3,'QA-REFUNDED-BASELINE','2025-01-01T00:00:00Z','2025-02-01T00:00:00Z',$4,$5,$6,$7) ON CONFLICT(user_email,course_slug) DO UPDATE SET source=EXCLUDED.source,order_number=EXCLUDED.order_number,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,suspended_at=EXCLUDED.suspended_at,revoked_at=EXCLUDED.revoked_at,store_access_blocked_at=EXCLUDED.store_access_blocked_at,updated_at=EXCLUDED.updated_at RETURNING id", [student.email, slug, source, suspended, source === 'tap' ? now : null, blocked, now])).rows[0].id;
}
try {
  await check("refunded Tap baseline with independent store right can be paused and resumed", async () => {
    const id = await seed("refunded", "tap"); const paused = await change(id, "pause"); assert.equal(paused.status, 200, JSON.stringify(paused.data));
    assert.ok((await db.query("SELECT suspended_at FROM course_access WHERE id=$1", [id])).rows[0].suspended_at);
    const resumed = await change(id, "resume"); assert.equal(resumed.status, 200, JSON.stringify(resumed.data));
    const row = (await db.query("SELECT suspended_at,store_access_blocked_at FROM course_access WHERE id=$1", [id])).rows[0]; assert.equal(row.suspended_at, null); assert.equal(row.store_access_blocked_at, null);
    const revoked = await change(id, "revoke"); assert.equal(revoked.status, 200, JSON.stringify(revoked.data)); assert.ok((await db.query("SELECT store_access_blocked_at FROM course_access WHERE id=$1", [id])).rows[0].store_access_blocked_at);
  });
  await check("extending paused store access uses the store expiry and preserves the pause and purchase ledger", async () => {
    const pause = new Date(Date.now() - 5 * 86400000).toISOString(); const id = await seed("paused", "revenuecat", pause);
    const result = await change(id, "extend", { days: 30 }); assert.equal(result.status, 200, JSON.stringify(result.data));
    const row = (await db.query("SELECT source,expires_at,suspended_at,revoked_at,order_number FROM course_access WHERE id=$1", [id])).rows[0];
    assert.equal(Date.parse(row.expires_at) - Date.parse(expiry), 30 * 86400000); assert.equal(row.suspended_at, pause); assert.equal(row.source, "admin_complimentary"); assert.equal(row.order_number, null); assert.equal(row.revoked_at, null);
    assert.equal((await db.query("SELECT expires_at FROM store_course_grants WHERE transaction_id='qa-admin-store-transaction-paused'")).rows[0].expires_at, expiry);
  });
  await check("administratively blocked store rights cannot be restored by pause resume or extension", async () => {
    const id = await seed("blocked", "tap", null, now);
    for (const operation of ["pause", "resume", "extend"]) { const result = await change(id, operation, { days: 30 }); assert.equal(result.status, 409, operation); }
    assert.equal((await db.query("SELECT store_access_blocked_at FROM course_access WHERE id=$1", [id])).rows[0].store_access_blocked_at, now);
  });
  writeFileSync("verification/admin-live-store-controls.json", JSON.stringify({ generatedAt: new Date().toISOString(), environment: "local PostgreSQL and HTTP, synthetic store ledger", checks }, null, 2));
  console.log(checks.length + " live store administrative controls passed");
} finally { await db.end(); }
