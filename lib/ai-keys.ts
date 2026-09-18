import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { AiPlatformError } from "@/lib/ai-platform";

function encryptionMaterial() {
  const raw = process.env.AI_KEYS_ENCRYPTION_KEY?.trim() || process.env.ADMIN_MFA_ENCRYPTION_KEY?.trim() || "";
  const placeholder = /(?:replace[-_ ]?with|change[-_ ]?me|example[-_ ]?secret)/i.test(raw);
  let material: Buffer | null = null;
  if (!placeholder && /^[a-f0-9]{64}$/i.test(raw)) material = Buffer.from(raw, "hex");
  if (!placeholder && !material && /^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) {
    try {
      const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (decoded.length === 32) material = decoded;
    } catch { material = null; }
  }
  if (!placeholder && !material && Buffer.byteLength(raw, "utf8") >= 32) material = Buffer.from(raw, "utf8");
  if (!material) throw new AiPlatformError("AI_KEY_ENCRYPTION_NOT_CONFIGURED", "تخزين مفاتيح مزود الخدمة غير مهيأ بأمان على الخادم.", 503);
  return createHmac("sha256", material).update("meras-ai-keys:v1:encryption").digest();
}

export function validGeminiApiKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  // Google auth keys are opaque and may contain dots; do not enforce the legacy key shape.
  return /^[A-Za-z0-9._~+\/=-]{20,4096}$/.test(key) ? key : "";
}

export function aiKeyFingerprint(apiKey: string) {
  return createHash("sha256").update(`meras-ai-key:v1:${apiKey}`).digest("hex");
}

export function maskAiKey(apiKey: string) {
  return `••••••••${apiKey.slice(-4)}`;
}

export function encryptAiApiKey(apiKey: string) {
  const valid = validGeminiApiKey(apiKey);
  if (!valid) throw new AiPlatformError("AI_KEY_INVALID", "صيغة مفتاح مزود الخدمة غير صحيحة.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionMaterial(), iv);
  const ciphertext = Buffer.concat([cipher.update(valid, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptAiApiKey(value: string) {
  const parts = value.split(".");
  const [version, encodedIv, encodedCiphertext, encodedTag] = parts;
  if (parts.length !== 4 || version !== "v1" || !encodedIv || !encodedCiphertext || !encodedTag) throw new AiPlatformError("AI_KEY_DECRYPTION_FAILED", "تعذر فك المفتاح المحفوظ. تحقق من ثبات AI_KEYS_ENCRYPTION_KEY بين نسخ الخادم أو أعد حفظ المفتاح.", 500);
  try {
    if (Buffer.from(encodedIv, "base64url").length !== 12 || Buffer.from(encodedTag, "base64url").length !== 16) throw new Error("invalid ciphertext");
    const decipher = createDecipheriv("aes-256-gcm", encryptionMaterial(), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const apiKey = Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
    if (!validGeminiApiKey(apiKey)) throw new Error("invalid key");
    return apiKey;
  } catch {
    throw new AiPlatformError("AI_KEY_DECRYPTION_FAILED", "تعذر فك المفتاح المحفوظ. تحقق من ثبات AI_KEYS_ENCRYPTION_KEY بين نسخ الخادم أو أعد حفظ المفتاح.", 500);
  }
}

function parseKeyList(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try { const parsed: unknown = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; }
    catch { return []; }
  }
  return raw.split(/[\r\n,;]+/);
}

export type GeminiEnvironmentKeyGroups = { free: string[]; paid: string[] };

/** Parse free and paid credentials separately; paid credentials never join the free pool. */
export function geminiEnvironmentKeyGroups(environment: { GEMINI_FREE_API_KEYS?: string; GEMINI_FREE_API_KEY?: string; GEMINI_API_KEYS?: string; GEMINI_API_KEY?: string; GOOGLE_API_KEY?: string; GEMINI_PAID_API_KEYS?: string; GEMINI_PAID_API_KEY?: string } = { GEMINI_FREE_API_KEYS: process.env.GEMINI_FREE_API_KEYS, GEMINI_FREE_API_KEY: process.env.GEMINI_FREE_API_KEY, GEMINI_API_KEYS: process.env.GEMINI_API_KEYS, GEMINI_API_KEY: process.env.GEMINI_API_KEY, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY, GEMINI_PAID_API_KEYS: process.env.GEMINI_PAID_API_KEYS, GEMINI_PAID_API_KEY: process.env.GEMINI_PAID_API_KEY }) {
  const freeValues = [
    ...parseKeyList(environment.GEMINI_FREE_API_KEYS || environment.GEMINI_API_KEYS),
    environment.GEMINI_FREE_API_KEY,
    environment.GEMINI_API_KEY,
    environment.GOOGLE_API_KEY,
  ];
  const paidValues = [...parseKeyList(environment.GEMINI_PAID_API_KEYS), environment.GEMINI_PAID_API_KEY];
  const normalize = (values: unknown[]) => [...new Set(values.map(validGeminiApiKey).filter(Boolean))];
  return { free: normalize(freeValues), paid: normalize(paidValues) };
}

/** One parser for runtime and admin health counts, including JSON arrays and GOOGLE_API_KEY. */
export function geminiEnvironmentKeys(environment: { GEMINI_FREE_API_KEYS?: string; GEMINI_FREE_API_KEY?: string; GEMINI_API_KEYS?: string; GEMINI_API_KEY?: string; GOOGLE_API_KEY?: string; GEMINI_PAID_API_KEYS?: string; GEMINI_PAID_API_KEY?: string } = { GEMINI_FREE_API_KEYS: process.env.GEMINI_FREE_API_KEYS, GEMINI_FREE_API_KEY: process.env.GEMINI_FREE_API_KEY, GEMINI_API_KEYS: process.env.GEMINI_API_KEYS, GEMINI_API_KEY: process.env.GEMINI_API_KEY, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY, GEMINI_PAID_API_KEYS: process.env.GEMINI_PAID_API_KEYS, GEMINI_PAID_API_KEY: process.env.GEMINI_PAID_API_KEY }) {
  const groups = geminiEnvironmentKeyGroups(environment);
  return [...new Set([...groups.free, ...groups.paid])];
}

/** A database key is paid only when the project label explicitly opts into that tier. */
export function geminiProjectTier(projectLabel: string | null | undefined): "free" | "paid" {
  return /^(?:paid|billing|مدفوع)(?:[\s:_-]|$)/i.test((projectLabel || "").trim()) ? "paid" : "free";
}
