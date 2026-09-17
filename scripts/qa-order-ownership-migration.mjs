/** Exercises the real migration against a disposable legacy database, never production. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";

const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
if (new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/maras_qa") throw new Error("Isolated loopback QA database required");
const name = "maras_qa_owner_" + randomBytes(6).toString("hex");
const parent = new pg.Client({ connectionString: url });
await parent.connect();
const targetUrl = new URL(url); targetUrl.pathname = "/" + name;
const client = new pg.Client({ connectionString: targetUrl.toString() });
let connected = false;
const checks = [];
const pass = name => { checks.push(name); console.log("PASS OWNER MIGRATION", name); };
try {
  await parent.query(`CREATE DATABASE "${name}"`);
  await client.connect(); connected = true;
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const index = journal.entries.findIndex(entry => entry.tag === "0036_order_owner_and_notification_target");
  assert.ok(index > 0);
  await client.query("BEGIN");
  for (const migration of migrations.slice(0, index)) for (const sql of migration.sql) if (sql.trim()) await client.query(sql);
  await client.query("COMMIT");
  const old = "2025-01-01T00:00:00.000Z", issued = "2026-01-10T00:00:00.000Z";
  async function user(email, created = old) {
    return (await client.query("INSERT INTO users(email,full_name,created_at) VALUES($1,'Synthetic',$2) RETURNING id", [email, created])).rows[0].id;
  }
  const owner = await user("changed@example.test"), reused = await user("old@example.test", "2026-02-01T00:00:00.000Z");
  const legacy = await user("legacy@example.test"), changed = await user("was-changed@example.test");
  await user("Case@example.test"); await user("case@example.test");
  const couponOwner = await user("coupon@example.test");
  await client.query("INSERT INTO email_change_requests(user_id,current_email,new_email,challenge_nonce,current_code_hash,new_code_hash,expires_at,current_verified_at,new_verified_at,used_at) VALUES($1,'previous@example.test','was-changed@example.test','fixture','hash1','hash2',$2,$2,$2,$2)", [changed, issued]);
  const coupon = (await client.query("INSERT INTO coupons(code,type,value) VALUES('QAOWNER','fixed',10) RETURNING id")).rows[0].id;
  const specs = [
    ["anchor", "old@example.test", `${owner}:checkout_fixture_001`, owner],
    ["unique", "legacy@example.test", null, legacy],
    ["orphan", "absent@example.test", null, null],
    ["ambiguous", "CASE@example.test", null, null],
    ["reused", "old@example.test", null, null],
    ["changed", "was-changed@example.test", null, null],
    ["bad-key", "legacy@example.test", "invalid-checkout-key", null],
    ["coupon", "retired@example.test", null, couponOwner],
    ["conflict", "old@example.test", `${owner}:checkout_fixture_002`, null],
    ["date-invalid", "legacy@example.test", null, null],
  ];
  for (const [key, email, checkout] of specs) {
    await client.query("INSERT INTO orders(order_number,customer_email,customer_name,course_slug,subtotal,total,checkout_key,created_at) VALUES($1,$2,'Historical Name','qa-physics',100,100,$3,$4)", [key, email, checkout, key === "date-invalid" ? "invalid-date" : issued]);
  }
  for (const order of ["coupon", "conflict"]) await client.query("INSERT INTO coupon_uses(coupon_id,user_id,order_number,status,reservation_expires_at) VALUES($1,$2,$3,'released','2026-12-01T00:00:00.000Z')", [coupon, couponOwner, order]);
  await client.query("INSERT INTO invoices(invoice_number,order_number,customer_email,total,snapshot_json) VALUES('INV-anchor','anchor','old@example.test',100,$1)", [JSON.stringify({ customer: { name: "Historical Name", email: "old@example.test" } })]);
  await client.query("INSERT INTO notifications(user_email,audience,title,body,created_at) VALUES('legacy@example.test','student','private-known','fixture',$1),('old@example.test','student','private-reused','fixture',$1),('CASE@example.test','student','private-ambiguous','fixture',$1),(NULL,'public','public','fixture',$1)", [issued]);
  const originalOrders = (await client.query("SELECT * FROM orders ORDER BY id")).rows;
  const originalInvoice = (await client.query("SELECT * FROM invoices")).rows;
  await client.query("BEGIN");
  for (const sql of migrations[index].sql) if (sql.trim()) await client.query(sql);
  await client.query("COMMIT");
  const migrated = (await client.query("SELECT * FROM orders ORDER BY id")).rows;
  for (const [key, , , expected] of specs) assert.equal(migrated.find(row => row.order_number === key).user_id, expected, key);
  pass("stable checkout/coupon anchors win; ambiguous, reused, contradictory and invalid-date evidence stays quarantined");
  assert.deepEqual(migrated.map(row => { const snapshot = { ...row }; delete snapshot.user_id; return snapshot; }), originalOrders);
  assert.deepEqual((await client.query("SELECT * FROM invoices")).rows, originalInvoice);
  assert.equal((await client.query("SELECT * FROM order_ownership_reviews")).rowCount, specs.filter(([, , , owner]) => !owner).length);
  pass("backfill preserves every original order/invoice field and records all unresolved rows for review");
  for (const [key, next] of [["anchor", reused], ["anchor", null], ["orphan", legacy]]) {
    await assert.rejects(client.query("UPDATE orders SET user_id=$1 WHERE order_number=$2", [next, key]), error => error.code === "23514");
  }
  await assert.rejects(client.query("DELETE FROM users WHERE id=$1", [owner]), error => error.code === "23001");
  pass("database rejects reassignment, clearing, opportunistic orphan claiming and deletion of a bound owner");
  const notices = (await client.query("SELECT title,target_user_id,user_email FROM notifications ORDER BY id")).rows;
  assert.equal(notices.find(row => row.title === "private-known").target_user_id, legacy);
  for (const title of ["private-reused", "private-ambiguous"]) { const row = notices.find(row => row.title === title); assert.equal(row.target_user_id, null); assert.ok(row.user_email); }
  assert.equal(notices.find(row => row.title === "public").user_email, null);
  pass("historical private notifications cannot become broadcasts or follow a newly reused email");
  await client.query("INSERT INTO orders(order_number,customer_email,customer_name,course_slug,subtotal,total) VALUES('new-unbound','legacy@example.test','Fixture','qa-physics',1,1)");
  assert.equal((await client.query("SELECT reason FROM order_ownership_reviews r JOIN orders o ON o.id=r.order_id WHERE o.order_number='new-unbound'")).rows[0].reason, "missing_owner_at_creation");
  const inserted = (await client.query("INSERT INTO notifications(user_email,title,body) VALUES('legacy@example.test','compat','fixture') RETURNING target_user_id")).rows[0];
  assert.equal(inserted.target_user_id, legacy);
  await client.query("UPDATE users SET email='legacy-new@example.test' WHERE id=$1", [legacy]);
  await user("legacy@example.test");
  assert.equal((await client.query("SELECT target_user_id FROM notifications WHERE title='compat'")).rows[0].target_user_id, legacy);
  pass("new unbound orders require review and legacy notification writers bind once, not on later delivery");
  writeFileSync(".data/qa-order-ownership-migration-report.json", JSON.stringify({ passed: checks.length, checks, database: "disposable legacy PostgreSQL", liveProviders: false }, null, 2));
} finally {
  if (connected) await client.end();
  await parent.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await parent.end();
}
