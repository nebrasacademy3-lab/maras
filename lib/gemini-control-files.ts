import "server-only";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, normalize, parse } from "node:path";

/** A local operator-controlled regular file; never a URL, upload or executable. */
export async function readGeminiControlFile(path: string, secret: boolean, limit: number): Promise<string> {
  const fail = () => new Error(secret ? "GEMINI_CONTROL_TOKEN_UNAVAILABLE" : "GEMINI_CONTROL_PLAN_UNAVAILABLE");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    if (process.platform === "win32" || !constants.O_NOFOLLOW || !path || path.length > 4096 || path.includes("\0") || !isAbsolute(path) || normalize(path) !== path || !Number.isSafeInteger(limit) || limit < 1 || limit > 65536) throw fail();
    const parent = dirname(path);
    if (await realpath(parent) !== parent) throw fail();
    const uid = process.getuid?.();
    // An attacker-writable parent could otherwise be exchanged between validation and open.
    for (let directory = parent; ; directory = dirname(directory)) {
      const info = await lstat(directory);
      const stickyRoot = info.uid === 0 && Boolean(info.mode & 0o1000);
      if (!info.isDirectory() || info.isSymbolicLink() || (info.uid !== 0 && info.uid !== uid) || ((info.mode & 0o022) && !stickyRoot)) throw fail();
      if (directory === parse(directory).root) break;
    }
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > limit || (before.uid !== 0 && before.uid !== uid) || (before.mode & (secret ? 0o077 : 0o022))) throw fail();
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length <= limit) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (length > limit || length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw fail();
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
  } catch { throw fail(); }
  finally { await handle?.close().catch(() => undefined); }
}

/** The trusted identity agent replaces this file atomically; no token is cached between attempts. */
export async function readGeminiControlToken(path: string): Promise<string> {
  try {
    const value: unknown = JSON.parse(await readGeminiControlFile(path, true, 16384));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.accessToken !== "string" || !/^[A-Za-z0-9._~+/=-]{1,8192}$/.test(record.accessToken) || typeof record.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(record.expiresAt)) throw new Error();
    const expires = Date.parse(record.expiresAt);
    const canonical = record.expiresAt.replace(/(?:\.(\d{1,3}))?Z$/, (_match, fraction: string | undefined) => "." + (fraction || "").padEnd(3, "0") + "Z");
    if (!Number.isFinite(expires) || new Date(expires).toISOString() !== canonical) throw new Error();
    const remaining = expires - Date.now();
    if (!Number.isFinite(remaining) || remaining < 30000 || remaining > 70 * 60 * 1000) throw new Error();
    return record.accessToken;
  } catch { throw new Error("GEMINI_CONTROL_TOKEN_UNAVAILABLE"); }
}
