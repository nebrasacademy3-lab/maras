/** Versioned authenticated streaming envelopes. No plaintext may be consumed before final() succeeds. */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open, unlink, lstat } from "node:fs/promises";
import { Transform, Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("MARASB01"), HEADER_BYTES = 52, TAG_BYTES = 16;
export const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
export class RecoveryError extends Error {
  constructor(code) { super(code); this.name = "RecoveryError"; this.code = code; }
}
function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new RecoveryError("INVALID_ENCRYPTION_KEY");
}
function derive(key, salt) { return Buffer.from(hkdfSync("sha256", key, salt, Buffer.from("maras-recovery-v1"), 32)); }
function aad(context) {
  if (typeof context !== "string" || !context || context.length > 1500) throw new RecoveryError("INVALID_ENVELOPE_CONTEXT");
  return Buffer.from(context, "utf8");
}
export async function regularFile(path, maxBytes = Number.MAX_SAFE_INTEGER) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || !Number.isSafeInteger(stat.size) || stat.size > maxBytes) throw new RecoveryError("UNSAFE_OR_OVERSIZED_FILE");
    return { handle, stat };
  } catch (error) { await handle.close(); throw error; }
}
export async function readKey(path) {
  const { handle, stat } = await regularFile(path, 65);
  try {
    if ((stat.mode & 0o077) !== 0) throw new RecoveryError("KEY_FILE_MUST_BE_PRIVATE");
    const bytes = await handle.readFile();
    if (bytes.length === 32) return bytes;
    const hex = bytes.toString("utf8").trim();
    bytes.fill(0);
    if (!/^[a-fA-F0-9]{64}$/.test(hex)) throw new RecoveryError("INVALID_ENCRYPTION_KEY");
    return Buffer.from(hex, "hex");
  } finally { await handle.close(); }
}
export async function syncFile(path) { const h = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { await h.sync(); } finally { await h.close(); } }
export async function syncDirectory(path) { const h = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { await h.sync(); } finally { await h.close(); } }

function fileSink(handle, start = 0) {
  let position = start;
  return new Writable({ write(chunk, _encoding, callback) {
    (async () => {
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset, position);
        if (!bytesWritten) throw new RecoveryError("FILE_WRITE_FAILED");
        offset += bytesWritten; position += bytesWritten;
      }
    })().then(() => callback(), callback);
  } });
}

export async function sealStream(input, destination, key, context, { maxBytes = 100 * 1024 ** 3, signal } = {}) {
  requireKey(key);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RecoveryError("INVALID_BYTE_LIMIT");
  const salt = randomBytes(32), nonce = randomBytes(12), derived = derive(key, salt);
  const cipher = createCipheriv("aes-256-gcm", derived, nonce);
  cipher.setAAD(aad(context));
  const hash = createHash("sha256"); let bytes = 0, created = false;
  const meter = new Transform({ transform(chunk, _encoding, next) {
    bytes += chunk.length;
    if (bytes > maxBytes) return next(new RecoveryError("BACKUP_BYTE_LIMIT"));
    hash.update(chunk); next(null, chunk);
  } });
  try {
    // Exclusive creation prevents replacing another backup or following a symlink.
    const file = await open(destination, "wx", 0o600); created = true;
    try {
      await file.writeFile(Buffer.concat([MAGIC, salt, nonce]));
      await pipeline(input, meter, cipher, fileSink(file, HEADER_BYTES), { signal });
      await file.write(cipher.getAuthTag(), 0, TAG_BYTES, HEADER_BYTES + bytes);
      await file.sync();
    } finally { await file.close(); }
    return { bytes, sha256: hash.digest("hex") };
  } catch (error) {
    if (created) await unlink(destination).catch(() => undefined);
    throw error;
  } finally { derived.fill(0); }
}
export async function sealBytes(bytes, destination, key, context) {
  return sealStream(Readable.from([bytes]), destination, key, context, { maxBytes: bytes.length });
}
export async function unsealFile(source, destination, key, context, expected, { signal } = {}) {
  requireKey(key);
  if (!expected || !Number.isSafeInteger(expected.bytes) || expected.bytes < 0 || !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new RecoveryError("INVALID_FILE_MANIFEST");
  const { handle, stat } = await regularFile(source, expected.bytes + HEADER_BYTES + TAG_BYTES);
  let created = false, derived;
  try {
    if (stat.size !== expected.bytes + HEADER_BYTES + TAG_BYTES) throw new RecoveryError("ENVELOPE_SIZE_MISMATCH");
    const header = Buffer.alloc(HEADER_BYTES), tag = Buffer.alloc(TAG_BYTES);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, stat.size - TAG_BYTES);
    if (!header.subarray(0, 8).equals(MAGIC)) throw new RecoveryError("INVALID_ENVELOPE");
    derived = derive(key, header.subarray(8, 40));
    const decipher = createDecipheriv("aes-256-gcm", derived, header.subarray(40));
    decipher.setAAD(aad(context)); decipher.setAuthTag(tag);
    let bytes = 0; const hash = createHash("sha256");
    const meter = new Transform({ transform(chunk, _encoding, next) { bytes += chunk.length; hash.update(chunk); next(null, chunk); } });
    const out = await open(destination, "wx", 0o600); created = true;
    try {
      const input = expected.bytes ? handle.createReadStream({ autoClose: false, start: HEADER_BYTES, end: stat.size - TAG_BYTES - 1 }) : Readable.from([]);
      await pipeline(input, decipher, meter, fileSink(out), { signal });
      if (bytes !== expected.bytes || hash.digest("hex") !== expected.sha256) throw new RecoveryError("PLAINTEXT_INTEGRITY_MISMATCH");
      await out.sync();
    } finally { await out.close(); }
  } catch {
    // Deliberately do not expose crypto internals or partially decrypted contents.
    if (created) await unlink(destination).catch(() => undefined);
    throw new RecoveryError("BACKUP_AUTHENTICATION_FAILED");
  } finally { derived?.fill(0); await handle.close(); }
}
export async function openManifest(path, key) {
  requireKey(key);
  const { handle, stat } = await regularFile(path, MAX_MANIFEST_BYTES + HEADER_BYTES + TAG_BYTES);
  let derived;
  try {
    if (stat.size < HEADER_BYTES + TAG_BYTES) throw new Error("size");
    const data = await handle.readFile();
    if (!data.subarray(0, 8).equals(MAGIC)) throw new Error("magic");
    derived = derive(key, data.subarray(8, 40));
    const decipher = createDecipheriv("aes-256-gcm", derived, data.subarray(40, HEADER_BYTES));
    decipher.setAAD(aad("manifest")); decipher.setAuthTag(data.subarray(-TAG_BYTES));
    const plain = Buffer.concat([decipher.update(data.subarray(HEADER_BYTES, -TAG_BYTES)), decipher.final()]);
    try { return JSON.parse(plain.toString("utf8")); } finally { plain.fill(0); }
  } catch { throw new RecoveryError("BACKUP_AUTHENTICATION_FAILED"); }
  finally { derived?.fill(0); await handle.close(); }
}
export async function assertPrivateDirectory(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new RecoveryError("PRIVATE_DIRECTORY_REQUIRED");
}
