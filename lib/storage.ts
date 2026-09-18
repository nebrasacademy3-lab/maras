import { createHash, createHmac } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { normalizeStorageBucket, normalizeStorageKey, normalizeStoragePrefix, storageEndpointUrl, storageTransferTimeoutMs, storageUploadLimitBytes } from "@/lib/storage-policy";

export type StorageProvider = "local" | "s3";

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  size: number;
  etag: string;
  contentType?: string;
};

type ObjectRange = { offset: number; length: number };
type S3Config = { endpoint: URL; bucket: string; region: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean };

function storageRoot() {
  return resolve(process.env.UPLOAD_DIR?.trim() || join(process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || join(process.cwd(), ".data"), "uploads"));
}

function s3Config(): S3Config | null {
  const endpointValue = process.env.S3_ENDPOINT?.trim() || "";
  const bucketValue = process.env.S3_BUCKET?.trim() || "";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || "";
  const supplied = [endpointValue, bucketValue, accessKeyId, secretAccessKey].filter(Boolean).length;
  if (supplied === 0) return null;
  if (supplied !== 4) throw new Error("S3 storage configuration is incomplete");
  const endpoint = storageEndpointUrl(endpointValue, {
    allowLoopbackHttp: process.env.NODE_ENV !== "production" && process.env.S3_ALLOW_INSECURE_LOOPBACK === "true",
  });
  const bucket = normalizeStorageBucket(bucketValue);
  return { endpoint, bucket, region: process.env.S3_REGION?.trim() || "auto", accessKeyId, secretAccessKey, forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false" };
}

export function activeStorageProvider(): StorageProvider {
  return s3Config() ? "s3" : "local";
}

function safePath(key: string) {
  const normalizedKey = normalizeStorageKey(key);
  const root = storageRoot();
  const absolute = resolve(root, ...normalizedKey.split("/"));
  const inside = relative(root, absolute);
  if (!inside || inside.startsWith("..") || inside.startsWith("/") || inside.startsWith("\\")) throw new Error("Invalid storage key");
  return absolute;
}

function toNodeReadable(stream: ReadableStream<Uint8Array>) {
  return Readable.fromWeb(stream as import("node:stream/web").ReadableStream<Uint8Array>);
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function s3ObjectUrl(config: S3Config, key: string) {
  const url = new URL(config.endpoint.toString());
  const endpointPath = url.pathname.replace(/\/$/, "");
  const encodedKey = normalizeStorageKey(key).split("/").map(encodeRfc3986).join("/");
  if (config.forcePathStyle) url.pathname = `${endpointPath}/${encodeRfc3986(config.bucket)}/${encodedKey}`;
  else { url.hostname = `${config.bucket}.${url.hostname}`; url.pathname = `${endpointPath}/${encodedKey}`; }
  return url;
}

function s3BucketUrl(config: S3Config) {
  const url = new URL(config.endpoint.toString());
  const endpointPath = url.pathname.replace(/\/$/, "");
  if (config.forcePathStyle) url.pathname = `${endpointPath}/${encodeRfc3986(config.bucket)}`;
  else url.hostname = `${config.bucket}.${url.hostname}`;
  return url;
}

function signedS3Headers(config: S3Config, method: string, url: URL, payloadHash: string, extra: Record<string, string> = {}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key.toLowerCase(), value.trim()])) };
  const headerNames = Object.keys(headers).sort();
  const canonicalHeaders = headerNames.map((name) => `${name}:${headers[name].replace(/\s+/g, " ")}\n`).join("");
  const canonicalQuery = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)).map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`).join("&");
  const canonicalRequest = [method, url.pathname || "/", canonicalQuery, canonicalHeaders, headerNames.join(";"), payloadHash].join("\n");
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, date);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${headerNames.join(";")}, Signature=${signature}` };
}

async function responseSnippet(response: Response, maximum = 8192) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); break; }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(parts.map(part => Buffer.from(part)))).replace(/\s+/g, " ").slice(0, maximum);
}

async function s3Request(method: string, url: URL, payloadHash: string, init: RequestInit = {}, signedExtra: Record<string, string> = {}) {
  const config = s3Config();
  if (!config) throw new Error("S3 storage is not configured");
  if (url.protocol !== config.endpoint.protocol || (url.hostname !== config.endpoint.hostname && url.hostname !== `${config.bucket}.${config.endpoint.hostname}`)) throw new Error("Unexpected S3 request destination");
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(signedS3Headers(config, method, url, payloadHash, signedExtra))) headers.set(name, value);
  const response = await fetch(url, {
    ...init,
    method,
    headers,
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    signal: init.signal || AbortSignal.timeout(storageTransferTimeoutMs(process.env.STORAGE_TRANSFER_TIMEOUT_MS)),
  });
  if (!response.ok && response.status !== 404) {
    const detail = await responseSnippet(response);
    throw new Error(`S3 ${method} failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response;
}

function storageMeter(maxBytes: number, digest?: ReturnType<typeof createHash>) {
  let size = 0;
  return {
    meter: new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.byteLength;
        if (size > maxBytes) return callback(new Error("Storage object exceeds the configured byte limit"));
        digest?.update(chunk);
        callback(null, chunk);
      },
    }),
    size: () => size,
  };
}

async function spoolStream(body: ReadableStream<Uint8Array>) {
  const directory = await mkdtemp(join(tmpdir(), "meras-storage-"));
  const filename = join(directory, "payload");
  const digest = createHash("sha256");
  const maximum = storageUploadLimitBytes(process.env.STORAGE_MAX_UPLOAD_BYTES);
  const { meter, size } = storageMeter(maximum, digest);
  try {
    await pipeline(toNodeReadable(body), meter, createWriteStream(filename, { flags: "wx", mode: 0o600 }), {
      signal: AbortSignal.timeout(storageTransferTimeoutMs(process.env.STORAGE_TRANSFER_TIMEOUT_MS)),
    });
    return { directory, filename, size: size(), hash: digest.digest("hex") };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function putLocalObject(key: string, body: ReadableStream<Uint8Array>, contentType?: string) {
  const normalizedKey = normalizeStorageKey(key);
  const destination = safePath(normalizedKey);
  const temporary = `${destination}.${crypto.randomUUID()}.part`;
  const { meter } = storageMeter(storageUploadLimitBytes(process.env.STORAGE_MAX_UPLOAD_BYTES));
  await mkdir(dirname(destination), { recursive: true });
  try {
    await pipeline(toNodeReadable(body), meter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }), {
      signal: AbortSignal.timeout(storageTransferTimeoutMs(process.env.STORAGE_TRANSFER_TIMEOUT_MS)),
    });
    await rename(temporary, destination);
    return { key: normalizedKey, contentType, provider: "local" as const };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function putObject(key: string, body: ReadableStream<Uint8Array>, contentType?: string, provider: StorageProvider = activeStorageProvider()) {
  const normalizedKey = normalizeStorageKey(key);
  if (provider === "local") return putLocalObject(normalizedKey, body, contentType);
  const config = s3Config();
  if (!config) throw new Error("The requested S3 provider is not configured");
  const staged = await spoolStream(body);
  try {
    const stream = createReadStream(/* turbopackIgnore: true */ staged.filename);
    const init = { body: stream as unknown as BodyInit, duplex: "half", headers: { "content-length": String(staged.size), "content-type": contentType || "application/octet-stream" }, signal: AbortSignal.timeout(30 * 60_000) } as RequestInit & { duplex: "half" };
    await s3Request("PUT", s3ObjectUrl(config, normalizedKey), staged.hash, init);
    return { key: normalizedKey, contentType, provider: "s3" as const };
  } finally {
    await rm(staged.directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function getLocalObject(key: string, range?: ObjectRange): Promise<StoredObject | null> {
  const filename = safePath(key);
  let details;
  try { details = await stat(filename); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (!details.isFile()) return null;
  if (range && (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.length) || range.offset < 0 || range.length <= 0 || range.offset >= details.size)) return null;
  const start = range?.offset ?? 0;
  const end = range ? Math.min(details.size - 1, start + range.length - 1) : details.size - 1;
  const stream = createReadStream(filename, range ? { start, end } : undefined);
  const etag = `"${details.size.toString(16)}-${Math.floor(details.mtimeMs).toString(16)}"`;
  return { body: Readable.toWeb(stream) as ReadableStream<Uint8Array>, size: range ? end - start + 1 : details.size, etag };
}

export async function getObject(key: string, range?: ObjectRange, provider: StorageProvider = activeStorageProvider(), signal?: AbortSignal): Promise<StoredObject | null> {
  const normalizedKey = normalizeStorageKey(key);
  if (provider === "local") return getLocalObject(normalizedKey, range);
  const config = s3Config();
  if (!config) return null;
  const headers: Record<string, string> = {};
  if (range) headers.range = `bytes=${range.offset}-${range.offset + range.length - 1}`;
  const response = await s3Request("GET", s3ObjectUrl(config, normalizedKey), sha256(""), { headers, signal }, headers);
  if (response.status === 404 || !response.body) return null;
  const contentLength = Number(response.headers.get("content-length"));
  return { body: response.body, size: Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : range?.length || 0, etag: response.headers.get("etag") || `"${sha256(normalizedKey).slice(0, 24)}"`, contentType: response.headers.get("content-type") || undefined };
}

export async function deleteObject(key: string, provider: StorageProvider = activeStorageProvider()) {
  const normalizedKey = normalizeStorageKey(key);
  if (provider === "local") {
    try { await rm(safePath(normalizedKey), { force: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return;
  }
  const config = s3Config();
  if (config) await s3Request("DELETE", s3ObjectUrl(config, normalizedKey), sha256(""));
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function listS3Keys(prefix: string) {
  const config = s3Config();
  if (!config) return [];
  const normalizedPrefix = normalizeStoragePrefix(prefix);
  const keys: string[] = [];
  let continuation = "";
  let pages = 0;
  do {
    if (++pages > 100) throw new Error("S3 prefix listing exceeded the safety page limit");
    const url = s3BucketUrl(config);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", "1000");
    url.searchParams.set("prefix", normalizedPrefix + "/");
    if (continuation) url.searchParams.set("continuation-token", continuation);
    const response = await s3Request("GET", url, sha256(""));
    const xml = await responseSnippet(response, 2 * 1024 * 1024);
    const pageKeys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) => decodeXml(match[1]));
    for (const key of pageKeys) keys.push(normalizeStorageKey(key));
    continuation = decodeXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] || "");
  } while (continuation);
  return keys;
}

export async function deletePrefix(prefix: string, provider: StorageProvider = activeStorageProvider()) {
  const normalized = `${normalizedObjectKey(prefix).replace(/\/+$/, "")}/`;
  if (provider === "local") { await rm(safePath(normalized), { recursive: true, force: true }); return; }
  const keys = await listS3Keys(normalized);
  for (let index = 0; index < keys.length; index += 10) await Promise.all(keys.slice(index, index + 10).map((key) => deleteObject(key, "s3")));
}

export async function materializeObject(key: string, destination: string, provider: StorageProvider = activeStorageProvider()) {
  const object = await getObject(key, undefined, provider);
  if (!object) return false;
  await mkdir(dirname(destination), { recursive: true });
  await pipeline(toNodeReadable(object.body), createWriteStream(destination, { flags: "wx", mode: 0o600 }));
  return true;
}

export async function putFileObject(key: string, filename: string, contentType: string, provider: StorageProvider = activeStorageProvider()) {
  const details = await stat(filename);
  if (!details.isFile()) throw new Error("Storage source is not a file");
  return putObject(key, Readable.toWeb(createReadStream(filename)) as ReadableStream<Uint8Array>, contentType, provider);
}

export async function listLocalFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listLocalFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export function storageStatus() {
  const provider = activeStorageProvider();
  return { provider, root: storageRoot(), configured: provider === "local" || Boolean(s3Config()) } as const;
}

export async function checkStorageReadiness() {
  try {
    const config = s3Config();
    if (!config) {
      await access(storageRoot(), constants.R_OK | constants.W_OK);
      return true;
    }
    const url = s3BucketUrl(config);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", "1");
    const response = await s3Request("GET", url, sha256(""), { signal: AbortSignal.timeout(7_000) });
    return response.ok;
  } catch { return false; }
}
