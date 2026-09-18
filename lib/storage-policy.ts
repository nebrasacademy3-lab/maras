const KEY_MAX_BYTES = 1024;
const SEGMENT_MAX_BYTES = 255;
const DEFAULT_UPLOAD_LIMIT = 512 * 1024 * 1024;
const MAX_UPLOAD_LIMIT = 2_000_000_000;
const DEFAULT_TRANSFER_TIMEOUT = 15 * 60_000;
const MAX_TRANSFER_TIMEOUT = 30 * 60_000;

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function privateIpv4(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && b === 168
    || a === 100 && b >= 64 && b <= 127;
}

function unsafeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".invalid")) return true;
  if (privateIpv4(host)) return true;
  if (host === "::1" || host === "::" || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) return true;
  return false;
}

export function normalizeStorageKey(value: string) {
  if (typeof value !== "string") throw new Error("Invalid storage key");
  const key = value.normalize("NFC");
  if (!key || key !== key.trim() || key.startsWith("/") || key.endsWith("/") || key.includes("\\") || /[\u0000-\u001f\u007f?#%]/.test(key)) throw new Error("Invalid storage key");
  if (byteLength(key) > KEY_MAX_BYTES) throw new Error("Storage key is too long");
  for (const segment of key.split("/")) {
    if (!segment || segment === "." || segment === ".." || byteLength(segment) > SEGMENT_MAX_BYTES) throw new Error("Invalid storage key");
  }
  return key;
}

export function normalizeStoragePrefix(value: string) {
  return normalizeStorageKey(value.replace(/\/+$/, ""));
}

export function normalizeStorageBucket(value: string) {
  const bucket = value.trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..") || bucket.includes(".-") || bucket.includes("-.")) throw new Error("Invalid S3 bucket");
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)) throw new Error("Invalid S3 bucket");
  return bucket;
}

export function storageEndpointUrl(value: string, options: { allowLoopbackHttp?: boolean } = {}) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Invalid S3 endpoint"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
  if (url.username || url.password || url.search || url.hash) throw new Error("Invalid S3 endpoint");
  if (url.protocol !== "https:" && !(options.allowLoopbackHttp && url.protocol === "http:" && loopback)) throw new Error("S3 endpoint must use HTTPS");
  if (unsafeHost(url.hostname) && !(options.allowLoopbackHttp && loopback)) throw new Error("Unsafe S3 endpoint");
  if (url.pathname.split("/").some(part => part === "..")) throw new Error("Invalid S3 endpoint path");
  return url;
}

export function storageUploadLimitBytes(value?: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_UPLOAD_LIMIT;
  return Math.max(1024 * 1024, Math.min(MAX_UPLOAD_LIMIT, parsed));
}

export function storageTransferTimeoutMs(value?: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_TRANSFER_TIMEOUT;
  return Math.max(15_000, Math.min(MAX_TRANSFER_TIMEOUT, parsed));
}

export function signedUploadTtlSeconds(value?: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(60, Math.min(900, Math.floor(parsed))) : 900;
}
