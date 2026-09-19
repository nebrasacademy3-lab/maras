import { normalizeStorageKey, normalizeStoragePrefix } from "@/lib/storage-policy";
import type { StorageProvider } from "@/lib/storage";

export type CleanupTarget = { key: string; source: string; provider?: StorageProvider; recursive?: boolean };
export type PersistedCleanupTarget = CleanupTarget & { provider: StorageProvider; locationFingerprint: string };
export const CLEANUP_MAX_ATTEMPTS = 12;
export const CLEANUP_LEASE_SECONDS = 90;
export const CLEANUP_BATCH_TIMEOUT_MS = 20_000;

export function validateCleanupTarget(target: PersistedCleanupTarget): PersistedCleanupTarget {
  if (target.provider !== "local" && target.provider !== "s3") throw new Error("Invalid cleanup provider");
  if (!/^[a-f0-9]{64}$/.test(target.locationFingerprint)) throw new Error("Invalid storage identity");
  if (typeof target.source !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(target.source)) throw new Error("Invalid cleanup source");
  const key = target.recursive ? normalizeStoragePrefix(target.key) : normalizeStorageKey(target.key);
  // Never interpret broad prefixes as a queued recursive delete. These paths
  // are immutable, server-generated processing attempts, not user directories.
  const resumable = target.source === "resumable-staging" && /^private\/resumable\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key);
  if (target.recursive && !resumable && !/^private\/video-derived\/[1-9][0-9]*\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)) {
    throw new Error("Unsafe cleanup prefix");
  }
  return { ...target, key, recursive: Boolean(target.recursive) };
}

export function cleanupRetrySeconds(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > CLEANUP_MAX_ATTEMPTS) throw new Error("Invalid cleanup attempt");
  return Math.min(3600, 5 * 2 ** (attempt - 1));
}
