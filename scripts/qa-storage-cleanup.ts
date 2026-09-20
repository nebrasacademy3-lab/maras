/** Destructive fault-injection QA is restricted to disposable loopback maras_qa. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";

const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const url = new URL(local.url);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/maras_qa" || process.env.DATABASE_URL !== local.url
    || resolve(process.env.UPLOAD_DIR || "") !== resolve(".data/uploads")) throw new Error("Dedicated loopback QA and isolated files required");
for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "GEMINI_API_KEYS", "RESEND_API_KEY", "TAP_SECRET_KEY", "RAILWAY_PROJECT_ID"]) {
  if (process.env[name]) throw new Error("Live service configuration prohibited");
}
const [{ getDb, closeDb }, q, storage] = await Promise.all([import("../db"), import("../lib/storage-cleanup"), import("../lib/storage")]);
const db = getDb();
const network = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External transport prohibited"); };
const childStage = process.env.QA_CLEANUP_CRASH_STAGE;
if (childStage) {
  const key = process.env.QA_CLEANUP_KEY || "";
  if (!/^qa-cleanup\/[a-f0-9-]+\/[a-z-]+$/.test(key)) throw new Error("Unsafe synthetic key");
  const ids = await db.transaction(tx => q.enqueueStorageCleanupTx(tx, [{ key, provider: "local", source: "qa-cleanup" }]));
  if (childStage !== "committed") {
    const jobs = await q.claimStorageCleanupJobs(db, 1, ids);
    if (childStage === "deleted") await storage.deleteObject(jobs[0].key, "local");
  }
  // Abrupt exit deliberately bypasses pool/lease cleanup, like a killed server.
  process.send?.({ ids }, () => process.exit(83));
} else {
  const nonce = randomUUID(), root = `qa-cleanup/${nonce}`, checks: string[] = [], keys: string[] = [], ids: string[] = [];
  const pass = (text: string) => { checks.push(text); console.info("PASS STORAGE CLEANUP", text); };
  async function put(label: string) { const key = `${root}/${label}`; keys.push(key); await storage.putObject(key, new Blob(["synthetic-cleanup"]).stream(), "text/plain", "local"); return key; }
  async function exists(key: string) { const row = await storage.getObject(key, undefined, "local"); if (!row) return false; await row.body.cancel(); return true; }
  async function enqueue(key: string) { const added = await db.transaction(tx => q.enqueueStorageCleanupTx(tx, [{ key, provider: "local", source: "qa-cleanup" }])); ids.push(...added); return added; }
  async function status(id: string) { return (await db.execute(sql`SELECT * FROM storage_cleanup_jobs WHERE id = ${id}`)).rows[0]; }
  async function crash(stage: string, key: string) {
    const child = spawn(process.execPath, ["--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", fileURLToPath(import.meta.url)], {
      env: { ...process.env, QA_CLEANUP_CRASH_STAGE: stage, QA_CLEANUP_KEY: key }, stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let rows: string[] = [], stderr = "";
    child.on("message", (message: { ids?: string[] }) => { rows = message.ids || []; });
    child.stderr!.on("data", bytes => { stderr += bytes; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    try {
      const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", done); });
      assert.equal(code, 83, stderr.slice(-1000)); assert.equal(rows.length, 1); ids.push(...rows); return rows;
    } finally { clearTimeout(timer); }
  }
  try {
    const rollbackKey = await put("rollback");
    await assert.rejects(db.transaction(async tx => { await q.enqueueStorageCleanupTx(tx, [{ key: rollbackKey, provider: "local", source: "qa-cleanup" }]); throw new Error("rollback sentinel"); }), /rollback sentinel/);
    assert.equal((await db.execute(sql`SELECT id FROM storage_cleanup_jobs WHERE object_key = ${rollbackKey}`)).rows.length, 0);
    assert.equal(await exists(rollbackKey), true);
    pass("rollback keeps files and creates no orphan cleanup job");

    for (const stage of ["committed", "claimed", "deleted"]) {
      const key = await put(stage), jobIds = await crash(stage, key);
      assert.equal(await exists(key), stage !== "deleted");
      if (stage !== "committed") {
        assert.equal((await q.claimStorageCleanupJobs(db, 1, jobIds)).length, 0, "live lease cannot be stolen");
        await db.execute(sql`UPDATE storage_cleanup_jobs SET lease_until = clock_timestamp() - interval '1 second' WHERE id = ${jobIds[0]}`);
      }
      const batch = await q.processStorageCleanupBatch(db, { jobIds });
      assert.equal(batch.completed, 1); assert.equal(batch.failed.length, 0);
      assert.equal(await exists(key), false); assert.equal((await status(jobIds[0])).status, "completed");
      pass(`abrupt process death after ${stage} recovers from the durable row without a live request`);
    }

    const concurrencyIds: string[] = [];
    for (const label of ["parallel-a", "parallel-b", "parallel-c", "parallel-d", "parallel-e", "parallel-f"]) concurrencyIds.push(...await enqueue(await put(label)));
    const [left, right] = await Promise.all([q.claimStorageCleanupJobs(db, 3, concurrencyIds), q.claimStorageCleanupJobs(db, 3, concurrencyIds)]);
    assert.equal(left.length + right.length, 6); assert.equal(new Set([...left, ...right].map(job => job.id)).size, 6);
    const old = left[0];
    await db.execute(sql`UPDATE storage_cleanup_jobs SET lease_until = clock_timestamp() - interval '1 second' WHERE id = ${old.id}`);
    const [newLease] = await q.claimStorageCleanupJobs(db, 1, [old.id]);
    assert.equal(await q.finishStorageCleanupJob(db, old), false, "late acknowledgement must be fenced");
    assert.equal((await status(old.id)).lease_token, newLease.leaseToken);
    for (const job of [...left.slice(1), ...right, newLease]) { await storage.deleteObject(job.key, "local"); assert.equal(await q.finishStorageCleanupJob(db, job), true); }
    pass("parallel consumers claim disjoint jobs; an expired worker cannot acknowledge a replacement lease");

    const outageKey = `${root}/outage`; keys.push(outageKey); await mkdir(resolve(".data/uploads", outageKey), { recursive: true });
    const outageIds = await enqueue(outageKey);
    const failed = await q.processStorageCleanupBatch(db, { jobIds: outageIds });
    assert.equal(failed.failed.length, 1); assert.equal((await status(outageIds[0])).status, "pending");
    assert.equal((await status(outageIds[0])).error_code, "storage_unavailable");
    assert.equal((await q.claimStorageCleanupJobs(db, 1, outageIds)).length, 0, "retry backoff is honored");
    await rm(resolve(".data/uploads", outageKey), { recursive: true });
    await db.execute(sql`UPDATE storage_cleanup_jobs SET available_at = clock_timestamp() WHERE id = ${outageIds[0]}`);
    assert.equal((await q.processStorageCleanupBatch(db, { jobIds: outageIds })).completed, 1);
    pass("storage failure is durable with backoff, and missing-object retries complete idempotently");

    const driftKey = await put("destination-drift"), driftIds = await enqueue(driftKey);
    const previous = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = resolve(`.data/cleanup-drift-${nonce}`);
    await storage.putObject(driftKey, new Blob(["must-survive"]).stream(), "text/plain", "local");
    assert.equal((await q.processStorageCleanupBatch(db, { jobIds: driftIds })).failed.length, 1);
    assert.equal((await status(driftIds[0])).status, "blocked");
    assert.equal((await status(driftIds[0])).error_code, "storage_location_changed");
    assert.equal(await exists(driftKey), true);
    await rm(process.env.UPLOAD_DIR, { recursive: true, force: true }); process.env.UPLOAD_DIR = previous;
    assert.equal(await exists(driftKey), true);
    pass("changed storage configuration blocks deletion and preserves both same-named objects");

    const lastIds = await enqueue(await put("exhausted"));
    await db.execute(sql`UPDATE storage_cleanup_jobs SET attempts = 11 WHERE id = ${lastIds[0]}`);
    await q.claimStorageCleanupJobs(db, 1, lastIds);
    await db.execute(sql`UPDATE storage_cleanup_jobs SET lease_until = clock_timestamp() - interval '1 second' WHERE id = ${lastIds[0]}`);
    assert.equal((await q.claimStorageCleanupJobs(db, 1, lastIds)).length, 0);
    assert.equal((await status(lastIds[0])).status, "blocked");
    assert.equal((await status(lastIds[0])).error_code, "retry_exhausted");
    pass("a crash on the last attempt becomes visible as blocked rather than a permanent zombie");

    await assert.rejects(db.transaction(tx => q.enqueueStorageCleanupTx(tx, [{ key: "private/video-derived", recursive: true, source: "video", provider: "local" }])));
    const summary = await q.storageCleanupSummary(db);
    assert.ok(summary.blocked >= 2); assert.equal("object_key" in summary, false);
    pass("unsafe prefixes fail before enqueue and operational summaries expose counts only");
    writeFileSync(".data/qa-storage-cleanup-report.json", JSON.stringify({ passed: checks.length, checks, externalTransport: false, realPostgres: true, abruptChildExits: 3 }, null, 2));
  } finally {
    for (const key of keys) await storage.deleteObject(key, "local").catch(() => undefined);
    await db.execute(sql`DELETE FROM storage_cleanup_jobs WHERE object_key LIKE ${root + "/%"}`);
    globalThis.fetch = network; await closeDb();
  }
}
