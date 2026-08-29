"use client";

const STORAGE_KEY = "meras:checkout-attempt:v1";
const MAX_ATTEMPT_AGE = 24 * 60 * 60 * 1000;
const MAX_STORED_ATTEMPTS = 12;
const KEY_PATTERN = /^checkout:v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StoredAttempt = { intent: string; key: string; createdAt: number };
const memoryAttempts = new Map<string, StoredAttempt>();

export function checkoutIntent(courseSlugs: string[], coupon?: string) {
  return JSON.stringify({ courseSlugs: [...new Set(courseSlugs.filter(Boolean))].sort(), coupon: coupon?.trim().toUpperCase() || "" });
}

function strongUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validAttempt(value: Partial<StoredAttempt> | null): value is StoredAttempt {
  return Boolean(value && typeof value.intent === "string" && typeof value.key === "string" && typeof value.createdAt === "number" && KEY_PATTERN.test(value.key) && Date.now() - value.createdAt < MAX_ATTEMPT_AGE);
}

function readAttempts(): StoredAttempt[] {
  const merged = new Map(memoryAttempts);
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Array<Partial<StoredAttempt>>;
    if (Array.isArray(parsed)) for (const attempt of parsed) if (validAttempt(attempt)) merged.set(attempt.intent, attempt);
  } catch { /* The in-memory fallback remains available. */ }
  const attempts = [...merged.values()].filter(validAttempt).sort((left, right) => right.createdAt - left.createdAt).slice(0, MAX_STORED_ATTEMPTS);
  memoryAttempts.clear();
  for (const attempt of attempts) memoryAttempts.set(attempt.intent, attempt);
  return attempts;
}

function persistAttempts(attempts: StoredAttempt[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts.slice(0, MAX_STORED_ATTEMPTS))); }
  catch { /* memoryAttempts guarantees same-page retry safety. */ }
}

export function getCheckoutAttemptKey(intent: string) {
  const attempts = readAttempts();
  const stored = attempts.find((attempt) => attempt.intent === intent);
  if (stored) return stored.key;
  const created: StoredAttempt = { intent, key: `checkout:v1:${strongUuid()}`, createdAt: Date.now() };
  memoryAttempts.set(intent, created);
  persistAttempts([created, ...attempts.filter((attempt) => attempt.intent !== intent)]);
  const winner = readAttempts().find((attempt) => attempt.intent === intent);
  return winner?.key || created.key;
}

export function clearCheckoutAttempt(intent: string) {
  const remaining = readAttempts().filter((attempt) => attempt.intent !== intent);
  memoryAttempts.delete(intent);
  persistAttempts(remaining);
}
