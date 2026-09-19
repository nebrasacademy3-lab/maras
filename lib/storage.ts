import { createHash, createHmac } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { normalizeStorageBucket, normalizeStorageKey, normalizeStoragePrefix, storageEndpointUrl, storageTransferTimeoutMs, storageUploadLimitBytes } from "@/lib/storage-policy";

export type StorageProvider = "local" | "s3";
export type StoredObject = { body: ReadableStream<Uint8Array>; size: number; etag: string; contentType?: string };
type ObjectRange = { offset: number; length: number };
type TransferOptions = { signal?: AbortSignal; maxBytes?: number };
type S3Config = { endpoint: URL; bucket: string; region: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean };

function storageRoot() {
  return resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR?.trim() || join(process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || join(process.cwd(), ".data"), "uploads"));
}
function s3Config(): S3Config | null {
  const endpointValue = process.env.S3_ENDPOINT?.trim() || "";
  const bucketValue = process.env.S3_BUCKET?.trim() || "";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || "";
  const supplied = [endpointValue, bucketValue, accessKeyId, secretAccessKey].filter(Boolean).length;
  if (supplied === 0) return null;
  if (supplied !== 4) throw new Error("S3 storage configuration is incomplete");
  const endpoint = storageEndpointUrl(endpointValue, { allowLoopbackHttp: process.env.NODE_ENV !== "production" && process.env.S3_ALLOW_INSECURE_LOOPBACK === "true" });
  return { endpoint, bucket: normalizeStorageBucket(bucketValue), region: process.env.S3_REGION?.trim() || "auto", accessKeyId, secretAccessKey, forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false" };
}
export function activeStorageProvider(): StorageProvider { return s3Config() ? "s3" : "local"; }

function insideRoot(root: string, path: string) {
  const rel = relative(root, path);
  return rel === "" || rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !rel.startsWith("/") && !rel.startsWith("\\") && !/^[a-z]:/i.test(rel);
}
/** The configured root is trusted; no object-key component may be a symlink. */
async function safeLocalPath(key: string, createParents = false) {
  const parts = normalizeStorageKey(key).split("/");
  const root = storageRoot();
  const destination = resolve(root, ...parts);
  if (destination === root || !insideRoot(root, destination)) throw new Error("Invalid storage key");
  if (createParents) await mkdir(root, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(root);
  let parent = root;
  for (const segment of parts.slice(0, -1)) {
    parent = join(parent, segment);
    if (createParents) {
      try { await mkdir(parent, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    const entry = await lstat(parent);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("Unsafe local storage path");
  }
  if (!insideRoot(canonicalRoot, await realpath(dirname(destination)))) throw new Error("Unsafe local storage path");
  try { if ((await lstat(destination)).isSymbolicLink()) throw new Error("Unsafe local storage path"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return destination;
}
function toNodeReadable(stream: ReadableStream<Uint8Array>) {
  return Readable.fromWeb(stream as import("node:stream/web").ReadableStream<Uint8Array>);
}
function transferSignal(signal?: AbortSignal, maximum?: number) {
  const deadline = AbortSignal.timeout(maximum ?? storageTransferTimeoutMs(process.env.STORAGE_TRANSFER_TIMEOUT_MS));
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}
function uploadLimit(options: TransferOptions) {
  const maximum = storageUploadLimitBytes(process.env.STORAGE_MAX_UPLOAD_BYTES);
  if (options.maxBytes === undefined) return maximum;
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) throw new Error("Invalid storage byte limit");
  return Math.min(maximum, options.maxBytes);
}
function validRange(range?: ObjectRange) {
  return !range || Number.isSafeInteger(range.offset) && Number.isSafeInteger(range.length)
    // Compare before adding: an overflowing sum can round back into the safe range.
    && range.offset >= 0 && range.length > 0 && range.length - 1 <= Number.MAX_SAFE_INTEGER - range.offset;
}
function encodeRfc3986(value: string) { return encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`); }
function hmac(key: Buffer | string, value: string) { return createHmac("sha256", key).update(value).digest(); }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
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
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key.toLowerCase(), value.trim()])) };
  const headerNames = Object.keys(headers).sort();
  const canonicalHeaders = headerNames.map(name => `${name}:${headers[name].replace(/\s+/g, " ")}\n`).join("");
  const canonicalQuery = [...url.searchParams.entries()].sort(([lk, lv], [rk, rv]) => lk.localeCompare(rk) || lv.localeCompare(rv)).map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`).join("&");
  const canonicalRequest = [method, url.pathname || "/", canonicalQuery, canonicalHeaders, headerNames.join(";"), payloadHash].join("\n");
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, date), config.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(`AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`).digest("hex");
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${headerNames.join(";")}, Signature=${signature}` };
}
/** Listing XML must be complete and must retain whitespace inside object keys. */
async function responseSnippet(response: Response, maximum: number) {
  if (!response.body) throw new Error("S3 listing body is missing");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) throw new Error("S3 listing exceeded the response byte limit");
      parts.push(part.value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts.map(part => Buffer.from(part))));
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
async function s3Request(method: string, url: URL, payloadHash: string, init: RequestInit = {}, signedExtra: Record<string, string> = {}) {
  const config = s3Config();
  if (!config) throw new Error("S3 storage is not configured");
  const destination = s3BucketUrl(config);
  const bucketPath = destination.pathname.replace(/\/+$/, "");
  if (url.origin !== destination.origin || url.username || url.password || url.hash
      || !(url.pathname === bucketPath || url.pathname.startsWith(bucketPath + "/"))) throw new Error("Unexpected S3 request destination");
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(signedS3Headers(config, method, url, payloadHash, signedExtra))) headers.set(name, value);
  const response = await fetch(url, { ...init, method, headers, redirect: "error", credentials: "omit", cache: "no-store", signal: transferSignal(init.signal || undefined) });
  if (!response.ok && response.status !== 404) {
    await response.body?.cancel().catch(() => undefined);
    // Never expose XML error bodies, object keys, endpoint credentials or signatures.
    throw new Error(`S3 ${method} failed (${response.status})`);
  }
  return response;
}
function storageMeter(maxBytes: number, digest?: ReturnType<typeof createHash>) {
  let size = 0;
  return {
    meter: new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength;
      if (size > maxBytes) return callback(new Error("Storage object exceeds the configured byte limit"));
      digest?.update(chunk); callback(null, chunk);
    } }),
    size: () => size,
  };
}
async function spoolStream(body: ReadableStream<Uint8Array>, options: TransferOptions) {
  const directory = await mkdtemp(join(tmpdir(), "meras-storage-"));
  const filename = join(directory, "payload");
  const digest = createHash("sha256");
  const { meter, size } = storageMeter(uploadLimit(options), digest);
  try {
    await pipeline(toNodeReadable(body), meter, createWriteStream(filename, { flags: "wx", mode: 0o600 }), { signal: transferSignal(options.signal) });
    return { directory, filename, size: size(), hash: digest.digest("hex") };
  } catch (error) { await rm(directory, { recursive: true, force: true }).catch(() => undefined); throw error; }
}
async function putLocalObject(key: string, body: ReadableStream<Uint8Array>, contentType: string | undefined, options: TransferOptions) {
  const destination = await safeLocalPath(key, true);
  const temporary = `${destination}.${crypto.randomUUID()}.part`;
  const { meter } = storageMeter(uploadLimit(options));
  try {
    await pipeline(toNodeReadable(body), meter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }), { signal: transferSignal(options.signal) });
    await safeLocalPath(key);
    await rename(temporary, destination);
    return { key, contentType, provider: "local" as const };
  } catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
}
export async function putObject(key: string, body: ReadableStream<Uint8Array>, contentType?: string, provider: StorageProvider = activeStorageProvider(), options: TransferOptions = {}) {
  const normalizedKey = normalizeStorageKey(key);
  options.signal?.throwIfAborted();
  if (provider === "local") return putLocalObject(normalizedKey, body, contentType, options);
  const config = s3Config();
  if (!config) throw new Error("The requested S3 provider is not configured");
  const staged = await spoolStream(body, options);
  const stream = createReadStream(/* turbopackIgnore: true */ staged.filename);
  try {
    const init = { body: stream as unknown as BodyInit, duplex: "half", headers: { "content-length": String(staged.size), "content-type": contentType || "application/octet-stream" }, signal: options.signal } as RequestInit & { duplex: "half" };
    const response = await s3Request("PUT", s3ObjectUrl(config, normalizedKey), staged.hash, init);
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error("S3 object upload failed");
    return { key: normalizedKey, contentType, provider: "s3" as const };
  } finally { stream.destroy(); await rm(staged.directory, { recursive: true, force: true }).catch(() => undefined); }
}
async function getLocalObject(key: string, range?: ObjectRange, signal?: AbortSignal): Promise<StoredObject | null> {
  let handle;
  try { handle = await open(await safeLocalPath(key), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  try {
    const details = await handle.stat();
    if (!details.isFile() || range && range.offset >= details.size) { await handle.close(); return null; }
    const start = range?.offset ?? 0;
    const end = range ? Math.min(details.size - 1, start + (range.length - 1)) : details.size - 1;
    const stream = handle.createReadStream({ ...(range ? { start, end } : {}), signal });
    const etag = `"${details.size.toString(16)}-${Math.floor(details.mtimeMs).toString(16)}"`;
    return { body: Readable.toWeb(stream) as ReadableStream<Uint8Array>, size: range ? end - start + 1 : details.size, etag };
  } catch (error) { await handle.close().catch(() => undefined); throw error; }
}
export async function getObject(key: string, range?: ObjectRange, provider: StorageProvider = activeStorageProvider(), signal?: AbortSignal): Promise<StoredObject | null> {
  const normalizedKey = normalizeStorageKey(key);
  signal?.throwIfAborted();
  if (!validRange(range)) return null;
  if (provider === "local") return getLocalObject(normalizedKey, range, signal);
  const config = s3Config();
  if (!config) throw new Error("The requested S3 provider is not configured");
  const headers: Record<string, string> = {};
  if (range) headers.range = `bytes=${range.offset}-${range.offset + (range.length - 1)}`;
  const response = await s3Request("GET", s3ObjectUrl(config, normalizedKey), sha256(""), { headers, signal }, headers);
  if (response.status === 404 || !response.body) { await response.body?.cancel().catch(() => undefined); return null; }
  const rawLength = response.headers.get("content-length");
  const contentLength = rawLength === null ? null : Number(rawLength);
  const receivedRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
  if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength < 0)
      || range && (response.status !== 206 || !receivedRange || Number(receivedRange[1]) !== range.offset
        || Number(receivedRange[2]) < range.offset || Number(receivedRange[2]) >= range.offset + range.length
        || contentLength !== Number(receivedRange[2]) - range.offset + 1)) {
    await response.body.cancel().catch(() => undefined);
    throw new Error("Invalid S3 object response metadata");
  }
  return { body: response.body, size: contentLength ?? 0, etag: response.headers.get("etag") || `"${sha256(normalizedKey).slice(0, 24)}"`, contentType: response.headers.get("content-type") || undefined };
}
export async function deleteObject(key: string, provider: StorageProvider = activeStorageProvider()) {
  const normalizedKey = normalizeStorageKey(key);
  if (provider === "local") {
    try { await rm(await safeLocalPath(normalizedKey), { force: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return;
  }
  const config = s3Config();
  if (!config) throw new Error("The requested S3 provider is not configured");
  const response = await s3Request("DELETE", s3ObjectUrl(config, normalizedKey), sha256(""));
  await response.body?.cancel().catch(() => undefined);
}
function decodeXml(value: string) { return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
async function listS3Keys(prefix: string) {
  const config = s3Config();
  if (!config) throw new Error("The requested S3 provider is not configured");
  const normalizedPrefix = normalizeStoragePrefix(prefix) + "/";
  const keys = new Set<string>(), seenTokens = new Set<string>();
  const signal = AbortSignal.timeout(120_000);
  let continuation = "", pages = 0;
  do {
    signal.throwIfAborted();
    if (++pages > 100) throw new Error("S3 prefix listing exceeded the safety page limit");
    const url = s3BucketUrl(config);
    url.searchParams.set("list-type", "2"); url.searchParams.set("max-keys", "1000"); url.searchParams.set("prefix", normalizedPrefix);
    if (continuation) url.searchParams.set("continuation-token", continuation);
    const response = await s3Request("GET", url, sha256(""), { signal });
    const xml = await responseSnippet(response, 2 * 1024 * 1024);
    const truncated = /<IsTruncated>\s*(true|false)\s*<\/IsTruncated>/.exec(xml)?.[1];
    if (!response.ok || !/<ListBucketResult\b/.test(xml) || !/<\/ListBucketResult>/.test(xml) || !truncated) throw new Error("Invalid S3 prefix listing");
    for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
      const key = normalizeStorageKey(decodeXml(match[1]));
      if (!key.startsWith(normalizedPrefix)) throw new Error("S3 listing escaped the requested prefix");
      keys.add(key);
    }
    continuation = truncated === "true" ? decodeXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] || "") : "";
    if (truncated === "true" && (!continuation || continuation.length > 8192 || seenTokens.has(continuation))) throw new Error("Invalid S3 continuation token");
    if (continuation) seenTokens.add(continuation);
  } while (continuation);
  return [...keys];
}
export async function deletePrefix(prefix: string, provider: StorageProvider = activeStorageProvider()) {
  const normalized = normalizeStoragePrefix(prefix);
  if (provider === "local") {
    try { await rm(await safeLocalPath(normalized), { recursive: true, force: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return;
  }
  // Validate every listing page before issuing even the first deletion.
  const keys = await listS3Keys(normalized);
  for (let index = 0; index < keys.length; index += 10) await Promise.all(keys.slice(index, index + 10).map(key => deleteObject(key, "s3")));
}
export async function materializeObject(key: string, destination: string, provider: StorageProvider = activeStorageProvider()) {
  const object = await getObject(key, undefined, provider);
  if (!object) return false;
  let created = false;
  try {
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const handle = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    const { meter } = storageMeter(storageUploadLimitBytes(process.env.STORAGE_MAX_UPLOAD_BYTES));
    try { await pipeline(toNodeReadable(object.body), meter, handle.createWriteStream(), { signal: transferSignal() }); }
    finally { await handle.close().catch(() => undefined); }
    return true;
  } catch (error) {
    await object.body.cancel().catch(() => undefined);
    if (created) await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
}
export async function putFileObject(key: string, filename: string, contentType: string, provider: StorageProvider = activeStorageProvider()) {
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const details = await handle.stat();
    if (!details.isFile()) throw new Error("Storage source is not a file");
    if (details.size > storageUploadLimitBytes(process.env.STORAGE_MAX_UPLOAD_BYTES)) throw new Error("Storage object exceeds the configured byte limit");
    return await putObject(key, Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>, contentType, provider);
  } finally { await handle.close().catch(() => undefined); }
}
export async function listLocalFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(path: string, depth: number) {
    if (depth > 32 || files.length > 100_000) throw new Error("Local storage listing exceeded the safety limit");
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Unsafe local storage path");
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child, depth + 1);
      else if (entry.isFile()) files.push(child);
    }
  }
  await walk(directory, 0);
  return files;
}
export function storageStatus() {
  const provider = activeStorageProvider();
  return { provider, root: storageRoot(), configured: provider === "local" || Boolean(s3Config()) } as const;
}
export async function checkStorageReadiness(signal?: AbortSignal) {
  try {
    signal?.throwIfAborted();
    const config = s3Config();
    if (!config) { await access(storageRoot(), constants.R_OK | constants.W_OK); return !signal?.aborted; }
    const url = s3BucketUrl(config);
    url.searchParams.set("list-type", "2"); url.searchParams.set("max-keys", "1");
    const response = await s3Request("GET", url, sha256(""), { signal: transferSignal(signal, 7_000) });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch { return false; }
}
