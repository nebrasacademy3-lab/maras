import { createHash, createHmac } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, relative } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

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
  return process.env.UPLOAD_DIR?.trim() || join(process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || join(process.cwd(), ".data"), "uploads");
}

function s3Config(): S3Config | null {
  const endpointValue = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpointValue || !bucket || !accessKeyId || !secretAccessKey) return null;
  let endpoint: URL;
  try { endpoint = new URL(endpointValue); } catch { return null; }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") return null;
  return { endpoint, bucket, region: process.env.S3_REGION?.trim() || "auto", accessKeyId, secretAccessKey, forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false" };
}

export function activeStorageProvider(): StorageProvider {
  return s3Config() ? "s3" : "local";
}

function safePath(key: string) {
  const cleaned = key.replace(/^[/\\]+/, "");
  const absolute = normalize(join(storageRoot(), cleaned));
  const root = normalize(storageRoot());
  const inside = relative(root, absolute);
  if (!inside || inside.startsWith("..") || inside.includes(`..${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Invalid storage key");
  return absolute;
}

function normalizedObjectKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid storage key");
  return normalized;
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
  const encodedKey = normalizedObjectKey(key).split("/").map(encodeRfc3986).join("/");
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

async function s3Request(method: string, url: URL, payloadHash: string, init: RequestInit = {}, signedExtra: Record<string, string> = {}) {
  const config = s3Config();
  if (!config) throw new Error("S3 storage is not configured");
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(signedS3Headers(config, method, url, payloadHash, signedExtra))) headers.set(name, value);
  const response = await fetch(url, { ...init, method, headers, signal: init.signal || AbortSignal.timeout(120_000) });
  if (!response.ok && response.status !== 404) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`S3 ${method} failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response;
}

async function spoolStream(body: ReadableStream<Uint8Array>) {
  const directory = await mkdtemp(join(tmpdir(), "meras-storage-"));
  const filename = join(directory, "payload");
  const digest = createHash("sha256");
  let size = 0;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) { size += chunk.byteLength; digest.update(chunk); callback(null, chunk); } });
  try {
    await pipeline(toNodeReadable(body), meter, createWriteStream(filename, { flags: "wx", mode: 0o600 }));
    return { directory, filename, size, hash: digest.digest("hex") };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function putLocalObject(key: string, body: ReadableStream<Uint8Array>, contentType?: string) {
  const destination = safePath(key);
  const temporary = `${destination}.${crypto.randomUUID()}.part`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await pipeline(toNodeReadable(body), createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    await rename(temporary, destination);
    return { key, contentType, provider: "local" as const };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function putObject(key: string, body: ReadableStream<Uint8Array>, contentType?: string, provider: StorageProvider = activeStorageProvider()) {
  normalizedObjectKey(key);
  if (provider === "local") return putLocalObject(key, body, contentType);
  const config = s3Config();
  if (!config) throw new Error("The requested S3 provider is not configured");
  const staged = await spoolStream(body);
  try {
    const stream = createReadStream(/* turbopackIgnore: true */ staged.filename);
    const init = { body: stream as unknown as BodyInit, duplex: "half", headers: { "content-length": String(staged.size), "content-type": contentType || "application/octet-stream" }, signal: AbortSignal.timeout(30 * 60_000) } as RequestInit & { duplex: "half" };
    await s3Request("PUT", s3ObjectUrl(config, key), staged.hash, init);
    return { key, contentType, provider: "s3" as const };
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

export async function getObject(key: string, range?: ObjectRange, provider: StorageProvider = activeStorageProvider()): Promise<StoredObject | null> {
  normalizedObjectKey(key);
  if (provider === "local") return getLocalObject(key, range);
  const config = s3Config();
  if (!config) return null;
  const headers: Record<string, string> = {};
  if (range) headers.range = `bytes=${range.offset}-${range.offset + range.length - 1}`;
  const response = await s3Request("GET", s3ObjectUrl(config, key), sha256(""), { headers }, headers);
  if (response.status === 404 || !response.body) return null;
  const contentLength = Number(response.headers.get("content-length"));
  return { body: response.body, size: Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : range?.length || 0, etag: response.headers.get("etag") || `"${sha256(key).slice(0, 24)}"`, contentType: response.headers.get("content-type") || undefined };
}

export async function deleteObject(key: string, provider: StorageProvider = activeStorageProvider()) {
  normalizedObjectKey(key);
  if (provider === "local") {
    try { await rm(safePath(key), { force: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return;
  }
  const config = s3Config();
  if (config) await s3Request("DELETE", s3ObjectUrl(config, key), sha256(""));
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function listS3Keys(prefix: string) {
  const config = s3Config();
  if (!config) return [];
  const keys: string[] = [];
  let continuation = "";
  do {
    const url = s3BucketUrl(config);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    if (continuation) url.searchParams.set("continuation-token", continuation);
    const response = await s3Request("GET", url, sha256(""));
    const xml = await response.text();
    keys.push(...[...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) => decodeXml(match[1])));
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
