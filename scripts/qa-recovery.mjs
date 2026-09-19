/** Real backup/restore drill. Creates and destroys only its own disposable loopback databases. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp, readdir, access, unlink, symlink } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createBackup, restoreBackup, bundleDigest } from "./recovery/bundle.mjs";
import { openManifest, sealBytes } from "./recovery/crypto.mjs";

const { url } = JSON.parse(await readFile(".data/qa-database.json", "utf8"));
const base = new URL(url);
if (base.hostname !== "127.0.0.1" || base.pathname !== "/maras_qa" || process.env.QA_DATABASE_URL && process.env.QA_DATABASE_URL !== url) throw new Error("Dedicated loopback QA required");
for (const key of ["RAILWAY_PROJECT_ID", "S3_ENDPOINT", "S3_BUCKET", "GEMINI_API_KEY", "GEMINI_API_KEYS", "RESEND_API_KEY", "TAP_SECRET_KEY"]) if (process.env[key]) throw new Error("No live service credentials in recovery drill");
const nonce = randomBytes(8).toString("hex"), sourceName = "maras_qa_recovery_" + nonce;
const restoredName = "maras_restore_" + nonce, latestName = "maras_restore_current_" + nonce, failedName = "maras_restore_invalid_" + nonce;
const allNames = [sourceName, restoredName, latestName, failedName];
const parent = new pg.Client({ connectionString: url }); await parent.connect();
const sourceUrl = new URL(url); sourceUrl.pathname = "/" + sourceName;
const source = new pg.Pool({ connectionString: sourceUrl.toString() });
const root = await mkdtemp(resolve(".data/recovery-drill-")), objects = join(root, "uploads"), bundle = join(root, "backup"), key = randomBytes(32);
const checks = [], started = performance.now();
const pass = text => { checks.push(text); console.info("PASS RECOVERY", text); };
const releaseSha = process.env.RECOVERY_RELEASE_SHA || "3a648b91c680fe396d094311523ef9cc456539e6";
const binDir = process.env.RECOVERY_PG_BIN_DIR;
const backupOptions = { databaseUrl: sourceUrl.toString(), uploadDir: objects, bundleDir: bundle, key, releaseSha, binDir, writesPaused: true, storageMode: "local" };
const restoreOptions = { adminUrl: url, databaseName: restoredName, uploadDir: join(root, "restored"), bundleDir: bundle, key, binDir, trustedBackup: true };
const synthetic = new Map([
  ["private/recovery/clean.pdf", Buffer.from("%PDF-1.4\nsynthetic clean document bytes\n%%EOF")],
  ["private/recovery/quarantined.bin", Buffer.from("synthetic quarantine sentinel, not malware")],
  ["private/recovery/video.mp4", randomBytes(1024 * 1024 + 11)],
]);
async function snapshot(db) {
  const tables = (await db.query("SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','drizzle') ORDER BY 1,2")).rows;
  const data = {};
  for (const { schema, name } of tables) {
    assert.match(schema + name, /^[a-zA-Z0-9_]+$/);
    const rows = (await db.query(`SELECT row_to_json(t)::text AS value FROM "${schema}"."${name}" t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows.map(row => row.value);
    data[schema + "." + name] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  return data;
}
async function isDatabase(name) { return Boolean((await parent.query("SELECT 1 FROM pg_database WHERE datname=$1", [name])).rowCount); }
async function connectRestored(name) {
  await parent.query(`ALTER DATABASE "${name}" ALLOW_CONNECTIONS true`);
  const target = new URL(url); target.pathname = "/" + name;
  return new pg.Pool({ connectionString: target.toString() });
}
async function compareObjects(path) { for (const [name, data] of synthetic) assert.deepEqual(await readFile(join(path, "objects", name)), data); }
try {
  await parent.query(`CREATE DATABASE "${sourceName}" WITH TEMPLATE template0`);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const previous = { ...journal, entries: journal.entries.filter(entry => entry.idx <= 37) };
  const migrations = join(root, "old-migrations"); await mkdir(join(migrations, "meta"), { recursive: true });
  await writeFile(join(migrations, "meta/_journal.json"), JSON.stringify(previous));
  for (const entry of previous.entries) await cp(`drizzle/${entry.tag}.sql`, join(migrations, `${entry.tag}.sql`));
  await migrate(drizzle(source), { migrationsFolder: migrations });
  const users = (await source.query("INSERT INTO users(email,full_name,role,is_platform_owner) VALUES ('recovery-owner@example.test','Synthetic owner','admin',true),('recovery-student@example.test','Synthetic student','student',false) RETURNING *")).rows;
  const user = users[1];
  await source.query("INSERT INTO orders(user_id,order_number,customer_email,customer_name,course_slug,subtotal,total,status) VALUES ($1,'QA-RECOVERY-ORDER','old-email@example.test','Historical payer','qa-recovery',100,100,'paid')", [user.id]);
  await source.query("INSERT INTO invoices(invoice_number,order_number,customer_email,total,snapshot_json) VALUES ('QA-RECOVERY-INVOICE','QA-RECOVERY-ORDER','old-email@example.test',100,'{\"historical\":true}')");
  await source.query("INSERT INTO course_access(user_id,user_email,course_slug,order_number) VALUES ($1,'old-email@example.test','qa-recovery','QA-RECOVERY-ORDER')", [user.id]);
  await source.query("INSERT INTO lesson_progress(user_id,user_email,course_slug,lesson_id,watched_seconds,completed) VALUES ($1,'old-email@example.test','qa-recovery','qa-recovery-lesson',71,true)", [user.id]);
  await source.query("INSERT INTO platform_settings(key,value,category,is_public) VALUES ('recovery_encrypted_sentinel','synthetic-private-config-do-not-publish','security',false)");
  for (const [name, data] of synthetic) {
    await mkdir(dirname(join(objects, name)), { recursive: true, mode: 0o700 }); await writeFile(join(objects, name), data, { mode: 0o600 });
    if (name.endsWith(".mp4")) continue;
    const clean = name.endsWith(".pdf");
    await source.query("INSERT INTO ai_files(user_id,object_key,original_name,content_type,size_bytes,status,scan_status) VALUES ($1,$2,'fixture','application/octet-stream',$3,$4,$5)", [user.id, name, data.length, clean ? "ready" : "quarantined", clean ? "clean" : "quarantined"]);
  }
  await source.query("UPDATE ai_files SET storage_provider='s3' WHERE id=(SELECT min(id) FROM ai_files)");
  await assert.rejects(createBackup(backupOptions), /REMOTE_STORAGE_REQUIRES_SEPARATE_BACKUP/);
  await assert.rejects(access(join(bundle, "COMPLETE")));
  await source.query("UPDATE ai_files SET storage_provider='local'");
  pass("local-only backup refuses cloud references instead of producing an incomplete recovery bundle");
  const before = await snapshot(source), oldLedger = (await source.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  const backup = await createBackup(backupOptions);
  assert.equal(backup.files, 3); assert.equal(backup.storageMode, "local");
  const encrypted = await openManifest(join(bundle, "manifest.enc"), key);
  assert.equal(encrypted.tables.find(x => x.name === "users").count, "2");
  for (const path of ["database.enc", "manifest.enc", ...encrypted.files.map(file => file.archive)]) {
    const bytes = await readFile(join(bundle, path));
    for (const value of ["recovery-student@example.test", "synthetic-private-config-do-not-publish", "private/recovery/clean.pdf"]) assert.equal(bytes.includes(Buffer.from(value)), false);
  }
  pass("real custom pg_dump plus every local file and manifest are encrypted; no plaintext identities or keys are published");

  // A failed schema change is rolled back before the real forward migration is applied.
  const tx = await source.connect();
  try {
    await tx.query("BEGIN"); await tx.query("CREATE TABLE qa_failed_migration(id integer)");
    await assert.rejects(tx.query("SELECT definitely_missing_recovery_function()")); await tx.query("ROLLBACK");
  } finally { tx.release(); }
  assert.equal((await source.query("SELECT to_regclass('public.qa_failed_migration') AS value")).rows[0].value, null);
  assert.deepEqual(await snapshot(source), before);
  await migrate(drizzle(source), { migrationsFolder: "./drizzle" });
  assert.ok((await source.query("SELECT to_regclass('storage_cleanup_jobs') AS value")).rows[0].value);
  pass("failed migration transaction preserves the old database; actual 0038/0039 upgrade succeeds afterwards");

  const restored = await restoreBackup(restoreOptions);
  assert.equal(restored.quarantined, true);
  assert.equal((await parent.query("SELECT datallowconn FROM pg_database WHERE datname=$1", [restoredName])).rows[0].datallowconn, false);
  await compareObjects(restoreOptions.uploadDir);
  const previousDb = await connectRestored(restoredName);
  try {
    assert.deepEqual(await snapshot(previousDb), before);
    assert.deepEqual((await previousDb.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows, oldLedger);
    assert.equal((await previousDb.query("SELECT to_regclass('storage_cleanup_jobs') AS value")).rows[0].value, null);
    await assert.rejects(previousDb.query("UPDATE orders SET user_id=$1 WHERE order_number='QA-RECOVERY-ORDER'", [users[0].id]));
    await assert.rejects(previousDb.query("DELETE FROM users WHERE id=$1", [users[0].id]));
    await assert.rejects(previousDb.query("INSERT INTO favorites(user_id,user_email,course_slug) VALUES (2147483647,'test@example.test','qa')"), { code: "23503" });
    pass("pre-upgrade restore matches every table byte-for-byte and all files; ownership/owner-protection triggers and foreign keys survive");
    await migrate(drizzle(previousDb), { migrationsFolder: "./drizzle" });
    assert.ok((await previousDb.query("SELECT to_regclass('resumable_video_uploads') AS value")).rows[0].value);
    pass("restored previous release can apply the real forward migrations without losing invoice, access, progress or quarantine records");
  } finally { await previousDb.end(); await parent.query(`ALTER DATABASE "${restoredName}" ALLOW_CONNECTIONS false`); }

  const digest = await bundleDigest(bundle);
  await assert.rejects(createBackup(backupOptions), /DESTINATION_ALREADY_EXISTS/);
  await assert.rejects(restoreBackup(restoreOptions), /DESTINATION_ALREADY_EXISTS/);
  await assert.rejects(restoreBackup({ ...restoreOptions, uploadDir: join(root, "existing-database") }), /DATABASE_ALREADY_EXISTS/);
  assert.equal(await bundleDigest(bundle), digest);
  assert.equal((await source.query("SELECT count(*) FROM orders")).rows[0].count, "1");
  pass("existing backup, restored files and database are never overwritten; original source database remains intact");

  for (const [label, change] of [["wrong-key", null], ["database-corrupt", "database.enc"], ["object-corrupt", encrypted.files[0].archive], ["manifest-corrupt", "manifest.enc"]]) {
    const badBundle = join(root, label); await cp(bundle, badBundle, { recursive: true });
    if (change) { const path = join(badBundle, change), data = await readFile(path); data[data.length - 1] ^= 1; await writeFile(path, data); }
    await assert.rejects(restoreBackup({ ...restoreOptions, key: change ? key : randomBytes(32), bundleDir: badBundle, databaseName: failedName, uploadDir: join(root, `out-${label}`) }), /BACKUP_AUTHENTICATION_FAILED/);
    assert.equal(await isDatabase(failedName), false); await assert.rejects(access(join(root, `out-${label}`)));
  }
  assert.equal((await readdir(root)).some(name => name.startsWith(".maras-restore-")), false);
  pass("wrong key and modified manifest, database or object fail before SQL/CREATE DATABASE; private plaintext stages are removed");

  const linked = join(objects, "linked"); await symlink(join(objects, "private"), linked);
  await assert.rejects(createBackup({ ...backupOptions, bundleDir: join(root, "symlink-backup") }), /SYMLINKS_NOT_BACKED_UP/);
  await unlink(linked); await assert.rejects(access(join(root, "symlink-backup/COMPLETE")));
  pass("symlinked storage is rejected rather than backing up files outside the configured root");

  // Authenticate an intentionally invalid pg_dump payload with the synthetic QA key;
  // crypto succeeds, then pg_restore must fail safely and quarantine its new empty DB.
  const invalid = join(root, "invalid-archive"); await cp(bundle, invalid, { recursive: true });
  const value = await openManifest(join(invalid, "manifest.enc"), key);
  await unlink(join(invalid, "database.enc"));
  value.database = { archive: "database.enc", ...await sealBytes(Buffer.from("not a postgres archive"), join(invalid, "database.enc"), key, `${value.id}:database`) };
  await unlink(join(invalid, "manifest.enc")); await sealBytes(Buffer.from(JSON.stringify(value)), join(invalid, "manifest.enc"), key, "manifest");
  await assert.rejects(restoreBackup({ ...restoreOptions, databaseName: failedName, bundleDir: invalid, uploadDir: join(root, "invalid-output") }), /POSTGRES_CLIENT_REPORTED_ERROR/);
  assert.equal((await parent.query("SELECT datallowconn FROM pg_database WHERE datname=$1", [failedName])).rows[0].datallowconn, false);
  await assert.rejects(access(join(root, "invalid-output")));
  pass("authenticated but invalid SQL archive fails closed and quarantines only its new target; no files are published");

  const cleanupId = randomUUID();
  await source.query("INSERT INTO storage_cleanup_jobs(id,object_key,provider,operation,location_fingerprint,source,status,lease_token,lease_until) VALUES ($1,'private/recovery/clean.pdf','local','object',$2,'qa-recovery','processing','synthetic-lease',clock_timestamp()+interval '1 minute')", [cleanupId, "a".repeat(64)]);
  await source.query("INSERT INTO resumable_video_uploads(id,request_key,owner_id,course_slug,lesson_id,object_key,provider,location_fingerprint,content_type,size_bytes,hashes_json,received_json) VALUES ($1,'synthetic-request',$2,'qa-recovery','qa-lesson','private/recovery/video.mp4','local',$3,'video/mp4',100,'[\"synthetic-hash\"]','[0]')", [randomUUID(), user.id, "a".repeat(64)]);
  const latestSnapshot = await snapshot(source), latestBundle = join(root, "latest-bundle");
  await createBackup({ ...backupOptions, bundleDir: latestBundle });
  await restoreBackup({ ...restoreOptions, bundleDir: latestBundle, databaseName: latestName, uploadDir: join(root, "latest-restored") });
  const current = await connectRestored(latestName);
  try { assert.deepEqual(await snapshot(current), latestSnapshot); }
  finally { await current.end(); await parent.query(`ALTER DATABASE "${latestName}" ALLOW_CONNECTIONS false`); }
  pass("current schema backup preserves pending cleanup leases, resumable ownership and location fences without starting any worker");

  assert.equal(checks.length, 10);
  await writeFile(".data/qa-recovery-report.json", JSON.stringify({ passed: checks.length, checks, elapsedMs: Math.round(performance.now() - started), pgMajor: encrypted.pgMajor, tablesVerified: encrypted.tables.length, objectFiles: synthetic.size, scope: "disposable loopback PostgreSQL and local files; not a production/cloud recovery certification", liveProviders: false }, null, 2));
} finally {
  key.fill(0); await source.end();
  try {
    for (const name of allNames) { assert.match(name, /^(maras_qa_recovery_|maras_restore_)[a-z0-9_]+$/); if (await isDatabase(name)) await parent.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  } finally { await parent.end(); await rm(root, { recursive: true, force: true }); }
}
