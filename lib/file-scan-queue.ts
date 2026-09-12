import { and, asc, count, eq, isNull, lte, or } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { aiFiles, courseRequestFiles, courseResources, supportReplyFiles } from "@/db/schema";
import { scanColumns, scannerConfigured, scanStoredFile } from "@/lib/file-security";

const FILE_SCAN_LOCK = 7_412_009_114;
const sources = { request: courseRequestFiles, support: supportReplyFiles, resource: courseResources, ai: aiFiles } as const;
export type ScanSource = keyof typeof sources;
export function scanRetryDelayMs(attempts: number) {
  return Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(9, Math.max(0, attempts - 1)));
}

export async function fileScanOverview() {
  const db = getDb();
  const groups = await Promise.all(Object.entries(sources).map(async ([source, table]) => {
    const [counts, rows] = await Promise.all([
      db.select({ status: table.scanStatus, total: count() }).from(table).groupBy(table.scanStatus),
      db.select({ id: table.id, originalName: table.originalName, sizeBytes: table.sizeBytes, status: table.scanStatus, provider: table.scanProvider, attempts: table.scanAttempts, lastAttemptAt: table.scanLastAttemptAt, nextAttemptAt: table.scanNextAttemptAt, error: table.scanError, reason: table.quarantineReason, scannedAt: table.scannedAt, createdAt: table.createdAt }).from(table).where(or(eq(table.scanStatus, "pending"), eq(table.scanStatus, "quarantined"))).orderBy(asc(table.createdAt), asc(table.id)).limit(50),
    ]);
    return { source, counts: counts.map(row => ({ status: row.status, total: Number(row.total) })), rows };
  }));
  return { configured: scannerConfigured(), groups };
}

export async function retryFileScan(source: ScanSource, id: number) {
  const table = sources[source];
  const [row] = await getDb().update(table).set({ scanNextAttemptAt: null }).where(and(eq(table.id, id), eq(table.scanStatus, "pending"))).returning({ id: table.id });
  return Boolean(row);
}

export async function runFileScanBatch(limit = 5) {
  const summary = { scanned: 0, clean: 0, quarantined: 0, pending: 0, busy: false, configured: scannerConfigured() };
  if (!summary.configured) return summary;
  const connection = await getPool().connect();
  let acquired = false;
  try {
    acquired = Boolean((await connection.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [FILE_SCAN_LOCK])).rows[0]?.locked);
    if (!acquired) return { ...summary, busy: true };
    const db = getDb();
    const now = new Date().toISOString();
    const bounded = Math.max(1, Math.min(10, Math.floor(limit)));
    const groups = await Promise.all(Object.entries(sources).map(async ([source, table]) => {
      const rows = await db.select().from(table).where(and(eq(table.scanStatus, "pending"), or(isNull(table.scanNextAttemptAt), lte(table.scanNextAttemptAt, now)))).orderBy(asc(table.scanLastAttemptAt), asc(table.createdAt), asc(table.id)).limit(bounded);
      return rows.map(row => ({ source: source as ScanSource, row }));
    }));
    const candidates = groups.flat().sort((a, b) => (a.row.scanLastAttemptAt || "").localeCompare(b.row.scanLastAttemptAt || "") || a.row.createdAt.localeCompare(b.row.createdAt) || a.row.id - b.row.id).slice(0, bounded);
    for (const { source, row } of candidates) {
      const table = sources[source];
      const attemptedAt = new Date().toISOString();
      const attempts = row.scanAttempts + 1;
      // Persist backoff before external IO, including if the process dies mid-scan.
      await db.update(table).set({ scanAttempts: attempts, scanLastAttemptAt: attemptedAt, scanNextAttemptAt: new Date(Date.now() + scanRetryDelayMs(attempts)).toISOString() }).where(and(eq(table.id, row.id), eq(table.objectKey, row.objectKey), eq(table.scanStatus, "pending")));
      const result = await scanStoredFile(row);
      const changes = { ...scanColumns(result), scanNextAttemptAt: result.status === "pending" ? new Date(Date.now() + scanRetryDelayMs(attempts)).toISOString() : null };
      if (source === "resource") {
        await db.update(courseResources).set({ ...changes, ...(result.status === "quarantined" ? { studentVisible: false, status: "archived" } : {}), updatedAt: new Date().toISOString() }).where(and(eq(courseResources.id, row.id), eq(courseResources.objectKey, row.objectKey), eq(courseResources.scanStatus, "pending")));
      } else if (source === "ai") {
        await db.update(aiFiles).set({ ...changes, status: result.status === "clean" ? "ready" : result.status === "quarantined" ? "quarantined" : "pending_scan", updatedAt: new Date().toISOString() }).where(and(eq(aiFiles.id, row.id), eq(aiFiles.objectKey, row.objectKey), eq(aiFiles.scanStatus, "pending")));
      } else {
        await db.update(table).set(changes).where(and(eq(table.id, row.id), eq(table.objectKey, row.objectKey), eq(table.scanStatus, "pending")));
      }
      summary.scanned += 1;
      summary[result.status] += 1;
    }
    return summary;
  } finally {
    let discard = false;
    if (acquired) {
      try { await connection.query("SELECT pg_advisory_unlock($1)", [FILE_SCAN_LOCK]); }
      catch { discard = true; }
    }
    connection.release(discard);
  }
}
