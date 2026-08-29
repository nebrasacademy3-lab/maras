import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export type StoredObject = {
  body: ReadableStream;
  size: number;
  etag: string;
  contentType?: string;
};

function storageRoot() {
  return process.env.UPLOAD_DIR?.trim() || join(process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || join(process.cwd(), ".data"), "uploads");
}

function safePath(key: string) {
  const cleaned = key.replace(/^[/\\]+/, "");
  const absolute = normalize(join(storageRoot(), cleaned));
  const root = normalize(storageRoot());
  const inside = relative(root, absolute);
  if (!inside || inside.startsWith("..") || inside.includes(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("Invalid storage key");
  }
  return absolute;
}

function toNodeReadable(stream: ReadableStream) {
  return Readable.fromWeb(stream as unknown as import("node:stream/web").ReadableStream<Uint8Array>);
}

export async function putObject(key: string, body: ReadableStream, contentType?: string) {
  const destination = safePath(key);
  const temporary = `${destination}.${crypto.randomUUID()}.part`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await pipeline(toNodeReadable(body), createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    await rename(temporary, destination);
    return { key, contentType };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function getObject(key: string, range?: { offset: number; length: number }): Promise<StoredObject | null> {
  const filename = safePath(key);
  let details;
  try {
    details = await stat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!details.isFile()) return null;
  if (range && (!Number.isSafeInteger(range.offset) || !Number.isSafeInteger(range.length) || range.offset < 0 || range.length <= 0 || range.offset >= details.size)) return null;
  const start = range?.offset ?? 0;
  const end = range ? Math.min(details.size - 1, start + range.length - 1) : details.size - 1;
  const stream = createReadStream(filename, range ? { start, end } : undefined);
  const etag = `"${details.size.toString(16)}-${Math.floor(details.mtimeMs).toString(16)}"`;
  return { body: Readable.toWeb(stream) as ReadableStream, size: details.size, etag };
}

export async function deleteObject(key: string) {
  try {
    await rm(safePath(key), { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function storageStatus() {
  return { provider: "railway-volume", root: storageRoot() } as const;
}
