/** Offline application recovery bundles; never restores over an existing database or directory. */
import pg from "pg";
import { mkdir, mkdtemp, realpath, lstat, readdir, rm, open, rename, writeFile } from "node:fs/promises";
import { resolve, dirname, join, relative, sep, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { sealStream, sealBytes, openManifest, unsealFile, regularFile, syncDirectory, RecoveryError, MAX_MANIFEST_BYTES } from "./crypto.mjs";

const FORMAT = "maras-local-recovery-v1", MAX_FILES = 100_000, MAX_BYTES = 500 * 1024 ** 3;
const q = value => '"' + String(value).replaceAll('"', '""') + '"';
export function objectKey(value) {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC") || value !== value.trim()
      || value.startsWith("/") || value.endsWith("/") || /[\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069:?#%]/.test(value)
      || Buffer.byteLength(value) > 1024 || value.split("/").some(x => !x || x === "." || x === ".." || Buffer.byteLength(x) > 255)) throw new RecoveryError("UNSAFE_OBJECT_KEY");
  return value;
}
export function connection(value, { restore = false } = {}) {
  let url; try { url = new URL(value); } catch { throw new RecoveryError("INVALID_DATABASE_URL"); }
  const loopback = ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)
      || url.hash || /[\u0000-\u0020\u007f]/.test(value) || [...url.searchParams.keys()].some(k => k !== "sslmode")
      || url.searchParams.getAll("sslmode").length > 1 || restore && !loopback) throw new RecoveryError("INVALID_OR_UNSAFE_DATABASE_URL");
  const sslmode = url.searchParams.get("sslmode") || (loopback ? "disable" : "verify-full");
  if (!["disable", "verify-full"].includes(sslmode) || sslmode === "disable" && !loopback) throw new RecoveryError("VERIFIED_TLS_REQUIRED");
  let database, user, password;
  try { database = decodeURIComponent(url.pathname.slice(1)); user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); }
  catch { throw new RecoveryError("INVALID_DATABASE_URL"); }
  if ([database, user, password].some(v => /[\u0000\r\n]/.test(v)) || !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,62}$/.test(database)) throw new RecoveryError("INVALID_DATABASE_URL");
  const host = url.hostname.replace(/^\[|\]$/g, ""), port = Number(url.port || "5432");
  return { host, port, database, user, password, ssl: sslmode === "disable" ? false : { rejectUnauthorized: true }, sslmode };
}
function client(config) { return new pg.Client({ ...config, connectionTimeoutMillis: 10_000, query_timeout: 120_000, statement_timeout: 120_000, application_name: "maras-offline-recovery" }); }
export function childEnvironment(config) {
  // No application provider secrets, ambient PGOPTIONS, service files or .pgpass are inherited.
  return { PATH: process.env.PATH || "/usr/bin:/bin", LANG: "C", LC_ALL: "C", PGHOST: config.host,
    PGPORT: String(config.port), PGDATABASE: config.database, PGUSER: config.user, PGPASSWORD: config.password,
    PGSSLMODE: config.sslmode, PGPASSFILE: "/dev/null", PGCONNECT_TIMEOUT: "10", PGAPPNAME: "maras-offline-recovery",
    ...(process.env.RECOVERY_PG_LIBRARY_DIR ? { LD_LIBRARY_PATH: resolve(process.env.RECOVERY_PG_LIBRARY_DIR) } : {}) };
}
function toolPath(name, binDir) { return binDir ? join(resolve(binDir), name) : name; }
function subprocess(binary, args, env, timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 7_200_000) throw new RecoveryError("INVALID_PROCESS_DEADLINE");
  const child = spawn(binary, args, { env, stdio: ["ignore", "pipe", "pipe"], shell: false });
  let stderrBytes = 0, timedOut = false;
  child.stderr.on("data", bytes => { stderrBytes += bytes.length; });
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
  const done = new Promise((accept, reject) => {
    child.once("error", () => reject(new RecoveryError("POSTGRES_CLIENT_START_FAILED")));
    child.once("close", code => {
      if (timedOut) reject(new RecoveryError("POSTGRES_CLIENT_TIMEOUT"));
      else if (code !== 0 || stderrBytes) reject(new RecoveryError("POSTGRES_CLIENT_REPORTED_ERROR"));
      else accept();
    });
  }).finally(() => clearTimeout(timer));
  done.catch(() => undefined); // rejection is observed immediately, also awaited by each caller
  return { child, done };
}
async function toolVersion(name, config, binDir) {
  const { child, done } = subprocess(toolPath(name, binDir), ["--version"], childEnvironment(config), 10_000);
  let output = "";
  child.stdout.on("data", bytes => { if (output.length < 2048) output += bytes.toString(); });
  await done;
  const match = output.match(/\(PostgreSQL\) (\d+)\./);
  if (!match) throw new RecoveryError("UNRECOGNIZED_POSTGRES_CLIENT");
  return Number(match[1]);
}
export async function canonicalDirectory(path) {
  const absolute = resolve(path);
  // Check every ancestor rather than letting realpath silently accept a symlink.
  for (let part = absolute;; part = dirname(part)) {
    const stat = await lstat(part);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new RecoveryError("UNSAFE_DIRECTORY");
    if (dirname(part) === part) break;
  }
  if (await realpath(absolute) !== absolute) throw new RecoveryError("UNSAFE_DIRECTORY");
  return absolute;
}
function inside(parent, child) { const rel = relative(parent, child); return !rel || !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel); }
async function newDestination(path) {
  const absolute = resolve(path); await canonicalDirectory(dirname(absolute));
  try { await lstat(absolute); } catch (error) { if (error.code === "ENOENT") return absolute; throw error; }
  throw new RecoveryError("DESTINATION_ALREADY_EXISTS");
}
function stamp(stat) { return [stat.dev, stat.ino, stat.size, stat.mtimeNs?.toString() ?? stat.mtimeMs, stat.ctimeNs?.toString() ?? stat.ctimeMs].join(":"); }
async function inventory(root) {
  const rows = []; let total = 0;
  async function walk(prefix) {
    const dir = join(root, prefix); await canonicalDirectory(dir);
    for (const name of (await readdir(dir)).sort()) {
      const key = objectKey(prefix ? prefix + "/" + name : name), path = join(root, key);
      const st = await lstat(path);
      if (st.isSymbolicLink()) throw new RecoveryError("SYMLINKS_NOT_BACKED_UP");
      if (st.isDirectory()) { await walk(key); continue; }
      if (!st.isFile() || st.nlink !== 1 || !Number.isSafeInteger(st.size)) throw new RecoveryError("UNSAFE_STORAGE_FILE");
      total += st.size;
      if (rows.length >= MAX_FILES || total > MAX_BYTES) throw new RecoveryError("STORAGE_BACKUP_LIMIT");
      rows.push({ key, bytes: st.size, stamp: stamp(st) });
    }
  }
  await walk(""); return rows;
}
async function assertLocalReferences(db) {
  const columns = (await db.query(`SELECT table_schema, table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND (column_name = 'storage_provider'
      OR (column_name = 'provider' AND table_name IN ('storage_cleanup_jobs', 'resumable_video_uploads')))`)).rows;
  for (const row of columns) {
    const remote = await db.query(`SELECT 1 FROM ${q(row.table_schema)}.${q(row.table_name)} WHERE ${q(row.column_name)} IS DISTINCT FROM 'local' LIMIT 1`);
    if (remote.rowCount) throw new RecoveryError("REMOTE_STORAGE_REQUIRES_SEPARATE_BACKUP");
  }
}
async function databaseInventory(db) {
  const tables = (await db.query("SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY 1,2")).rows;
  const result = [];
  for (const row of tables) {
    const count = (await db.query(`SELECT count(*)::text AS count FROM ${q(row.schema)}.${q(row.name)}`)).rows[0].count;
    result.push({ ...row, count });
  }
  return result;
}
export function validateManifest(manifest) {
  if (!manifest || manifest.format !== FORMAT || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(manifest.id) || !/^[a-f0-9]{40}$/.test(manifest.releaseSha)
      || manifest.storageMode !== "local" || !Number.isInteger(manifest.pgMajor) || manifest.pgMajor < 14
      || !Array.isArray(manifest.files) || manifest.files.length > MAX_FILES || !Array.isArray(manifest.tables)
      || manifest.tables.length > 10_000 || typeof manifest.sourceDatabase !== "string" || !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,62}$/.test(manifest.sourceDatabase)) throw new RecoveryError("INVALID_MANIFEST");
  const records = [manifest.database, ...manifest.files], names = new Set(); let total = 0;
  for (const [i, record] of records.entries()) {
    const expected = i === 0 ? "database.enc" : `objects/${String(i - 1).padStart(6, "0")}.enc`;
    if (!record || record.archive !== expected || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new RecoveryError("INVALID_MANIFEST_ENTRY");
    total += record.bytes;
    if (total > MAX_BYTES) throw new RecoveryError("RECOVERY_BYTE_LIMIT");
    if (i > 0) {
      const key = objectKey(record.key);
      if (names.has(key)) throw new RecoveryError("DUPLICATE_OBJECT_KEY");
      names.add(key);
    }
  }
  // A file may not be the ancestor of another file, regardless of input order.
  for (const key of names) { const parts = key.split("/"); parts.pop(); while (parts.length) { if (names.has(parts.join("/"))) throw new RecoveryError("OVERLAPPING_OBJECT_KEYS"); parts.pop(); } }
  const tables = new Set();
  for (const table of manifest.tables) {
    if (!table || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table.schema) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table.name)
        || !/^\d+$/.test(table.count) || tables.has(table.schema + "." + table.name)) throw new RecoveryError("INVALID_TABLE_INVENTORY");
    tables.add(table.schema + "." + table.name);
  }
  return manifest;
}
export async function createBackup({ databaseUrl, uploadDir, bundleDir, key, releaseSha, writesPaused, storageMode, binDir, timeoutMs = 3_600_000 }) {
  if (writesPaused !== true || storageMode !== "local") throw new RecoveryError("OFFLINE_LOCAL_BACKUP_REQUIRED");
  if (!/^[a-f0-9]{40}$/.test(releaseSha)) throw new RecoveryError("PINNED_RELEASE_REQUIRED");
  const config = connection(databaseUrl), root = await canonicalDirectory(uploadDir), output = await newDestination(bundleDir);
  if (inside(root, output) || inside(output, root)) throw new RecoveryError("BACKUP_STORAGE_OVERLAP");
  const pgMajor = await toolVersion("pg_dump", config, binDir), db = client(config), id = randomUUID();
  let owned = false;
  await db.connect();
  try {
    const major = Math.floor(Number((await db.query("SHOW server_version_num")).rows[0].server_version_num) / 10_000);
    if (major !== pgMajor) throw new RecoveryError("POSTGRES_MAJOR_MISMATCH");
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (await db.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
    await assertLocalReferences(db);
    const before = await inventory(root), tables = await databaseInventory(db);
    await mkdir(output, { mode: 0o700 }); owned = true; await mkdir(join(output, "objects"), { mode: 0o700 });
    const args = ["--format=custom", "--no-owner", "--no-acl", "--no-publications", "--no-subscriptions", "--no-password", "--lock-wait-timeout=10000", `--snapshot=${snapshot}`];
    const { child, done } = subprocess(toolPath("pg_dump", binDir), args, childEnvironment(config), timeoutMs);
    let dump;
    try { [dump] = await Promise.all([sealStream(child.stdout, join(output, "database.enc"), key, `${id}:database`, { signal: AbortSignal.timeout(timeoutMs) }), done]); }
    catch (error) { child.kill("SIGKILL"); await done.catch(() => undefined); throw error; }
    const files = [];
    for (const row of before) {
      const filePath = join(root, row.key); await canonicalDirectory(dirname(filePath));
      const { handle, stat } = await regularFile(filePath, row.bytes);
      try {
        if (stamp(stat) !== row.stamp) throw new RecoveryError("STORAGE_CHANGED_DURING_BACKUP");
        const archive = `objects/${String(files.length).padStart(6, "0")}.enc`;
        const result = await sealStream(handle.createReadStream({ autoClose: false }), join(output, archive), key, `${id}:object:${row.key}`, { maxBytes: row.bytes, signal: AbortSignal.timeout(timeoutMs) });
        if (result.bytes !== row.bytes || stamp(await handle.stat()) !== row.stamp) throw new RecoveryError("STORAGE_CHANGED_DURING_BACKUP");
        files.push({ key: row.key, archive, ...result });
      } finally { await handle.close(); }
    }
    if (JSON.stringify(await inventory(root)) !== JSON.stringify(before)) throw new RecoveryError("STORAGE_CHANGED_DURING_BACKUP");
    await db.query("COMMIT");
    const manifest = validateManifest({ format: FORMAT, id, releaseSha, createdAt: new Date().toISOString(), storageMode: "local", sourceDatabase: config.database, pgMajor,
      database: { archive: "database.enc", ...dump }, files, tables,
      scope: "single database and offline local object directory; excludes roles, tablespaces, remote objects and secret-manager keys" });
    const data = Buffer.from(JSON.stringify(manifest));
    if (data.length > MAX_MANIFEST_BYTES) throw new RecoveryError("MANIFEST_SIZE_LIMIT");
    await sealBytes(data, join(output, "manifest.enc"), key, "manifest"); data.fill(0);
    await syncDirectory(join(output, "objects")); await syncDirectory(output);
    const marker = await open(join(output, "COMPLETE"), "wx", 0o600);
    try { await marker.writeFile("maras-local-recovery-v1\n"); await marker.sync(); } finally { await marker.close(); }
    await syncDirectory(output); await syncDirectory(dirname(output));
    return { id, releaseSha, files: files.length, tables: tables.length, storageMode: "local" };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    if (owned) await rm(output, { recursive: true, force: true });
    throw error;
  } finally { await db.end(); }
}

export async function restoreBackup({ adminUrl, databaseName, uploadDir, bundleDir, key, trustedBackup, binDir, timeoutMs = 3_600_000 }) {
  if (trustedBackup !== true) throw new RecoveryError("TRUSTED_BACKUP_REQUIRED");
  if (!/^maras_restore_[a-z0-9_]{8,40}$/.test(databaseName)) throw new RecoveryError("NEW_RECOVERY_DATABASE_REQUIRED");
  const config = connection(adminUrl, { restore: true }), bundle = await canonicalDirectory(bundleDir), output = await newDestination(uploadDir);
  if (inside(bundle, output) || inside(output, bundle)) throw new RecoveryError("RESTORE_DIRECTORY_OVERLAP");
  const { handle: marker } = await regularFile(join(bundle, "COMPLETE"), 100); await marker.close();
  const manifest = validateManifest(await openManifest(join(bundle, "manifest.enc"), key));
  if (manifest.sourceDatabase === databaseName || config.database === databaseName) throw new RecoveryError("SOURCE_DATABASE_CANNOT_BE_TARGET");
  if (await toolVersion("pg_restore", config, binDir) !== manifest.pgMajor) throw new RecoveryError("POSTGRES_MAJOR_MISMATCH");
  const stage = await mkdtemp(join(dirname(output), ".maras-restore-"));
  let createdDatabase = false, published = false;
  const admin = client(config);
  try {
    await mkdir(join(stage, "objects"), { mode: 0o700 });
    await canonicalDirectory(join(bundle, "objects"));
    // Authenticate the entire bundle BEFORE any SQL archive is executed or database is created.
    await unsealFile(join(bundle, "database.enc"), join(stage, "database.dump"), key, `${manifest.id}:database`, manifest.database, { signal: AbortSignal.timeout(timeoutMs) });
    for (const file of manifest.files) {
      const path = join(stage, "objects", file.key); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await unsealFile(join(bundle, file.archive), path, key, `${manifest.id}:object:${file.key}`, file, { signal: AbortSignal.timeout(timeoutMs) });
    }
    await admin.connect();
    const major = Math.floor(Number((await admin.query("SHOW server_version_num")).rows[0].server_version_num) / 10_000);
    if (major !== manifest.pgMajor) throw new RecoveryError("POSTGRES_MAJOR_MISMATCH");
    if ((await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [databaseName])).rowCount) throw new RecoveryError("DATABASE_ALREADY_EXISTS");
    await admin.query(`CREATE DATABASE ${q(databaseName)} WITH TEMPLATE template0`); createdDatabase = true;
    await admin.query(`REVOKE CONNECT ON DATABASE ${q(databaseName)} FROM PUBLIC`);
    await admin.query(`COMMENT ON DATABASE ${q(databaseName)} IS 'MARAS_RECOVERY_INCOMPLETE'`);
    const target = { ...config, database: databaseName };
    const { child, done } = subprocess(toolPath("pg_restore", binDir), ["--format=custom", "--single-transaction", "--exit-on-error", "--no-owner", "--no-acl", "--no-publications", "--no-subscriptions", "--no-password", "--dbname=" + databaseName, join(stage, "database.dump")], childEnvironment(target), timeoutMs);
    child.stdout.resume(); await done;
    const verify = client(target);
    try {
      await verify.connect();
      const actual = await databaseInventory(verify);
      if (JSON.stringify(actual) !== JSON.stringify(manifest.tables)) throw new RecoveryError("RESTORED_TABLE_COUNTS_MISMATCH");
    } finally { await verify.end(); }
    // Leave every restored copy offline; activation/role remapping/secret recovery is a separate decision.
    await admin.query(`ALTER DATABASE ${q(databaseName)} ALLOW_CONNECTIONS false`);
    await admin.query(`COMMENT ON DATABASE ${q(databaseName)} IS 'MARAS_RECOVERY_VERIFIED_OFFLINE'`);
    await writeFile(join(stage, "RECOVERY.json"), JSON.stringify({ id: manifest.id, releaseSha: manifest.releaseSha, databaseName, quarantined: true }), { flag: "wx", mode: 0o600 });
    await syncDirectory(join(stage, "objects"));
    // Reserve the destination exclusively, then move each top-level object inside it.
    await mkdir(output, { mode: 0o700 }); published = true;
    await rename(join(stage, "objects"), join(output, "objects"));
    await rename(join(stage, "RECOVERY.json"), join(output, "RECOVERY.json"));
    await syncDirectory(output); await syncDirectory(dirname(output));
    return { id: manifest.id, releaseSha: manifest.releaseSha, databaseName, files: manifest.files.length, tables: manifest.tables.length, quarantined: true };
  } catch (error) {
    if (createdDatabase) await admin.query(`ALTER DATABASE ${q(databaseName)} ALLOW_CONNECTIONS false`).catch(() => undefined);
    if (published) await writeFile(join(output, "INCOMPLETE"), "Do not activate this restore.\n", { mode: 0o600 }).catch(() => undefined);
    throw error;
  } finally { await admin.end().catch(() => undefined); await rm(stage, { recursive: true, force: true }); }
}

export async function bundleDigest(bundleDir) {
  const root = await canonicalDirectory(bundleDir), hash = createHash("sha256");
  for (const file of await inventory(root)) {
    hash.update(file.key + "\0");
    const { handle } = await regularFile(join(root, file.key));
    try { for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk); } finally { await handle.close(); }
  }
  return hash.digest("hex");
}
