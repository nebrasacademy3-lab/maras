import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "meras_checkout_attempt_v1";
const MAX_ATTEMPT_AGE = 24 * 60 * 60 * 1000;
const MAX_STORED_ATTEMPTS = 12;
const KEY_PATTERN = /^checkout:v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StoredAttempt = { intent: string; key: string; createdAt: number };
const memoryAttempts = new Map<string, StoredAttempt>();

export function checkoutIntent(courseSlugs: string[], coupon?: string) {
  return JSON.stringify({ courseSlugs: [...new Set(courseSlugs.filter(Boolean))].sort(), coupon: coupon?.trim().toUpperCase() || "" });
}

function validAttempt(value: Partial<StoredAttempt> | null): value is StoredAttempt {
  return Boolean(value && typeof value.intent === "string" && typeof value.key === "string" && typeof value.createdAt === "number" && KEY_PATTERN.test(value.key) && Date.now() - value.createdAt < MAX_ATTEMPT_AGE);
}

async function readAttempts() {
  const merged = new Map(memoryAttempts);
  try {
    const parsed = JSON.parse(await SecureStore.getItemAsync(STORAGE_KEY) || "[]") as Partial<StoredAttempt>[];
    if (Array.isArray(parsed)) for (const attempt of parsed) if (validAttempt(attempt)) merged.set(attempt.intent, attempt);
  } catch { /* Keep the in-memory fallback for this app process. */ }
  const attempts = [...merged.values()].filter(validAttempt).sort((left, right) => right.createdAt - left.createdAt).slice(0, MAX_STORED_ATTEMPTS);
  memoryAttempts.clear();
  for (const attempt of attempts) memoryAttempts.set(attempt.intent, attempt);
  return attempts;
}

async function persistAttempts(attempts: StoredAttempt[]) {
  try { await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(attempts.slice(0, MAX_STORED_ATTEMPTS))); }
  catch { /* memoryAttempts still protects retry during this app process. */ }
}

export async function getCheckoutAttemptKey(intent: string) {
  const attempts = await readAttempts();
  const stored = attempts.find((attempt) => attempt.intent === intent);
  if (stored) return stored.key;
  const created: StoredAttempt = { intent, key: `checkout:v1:${Crypto.randomUUID()}`, createdAt: Date.now() };
  memoryAttempts.set(intent, created);
  await persistAttempts([created, ...attempts.filter((attempt) => attempt.intent !== intent)]);
  return created.key;
}

export async function clearCheckoutAttempt(intent: string) {
  const remaining = (await readAttempts()).filter((attempt) => attempt.intent !== intent);
  memoryAttempts.delete(intent);
  await persistAttempts(remaining);
}
