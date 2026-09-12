import { randomUUID } from "node:crypto";
import { getPool } from "@/db";
import { scanStoredFile, type FileScanResult } from "@/lib/file-security";
import { scannerConfig } from "@/lib/malware-scanner";

export const FILE_SCAN_TABLES = { request: "course_request_files", support: "support_reply_files", resource: "course_resources", ai: "ai_files" } as const;
export type FileScanKind = keyof typeof FILE_SCAN_TABLES;
export function isFileScanKind(value: unknown): value is FileScanKind { return typeof value === "string" && Object.hasOwn(FILE_SCAN_TABLES, value); }
export const FILE_SCAN_LEASE_MS = 120_000;
export function fileScanRetryMs(attempts: number) { return Math.min(15 * 60_000, 30_000 * 2 ** Math.min(5, Math.max(0, attempts - 1))); }

type ScanRow = { id: number; object_key: string; original_name: string; content_type: string; storage_provider: string | null; scan_status: string; scan_provider: string | null; scanned_at: string | null; scan_error: string | null; scan_attempts: number; scan_next_attempt_at: string | null; scan_lease_until: string | null; quarantine_reason: string | null };
export type FileScanState = { status: string; error: string | null; retryAfterSeconds: number; attempts: number };
type Query = (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
type Dependencies = { query: Query; scan: typeof scanStoredFile; now?: () => number };
function state(row: ScanRow, now: number): FileScanState {
  const next = Math.max(Date.parse(row.scan_next_attempt_at || "") || 0, Date.parse(row.scan_lease_until || "") || 0);
  return { status: row.scan_status, error: row.scan_error, attempts: row.scan_attempts, retryAfterSeconds: row.scan_status === "pending" ? Math.min(900, Math.max(5, Math.ceil((next - now) / 1000))) : 0 };
}

/** Atomic, durable leases: no network call runs inside a database transaction. */
export function createFileScanService({ query, scan, now = Date.now }: Dependencies) {
  const tableFor = (kind: FileScanKind) => { if (!isFileScanKind(kind)) throw new TypeError("Invalid file scan kind"); return FILE_SCAN_TABLES[kind]; };
  async function read(kind: FileScanKind, id: number) {
    const result = await query(`/*scan:read*/ SELECT * FROM ${tableFor(kind)} WHERE id=$1`, [id]);
    return result.rows[0] as ScanRow | undefined;
  }
  async function scanFile(kind: FileScanKind, id: number): Promise<FileScanState | null> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError("Invalid file id");
    const table = tableFor(kind);
    const row = await read(kind, id);
    if (!row) return null;
    // Quarantine is terminal here. Ordinary downloads/actions cannot undo it.
    if (row.scan_status !== "pending") return state(row, now());
    const started = now();
    const token = randomUUID();
    const claim = await query(`/*scan:claim*/ UPDATE ${table} SET scan_lease_token=$2, scan_lease_until=$3, scan_attempts=scan_attempts+1
      WHERE id=$1 AND scan_status='pending' AND (scan_next_attempt_at IS NULL OR scan_next_attempt_at <= $4)
      AND (scan_lease_until IS NULL OR scan_lease_until <= $4) RETURNING *`, [id, token, new Date(started + FILE_SCAN_LEASE_MS).toISOString(), new Date(started).toISOString()]);
    const claimed = claim.rows[0] as ScanRow | undefined;
    if (!claimed) { const current = await read(kind, id); return current ? state(current, now()) : null; }
    let result: FileScanResult;
    try { result = await scan({ objectKey: claimed.object_key, originalName: claimed.original_name, contentType: claimed.content_type, storageProvider: claimed.storage_provider }); }
    catch { result = { status: "pending", provider: "scanner", scannedAt: null, error: "scanner_failed", reason: null }; }
    const completed = now();
    const next = result.status === "pending" ? new Date(completed + fileScanRetryMs(claimed.scan_attempts)).toISOString() : null;
    const extra = kind === "ai" ? ", status=CASE WHEN $4='clean' THEN 'ready' WHEN $4='quarantined' THEN 'quarantined' ELSE 'pending_scan' END, updated_at=$10"
      : kind === "resource" ? ", student_visible=CASE WHEN $4='clean' THEN student_visible ELSE false END, status=CASE WHEN $4='quarantined' THEN 'archived' ELSE status END, updated_at=$10" : "";
    const values: unknown[] = [id, token, claimed.object_key, result.status, result.provider, result.scannedAt, result.error, result.reason, next];
    if (extra) values.push(new Date(completed).toISOString());
    const saved = await query(`/*scan:complete*/ UPDATE ${table} SET scan_status=$4, scan_provider=$5, scanned_at=$6, scan_error=$7, quarantine_reason=$8,
      scan_next_attempt_at=$9, scan_lease_token=NULL, scan_lease_until=NULL${extra}
      WHERE id=$1 AND scan_lease_token=$2 AND object_key=$3 AND scan_status='pending' RETURNING *`, values);
    // A lost lease, deletion or intervening quarantine never returns our uncommitted clean verdict.
    const final = (saved.rows[0] as ScanRow | undefined) || await read(kind, id);
    return final ? state(final, now()) : null;
  }
  async function wakePending() {
    for (const table of Object.values(FILE_SCAN_TABLES)) {
      await query(`/*scan:wake*/ UPDATE ${table} SET scan_next_attempt_at=NULL WHERE scan_status='pending' AND (scan_lease_until IS NULL OR scan_lease_until <= $1)`, [new Date(now()).toISOString()]);
    }
  }
  async function runBatch(options: { limit?: number; budgetMs?: number } = {}) {
    const requested = Number(options.limit ?? 12);
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(40, Math.floor(requested))) : 12;
    const deadline = now() + Math.max(1000, Math.min(90_000, options.budgetMs || 50_000));
    const dueAt = new Date(now()).toISOString();
    const groups = await Promise.all((Object.entries(FILE_SCAN_TABLES) as [FileScanKind, string][]).map(async ([kind, table]) => {
      const result = await query(`/*scan:due*/ SELECT id FROM ${table} WHERE scan_status='pending' AND (scan_next_attempt_at IS NULL OR scan_next_attempt_at <= $1)
        AND (scan_lease_until IS NULL OR scan_lease_until <= $1) ORDER BY scan_next_attempt_at ASC NULLS FIRST, id ASC LIMIT $2`, [dueAt, limit]);
      return result.rows.map(row => ({ kind, id: Number(row.id) }));
    }));
    // Round-robin avoids a broken old request starving support, learning resources or AI files.
    const work: { kind: FileScanKind; id: number }[] = [];
    for (let index = 0; work.length < limit && groups.some(group => index < group.length); index++) for (const group of groups) if (group[index] && work.length < limit) work.push(group[index]);
    const summary = { scanned: 0, clean: 0, quarantined: 0, pending: 0, failed: 0 };
    for (let offset = 0; offset < work.length && now() < deadline; offset += 2) {
      await Promise.all(work.slice(offset, offset + 2).map(async item => {
        try {
          const result = await scanFile(item.kind, item.id);
          if (result) { summary.scanned++; if (result.status === "clean" || result.status === "quarantined") summary[result.status]++; else summary.pending++; }
        } catch { summary.failed++; }
      }));
    }
    return summary;
  }
  return { scanFile, runBatch, wakePending };
}

export const fileScanService = createFileScanService({ query: (text, values) => getPool().query(text, values), scan: scanStoredFile });
export function fileScanBlockedResponse(result: FileScanState | null) {
  if (!result) return Response.json({ ok: false, error: "الملف غير موجود", code: "FILE_NOT_FOUND" }, { status: 404, headers: { "cache-control": "private, no-store" } });
  if (result.status === "clean") return null;
  const quarantined = result.status === "quarantined";
  const configurationMissing = ["unconfigured", "invalid"].includes(scannerConfig().mode);
  const missing = result.error === "stored_object_missing";
  const message = quarantined ? "الملف محجور لأسباب أمنية ولا يمكن تنزيله. تواصل مع الدعم."
    : missing ? "تعذر العثور على الملف في التخزين. تواصل مع الدعم لاستعادته أو أعد رفعه."
    : configurationMissing ? "خدمة فحص الملفات غير جاهزة. يلزم تفعيلها من إدارة المنصة؛ سيعاد الفحص تلقائيًا بعد تفعيلها."
    : "الملف قيد الفحص الأمني، أو خدمة الفحص غير متاحة مؤقتًا. سيعاد الفحص تلقائيًا؛ حاول لاحقًا.";
  return Response.json({ ok: false, error: message, code: quarantined ? "FILE_QUARANTINED" : missing ? "FILE_STORAGE_MISSING" : configurationMissing ? "FILE_SCANNER_UNAVAILABLE" : "FILE_SCAN_PENDING", scanStatus: result.status, retryAfterSeconds: result.retryAfterSeconds }, {
    status: quarantined || missing ? 404 : 423,
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff", ...(quarantined || missing ? {} : { "retry-after": String(result.retryAfterSeconds || 30) }) },
  });
}
