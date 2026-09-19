import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { activeStorageProvider, deleteObject, deletePrefix, storageLocationFingerprint } from "@/lib/storage";
import { CLEANUP_BATCH_TIMEOUT_MS, CLEANUP_LEASE_SECONDS, CLEANUP_MAX_ATTEMPTS, cleanupRetrySeconds, validateCleanupTarget, type CleanupTarget, type PersistedCleanupTarget } from "@/lib/storage-cleanup-policy";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type CleanupJob = PersistedCleanupTarget & { id: string; attempts: number; leaseToken: string };
type BatchResult = { claimed: number; completed: number; failed: CleanupJob[]; lost: number };
const jobColumns = sql`j.id, j.object_key AS "key", j.source, j.provider,
  j.operation = 'prefix' AS recursive, j.location_fingerprint AS "locationFingerprint",
  j.attempts, j.lease_token AS "leaseToken"`;

/** MUST be called inside the transaction that removes the parent records. No
 * remote I/O occurs here; an enqueue failure rolls back the deletion as well. */
export async function enqueueStorageCleanupTx(tx: Transaction, targets: CleanupTarget[]): Promise<string[]> {
  const unique = new Map<string, PersistedCleanupTarget>();
  for (const target of targets) {
    const provider = target.provider ?? activeStorageProvider();
    const row = validateCleanupTarget({ ...target, provider, locationFingerprint: storageLocationFingerprint(provider) });
    unique.set(JSON.stringify([row.provider, row.locationFingerprint, row.recursive, row.key]), row);
  }
  const ids: string[] = [];
  const rows = [...unique.values()].map(row => {
    const id = randomUUID(); ids.push(id);
    return sql`(${id}, ${row.key}, ${row.provider}, ${row.recursive ? "prefix" : "object"}, ${row.locationFingerprint}, ${row.source})`;
  });
  // Bound query size while retaining the caller's one atomic transaction.
  for (let offset = 0; offset < rows.length; offset += 100) {
    await tx.execute(sql`INSERT INTO storage_cleanup_jobs
      (id, object_key, provider, operation, location_fingerprint, source)
      VALUES ${sql.join(rows.slice(offset, offset + 100), sql`, `)}`);
  }
  return ids;
}

export async function claimStorageCleanupJobs(db: Database, limit = 5, jobIds?: string[]): Promise<CleanupJob[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new RangeError("Invalid cleanup batch size");
  if (jobIds && (jobIds.length > 100 || jobIds.some(id => !/^[a-f0-9-]{36}$/i.test(id)))) throw new RangeError("Invalid cleanup job IDs");
  if (jobIds?.length === 0) return [];
  const filter = jobIds ? sql`AND id IN (${sql.join(jobIds.map(id => sql`${id}`), sql`, `)})` : sql``;
  const token = randomUUID();
  return db.transaction(async tx => {
    // A crash on the final attempt must not leave a permanently leased zombie.
    await tx.execute(sql`UPDATE storage_cleanup_jobs SET status = 'blocked', error_code = 'retry_exhausted',
      lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp()
      WHERE attempts >= ${CLEANUP_MAX_ATTEMPTS} AND
      (status = 'pending' OR (status = 'processing' AND lease_until <= clock_timestamp())) ${filter}`);
    const result = await tx.execute(sql`WITH candidates AS (
      SELECT id FROM storage_cleanup_jobs WHERE attempts < ${CLEANUP_MAX_ATTEMPTS}
      AND ((status = 'pending' AND available_at <= clock_timestamp())
        OR (status = 'processing' AND lease_until <= clock_timestamp())) ${filter}
      ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT ${limit}
    ) UPDATE storage_cleanup_jobs j SET status = 'processing', attempts = j.attempts + 1,
      lease_token = ${token}, lease_until = clock_timestamp() + ${CLEANUP_LEASE_SECONDS} * interval '1 second',
      updated_at = clock_timestamp() FROM candidates c WHERE j.id = c.id RETURNING ${jobColumns}`);
    return result.rows as CleanupJob[];
  });
}

/** Fencing prevents a delayed worker from acknowledging a newer worker's lease. */
export async function finishStorageCleanupJob(db: Database, job: CleanupJob, errorCode?: string, permanent = false): Promise<boolean> {
  const failed = Boolean(errorCode);
  const status = !failed ? "completed" : permanent || job.attempts >= CLEANUP_MAX_ATTEMPTS ? "blocked" : "pending";
  const code = errorCode ? ["storage_unavailable", "storage_location_changed", "unsafe_cleanup_target", "interrupted"].includes(errorCode) ? errorCode : "storage_unavailable" : null;
  const result = await db.execute(sql`UPDATE storage_cleanup_jobs SET status = ${status}, error_code = ${code},
    lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp(),
    completed_at = CASE WHEN ${status} = 'completed' THEN clock_timestamp() ELSE NULL END,
    available_at = clock_timestamp() + ${failed ? cleanupRetrySeconds(job.attempts) : 0} * interval '1 second'
    WHERE id = ${job.id} AND status = 'processing' AND lease_token = ${job.leaseToken}
      AND lease_until > clock_timestamp() RETURNING id`);
  return result.rows.length === 1;
}

export async function processStorageCleanupBatch(db: Database, options: { limit?: number; jobIds?: string[]; signal?: AbortSignal } = {}): Promise<BatchResult> {
  options.signal?.throwIfAborted();
  const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(CLEANUP_BATCH_TIMEOUT_MS)]);
  const jobs = await claimStorageCleanupJobs(db, options.limit ?? 5, options.jobIds);
  const result: BatchResult = { claimed: jobs.length, completed: 0, failed: [], lost: 0 };
  const settled = await Promise.allSettled(jobs.map(async job => {
    let code: string | undefined, permanent = false;
    try {
      try { validateCleanupTarget(job); } catch { code = "unsafe_cleanup_target"; permanent = true; }
      if (!code && storageLocationFingerprint(job.provider) !== job.locationFingerprint) { code = "storage_location_changed"; permanent = true; }
      if (!code) {
        signal.throwIfAborted();
        if (job.recursive) await deletePrefix(job.key, job.provider, signal);
        else await deleteObject(job.key, job.provider, signal);
      }
    } catch { code = signal.aborted ? "interrupted" : "storage_unavailable"; }
    if (await finishStorageCleanupJob(db, job, code, permanent)) {
      if (code) result.failed.push(job); else result.completed++;
    } else result.lost++;
  }));
  if (settled.some(item => item.status === "rejected")) throw new Error("Cleanup acknowledgement unavailable; leased jobs will be recovered");
  return result;
}

/** Operational counts only: never expose paths, endpoint URLs or credentials. */
export async function storageCleanupSummary(db: Database) {
  const result = await db.execute(sql`SELECT
    count(*) FILTER (WHERE status = 'pending')::int AS pending,
    count(*) FILTER (WHERE status = 'processing')::int AS processing,
    count(*) FILTER (WHERE status = 'blocked')::int AS blocked,
    count(*) FILTER (WHERE status = 'processing' AND lease_until <= clock_timestamp())::int AS expired,
    count(*) FILTER (WHERE status IN ('pending', 'processing') AND created_at < clock_timestamp() - interval '15 minutes')::int AS overdue
    FROM storage_cleanup_jobs`);
  return result.rows[0] as { pending: number; processing: number; blocked: number; expired: number; overdue: number };
}
