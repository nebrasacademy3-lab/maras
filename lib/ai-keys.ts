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
  if (!material) throw new AiPlatformError("AI_KEY_ENCRYPTION_NOT_CONFIGURED", "تخزين مفاتيح AI غير مهيأ بأمان على الخادم.", 503);
  return createHmac("sha256", material).update("meras-ai-keys:v1:encryption").digest();
}

export function validGeminiApiKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{20,200}$/.test(key) ? key : "";
}

export function aiKeyFingerprint(apiKey: string) {
  return createHash("sha256").update(`meras-ai-key:v1:${apiKey}`).digest("hex");
}

export function maskAiKey(apiKey: string) {
  return `••••••••${apiKey.slice(-4)}`;
}

export function encryptAiApiKey(apiKey: string) {
  const valid = validGeminiApiKey(apiKey);
  if (!valid) throw new AiPlatformError("AI_KEY_INVALID", "صيغة مفتاح Gemini غير صحيحة.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionMaterial(), iv);
  const ciphertext = Buffer.concat([cipher.update(valid, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptAiApiKey(value: string) {
  const [version, encodedIv, encodedCiphertext, encodedTag] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext || !encodedTag) throw new AiPlatformError("AI_KEY_DECRYPTION_FAILED", "تعذر قراءة مفتاح AI المحفوظ.", 500);
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionMaterial(), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const apiKey = Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
    if (!validGeminiApiKey(apiKey)) throw new Error("invalid key");
    return apiKey;
  } catch {
    throw new AiPlatformError("AI_KEY_DECRYPTION_FAILED", "تعذر قراءة مفتاح AI المحفوظ.", 500);
  }
}
