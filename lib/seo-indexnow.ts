import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";
import { searchIndexingEnabled, seoSiteOrigin, seoUrl } from "@/lib/seo";
import { SEO_STATIC_PAGES } from "@/lib/seo-pages";

const QUEUE_CATEGORY = "seo_indexnow";
type QueueItem = { path: string; attempts: number; nextAttemptAt: string };
export function indexNowConfig() {
  const key = process.env.INDEXNOW_KEY?.trim() || "";
  const enabled = process.env.INDEXNOW_ENABLED === "true" && searchIndexingEnabled() && /^[A-Za-z0-9-]{8,128}$/.test(key);
  return { enabled, key: enabled ? key : "", origin: seoSiteOrigin() };
}
export function isPublicSeoPath(path: string) {
  if (typeof path !== "string" || path.length > 1500 || /[?#\\\s]/.test(path)) return false;
  if (SEO_STATIC_PAGES.some((page) => page.path === path)) return true;
  if (!/^\/(courses|bundles|universities)\/[^/]+(?:\/specialties\/[^/]+)?$/.test(path)) return false;
  const parts = path.split("/").slice(1);
  if (parts.length > 2 && (parts[0] !== "universities" || parts[2] !== "specialties")) return false;
  try { return parts.every((part) => { const decoded = decodeURIComponent(part); return decoded !== "." && decoded !== ".." && /^[\p{L}\p{N}._-]+$/u.test(decoded); }); } catch { return false; }
}
export function indexNowPayload(paths: string[]) {
  const config = indexNowConfig();
  if (!config.enabled) return null;
  if (!Array.isArray(paths) || paths.length > 1000 || paths.some((path) => !isPublicSeoPath(path))) throw new TypeError("IndexNow accepts only public canonical paths");
  return { host: new URL(config.origin).hostname, key: config.key, keyLocation: seoUrl("/indexnow.txt"), urlList: [...new Set(paths)].map((path) => seoUrl(path)) };
}
// Call only with affected public URLs after a committed publish/update/delete.
// Unpublished or deleted URLs may be submitted to signal their removal. The
// operation queues locally and never calls an external service.
export async function enqueuePublicSeoUrls(paths: string[]) {
  const payload = indexNowPayload(paths);
  if (!payload || !process.env.DATABASE_URL) return { queued: 0, disabled: true };
  const unique = [...new Set(paths)], now = new Date().toISOString();
  if (!unique.length) return { queued: 0, disabled: false };
  await getDb().transaction(async (tx) => {
    for (const path of unique) {
      const key = "seo.indexnow." + createHash("sha256").update(path).digest("hex");
      const value = JSON.stringify({ path, attempts: 0, nextAttemptAt: now } satisfies QueueItem);
      await tx.insert(platformSettings).values({ key, value, category: QUEUE_CATEGORY, isPublic: false, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value, category: QUEUE_CATEGORY, isPublic: false, updatedAt: now } });
    }
  });
  return { queued: unique.length, disabled: false };
}
export async function dispatchSeoIndexNow() {
  if (!indexNowConfig().enabled || !process.env.DATABASE_URL) return { status: "disabled", sent: 0 };
  return getDb().transaction(async (tx) => {
    const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext('seo-indexnow-dispatch')) AS acquired`);
    if (!lock.rows[0]?.acquired) return { status: "busy", sent: 0 };
    const rows = await tx.select().from(platformSettings).where(and(eq(platformSettings.category, QUEUE_CATEGORY), lte(platformSettings.updatedAt, new Date().toISOString()))).orderBy(asc(platformSettings.updatedAt)).limit(100).for("update");
    const now = Date.now();
    const due: Array<{ key: string; item: QueueItem }> = [];
    for (const row of rows) {
      let item: QueueItem | null = null;
      try { item = JSON.parse(row.value) as QueueItem; } catch { /* Quarantine malformed queue data by deleting it. */ }
      if (!item || !isPublicSeoPath(item.path) || !Number.isInteger(item.attempts) || item.attempts < 0 || !Number.isFinite(Date.parse(item.nextAttemptAt))) { await tx.delete(platformSettings).where(eq(platformSettings.key, row.key)); continue; }
      if (Date.parse(item.nextAttemptAt) <= now) due.push({ key: row.key, item });
    }
    if (!due.length) return { status: "idle", sent: 0 };
    const payload = indexNowPayload(due.map((row) => row.item.path));
    if (!payload) return { status: "disabled", sent: 0 };
    let accepted = false;
    let responseStatus = 0;
    try {
      const response = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store" });
      responseStatus = response.status;
      accepted = response.status === 200 || response.status === 202;
      await response.body?.cancel();
    } catch { /* Keep the queued URLs for a bounded retry without logging keys. */ }
    for (const row of due) {
      if (accepted) { await tx.delete(platformSettings).where(eq(platformSettings.key, row.key)); continue; }
      const attempts = row.item.attempts + 1;
      const delay = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(attempts, 10));
      await tx.update(platformSettings).set({ value: JSON.stringify({ ...row.item, attempts, nextAttemptAt: new Date(now + delay).toISOString() }), updatedAt: new Date(now + delay).toISOString() }).where(eq(platformSettings.key, row.key));
    }
    return { status: accepted ? "submitted" : "retry", sent: accepted ? due.length : 0, pending: accepted ? 0 : due.length, responseStatus };
  });
}
