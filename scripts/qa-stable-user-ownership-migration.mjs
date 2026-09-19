/** Run the real stable-user migration on a disposable legacy PostgreSQL database. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";

const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
const parsed = new URL(url);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/maras_qa") throw new Error("Isolated loopback QA database required");
const name = "maras_qa_stable_" + randomBytes(6).toString("hex");
const parent = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
await parent.connect();
const target = new URL(url); target.pathname = "/" + name;
const client = new pg.Client({ connectionString: target.toString(), connectionTimeoutMillis: 5000, statement_timeout: 30000 });
let connected = false, created = false;
const checks = [];
function pass(name) { checks.push(name); console.log("PASS STABLE USER MIGRATION", name); }
const tables = ["support_tickets", "course_access", "course_access_events", "lesson_progress",
  "favorites", "cart_items", "lesson_notes", "course_reviews", "course_waitlist", "store_course_grants"];
async function insert(table, values) {
  assert.ok([...tables, "users", "orders", "store_products", "store_transactions"].includes(table));
  const keys = Object.keys(values);
  assert.ok(keys.every(key => /^[a-z_]+$/.test(key)));
  return (await client.query(`INSERT INTO "${table}" (${keys.map(key => `"${key}"`).join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")}) RETURNING *`, Object.values(values))).rows[0];
}
async function snapshot() {
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, (await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows])));
}
try {
  await parent.query(`CREATE DATABASE "${name}"`); created = true;
  await client.connect(); connected = true;
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const index = journal.entries.findIndex(entry => entry.tag === "0037_stable_user_ownership");
  assert.ok(index > 0);
  await client.query("BEGIN");
  for (const migration of migrations.slice(0, index)) for (const sql of migration.sql) if (sql.trim()) await client.query(sql);
  await client.query("COMMIT");
  const oldEmail = "reused@example.test", currentEmail = "current@example.test";
  const owner = await insert("users", { email: "changed@example.test", full_name: "Owner", created_at: "2020-01-01" });
  const reused = await insert("users", { email: oldEmail, full_name: "New holder", created_at: "2026-02-01" });
  await insert("users", { email: currentEmail, full_name: "Same email without proof", created_at: "2020-01-01" });
  const unresolved = [];
  // Neither an unchanged matching email nor an unrecorded reuse proves ownership.
  for (const [number, email] of [currentEmail, oldEmail].entries()) {
    const common = { user_email: email, course_slug: `qa-legacy-${number}` };
    const rows = [
      ["support_tickets", { user_email: email, ticket_number: `QA-LEGACY-${number}`, category: "general", title: "Fixture", message: "Fixture" }],
      ["course_access", common],
      ["course_access_events", { ...common, event_key: `legacy-${number}`, action: "grant" }],
      ["lesson_progress", { ...common, lesson_id: `legacy-lesson-${number}` }],
      ["favorites", common], ["cart_items", common],
      ["lesson_notes", { user_email: email, lesson_id: `legacy-lesson-${number}`, body: "Historical note" }],
      ["course_reviews", { ...common, rating: 5 }], ["course_waitlist", common],
    ];
    for (const [table, values] of rows) unresolved.push({ table, id: (await insert(table, values)).id });
  }
  for (const [number, user] of [owner, reused].entries()) await insert("orders", {
    user_id: user.id, order_number: `QA-ANCHOR-${number}`, customer_email: oldEmail, customer_name: "Historical name",
    course_slug: "qa-anchored", subtotal: 100, total: 100,
  });
  const access = await insert("course_access", { user_email: oldEmail, course_slug: "qa-anchored", order_number: "QA-ANCHOR-0" });
  const cases = [
    ["access-only", access.id, null, owner.id],
    ["order-only", null, "QA-ANCHOR-1", reused.id],
    ["agree", access.id, "QA-ANCHOR-0", owner.id],
    ["conflict", access.id, "QA-ANCHOR-1", null],
  ];
  const events = [];
  for (const [key, accessId, order, expected] of cases) {
    const event = await insert("course_access_events", { event_key: key, access_id: accessId, order_number: order, user_email: oldEmail, course_slug: "qa-anchored", action: "grant" });
    events.push({ id: event.id, expected });
    if (expected === null) unresolved.push({ table: "course_access_events", id: event.id });
  }
  const now = "2026-01-01T00:00:00.000Z";
  await insert("store_products", { product_key: "qa-stable", kind: "course", title: "Fixture", created_at: now, updated_at: now });
  await insert("store_transactions", {
    id: "qa-stable-tx", user_id: owner.id, product_key: "qa-stable", provider_purchase_id: "qa-stable-purchase",
    transaction_id: "qa-stable-provider", store: "app_store", environment: "SANDBOX", kind: "course", title: "Fixture",
    course_slugs_json: '["qa-anchored"]', status: "active", purchased_at: now, verified_at: now, created_at: now,
  });
  const grant = await insert("store_course_grants", { transaction_id: "qa-stable-tx", user_email: oldEmail, course_slug: "qa-anchored", starts_at: now, status: "active" });
  const before = await snapshot();
  await client.query("BEGIN");
  for (const sql of migrations[index].sql) if (sql.trim()) await client.query(sql);
  await client.query("COMMIT");
  const after = await snapshot();
  for (const { table, id } of unresolved) assert.equal(after[table].find(row => row.id === id).user_id, null, `${table}:${id}`);
  pass("matching and reused email snapshots stay unresolved without stable relational evidence");
  assert.equal(after.course_access.find(row => row.id === access.id).user_id, owner.id);
  assert.equal(after.store_course_grants.find(row => row.id === grant.id).user_id, owner.id);
  for (const event of events) assert.equal(after.course_access_events.find(row => row.id === event.id).user_id, event.expected);
  pass("order and transaction anchors bind correctly; conflicting event anchors never choose an owner");
  for (const table of tables) assert.deepEqual(after[table].map(row => {
    const value = { ...row }; delete value.user_id; return value;
  }), before[table], table);
  const reviews = (await client.query("SELECT * FROM user_ownership_reviews")).rows;
  const entityNames = ["support_ticket", "course_access", "course_access_event", "lesson_progress", "favorite", "cart_item", "lesson_note", "course_review", "course_waitlist", "store_course_grant"];
  assert.equal(reviews.length, unresolved.length);
  for (const { table, id } of unresolved) assert.ok(reviews.some(row => row.entity_type === entityNames[tables.indexOf(table)] && row.entity_id === String(id)));
  pass("all legacy fields are preserved and every unresolved record has an auditable review entry");
  const favorite = { user_id: owner.id, user_email: oldEmail, course_slug: "qa-owner-unique" };
  await insert("favorites", favorite);
  await assert.rejects(insert("favorites", { ...favorite, user_email: "changed@example.test" }), error => error.code === "23505");
  await insert("favorites", { ...favorite, user_id: reused.id });
  await assert.rejects(insert("favorites", { ...favorite, user_id: 2147483647 }), error => error.code === "23503");
  pass("owner-scoped uniqueness survives email changes, isolates identical emails and enforces the user foreign key");
  await client.query("UPDATE users SET email='moved@example.test' WHERE id=$1", [reused.id]);
  const newest = await insert("users", { email: oldEmail, full_name: "Newest holder" });
  assert.equal((await client.query("SELECT id FROM favorites WHERE user_id=$1", [newest.id])).rowCount, 0);
  for (const { table, id } of unresolved) assert.equal((await client.query(`SELECT user_id FROM "${table}" WHERE id=$1`, [id])).rows[0].user_id, null);
  pass("subsequent email reuse cannot claim either migrated ownership or quarantined records");
  mkdirSync(".data", { recursive: true });
  writeFileSync(".data/qa-stable-user-ownership-migration-report.json", JSON.stringify({ passed: checks.length, checks, database: "disposable legacy PostgreSQL", liveProviders: false }, null, 2));
} finally {
  try { if (connected) await client.end(); }
  finally {
    try { if (created) await parent.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
    finally { await parent.end(); }
  }
}
