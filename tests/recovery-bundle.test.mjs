import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile, access, chmod, symlink, link, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { sealStream, sealBytes, unsealFile, openManifest, readKey, regularFile } from "../scripts/recovery/crypto.mjs";
import { objectKey, connection, childEnvironment, validateManifest, canonicalDirectory, createBackup, restoreBackup } from "../scripts/recovery/bundle.mjs";

const posixFiles = { skip: process.platform === "win32" ? "Requires POSIX permission modes and O_NOFOLLOW; Ubuntu Quality gates runs these recovery protection checks without skips." : false };
const directoryLinkType = process.platform === "win32" ? "junction" : "dir";

async function fixture(t) { const root = await mkdtemp(join(tmpdir(), "maras-recovery-test-")); t.after(() => rm(root, { recursive: true, force: true })); return root; }
function manifest() { return { format: "maras-local-recovery-v1", id: "f9025673-8c3c-4767-8e44-44e903451745", releaseSha: "a".repeat(40), storageMode: "local", pgMajor: 18, sourceDatabase: "source", database: { archive: "database.enc", bytes: 10, sha256: "b".repeat(64) }, files: [], tables: [{ schema: "public", name: "users", count: "2" }] }; }

test("streamed backup round-trips empty and multi-chunk files with authenticated content binding", async t => {
  const root = await fixture(t), key = randomBytes(32);
  for (const [i, contents] of [Buffer.alloc(0), Buffer.from("private synthetic student record"), randomBytes(1024 * 1024)].entries()) {
    const cipher = join(root, `${i}.enc`), plain = join(root, `${i}.raw`);
    const chunks = Array.from({ length: Math.ceil(contents.length / 997) }, (_, offset) => contents.subarray(offset * 997, (offset + 1) * 997));
    const expected = await sealStream(Readable.from(chunks), cipher, key, `object:${i}`, { maxBytes: contents.length });
    assert.equal(expected.bytes, contents.length); assert.equal(expected.sha256, createHash("sha256").update(contents).digest("hex"));
    await unsealFile(cipher, plain, key, `object:${i}`, expected);
    assert.deepEqual(await readFile(plain), contents);
    if (contents.length) assert.equal((await readFile(cipher)).includes(contents), false);
  }
});

test("wrong key, swapped object, ciphertext, header and tag corruption leave no decrypted file", async t => {
  const root = await fixture(t), key = randomBytes(32), bytes = Buffer.from("never publish unauthenticated bytes"), original = join(root, "original");
  const expected = await sealBytes(bytes, original, key, "owned-object");
  const saved = await readFile(original);
  const variants = [{ key: randomBytes(32) }, { context: "another-object" }, ...[0, 10, 42, 60, saved.length - 1].map(at => ({ at })), { truncate: true }, { extend: true }];
  for (const [i, variant] of variants.entries()) {
    let data = Buffer.from(saved);
    if (variant.at !== undefined) data[variant.at] ^= 1;
    if (variant.truncate) data = data.subarray(0, -1);
    if (variant.extend) data = Buffer.concat([data, Buffer.from([0])]);
    const input = join(root, `in${i}`), output = join(root, `out${i}`); await writeFile(input, data);
    await assert.rejects(unsealFile(input, output, variant.key || key, variant.context || "owned-object", expected));
    await assert.rejects(access(output), { code: "ENOENT" });
  }
});

test("manifest plaintext is unavailable until authentication succeeds", async t => {
  const root = await fixture(t), key = randomBytes(32), path = join(root, "manifest.enc"), value = manifest();
  await sealBytes(Buffer.from(JSON.stringify(value)), path, key, "manifest");
  assert.deepEqual(await openManifest(path, key), value);
  await assert.rejects(openManifest(path, randomBytes(32)), /BACKUP_AUTHENTICATION_FAILED/);
  const corrupted = await readFile(path); corrupted[corrupted.length - 2] ^= 1; await writeFile(path, corrupted);
  await assert.rejects(openManifest(path, key), /BACKUP_AUTHENTICATION_FAILED/);
});

test("byte overflow and broken input never leave a completed encrypted object", async t => {
  const root = await fixture(t), key = randomBytes(32), path = join(root, "partial");
  await assert.rejects(sealStream(Readable.from([Buffer.alloc(20)]), path, key, "bounded", { maxBytes: 10 }), /BACKUP_BYTE_LIMIT/);
  await assert.rejects(access(path));
  async function* failing() { yield Buffer.from("partial"); throw new Error("synthetic interruption"); }
  await assert.rejects(sealStream(Readable.from(failing()), path, key, "bounded"), /synthetic interruption/);
  await assert.rejects(access(path));
});

test("exclusive destinations and hard-link rejection preserve existing files", async t => {
  const root = await fixture(t), key = randomBytes(32), target = join(root, "target");
  await writeFile(target, "untouched");
  await assert.rejects(sealBytes(Buffer.from("new"), target, key, "x"), { code: "EEXIST" });
  assert.equal(await readFile(target, "utf8"), "untouched");
  await link(target, join(root, "hardlink")); await assert.rejects(regularFile(target), /UNSAFE_OR_OVERSIZED_FILE/);
});

test("no-follow readers reject file symlinks without touching their target", posixFiles, async t => {
  const root = await fixture(t), target = join(root, "target"), source = join(root, "source");
  await writeFile(target, "unchanged sentinel"); await symlink(target, source);
  await assert.rejects(regularFile(source));
  assert.equal(await readFile(target, "utf8"), "unchanged sentinel");
});

test("encryption keys require a private non-symlink file and exact 256-bit key material", posixFiles, async t => {
  const root = await fixture(t), path = join(root, "key"), key = randomBytes(32);
  await writeFile(path, key.toString("hex") + "\n", { mode: 0o600 }); assert.deepEqual(await readKey(path), key);
  await chmod(path, 0o644); await assert.rejects(readKey(path), /KEY_FILE_MUST_BE_PRIVATE/);
  await chmod(path, 0o600); await writeFile(path, "wrong"); await assert.rejects(readKey(path), /INVALID_ENCRYPTION_KEY/);
  await symlink(path, join(root, "alias")); await assert.rejects(readKey(join(root, "alias")));
});

test("storage keys reject traversal, ambiguous encodings and unsafe path separators", () => {
  for (const key of ["../x", "a/../../b", "/tmp/x", "a\\b", "a//b", "a/./b", "a/%2e%2e/x", "x:stream", "a/", "a\u0000b", "x?y", "x#y", " x", "e\u0301", "a/" + "b".repeat(256)]) assert.throws(() => objectKey(key));
  for (const key of ["private/one.pdf", "private/ملف.pdf", "a-b/c_d.mp4"]) assert.equal(objectKey(key), key);
});

test("authenticated manifests still reject archive traversal, duplicate keys and file-directory overlap", () => {
  const file = { key: "private/file", archive: "objects/000000.enc", bytes: 1, sha256: "b".repeat(64) };
  assert.deepEqual(validateManifest(manifest()), manifest());
  for (const mutate of [
    m => { m.database.archive = "../database.enc"; }, m => { m.releaseSha = "main"; }, m => { m.storageMode = "s3"; },
    m => { m.files = [{ ...file, key: "../other" }]; }, m => { m.database.bytes = 0.5; },
    m => { m.files = [file, { ...file, archive: "objects/000001.enc" }]; },
    m => { m.files = [file, { ...file, key: "private", archive: "objects/000001.enc" }]; },
    m => { m.tables[0].name = 'users; SELECT 1'; }, m => { m.files = [{ ...file, archive: "objects/anything.enc" }]; },
  ]) { const value = manifest(); mutate(value); assert.throws(() => validateManifest(value)); }
});

test("database URLs have explicit TLS and restore destinations are literal loopback only", () => {
  assert.equal(connection("postgresql://qa:password@127.0.0.1/db").sslmode, "disable");
  assert.equal(connection("postgresql://qa:password@database.example/db").ssl.rejectUnauthorized, true);
  for (const url of ["https://qa:p@127.0.0.1/db", "postgresql://qa:p@host/db?sslmode=disable", "postgresql://qa:p@host/db?sslmode=require", "postgresql://qa:p@host/db?options=abc", "postgresql://qa:p@127.0.0.1/other%2Fdb", "postgresql://qa:p@127.0.0.1/db#x", "postgresql://qa:p@127.0.0.1/db?sslmode=disable&sslmode=disable"]) assert.throws(() => connection(url));
  for (const host of ["localhost", "prod.example", "127.0.0.1.evil.example"]) assert.throws(() => connection(`postgresql://qa:p@${host}/db`, { restore: true }));
});

test("PostgreSQL subprocess environment never inherits application secrets or connection overrides", () => {
  const previous = process.env.PGOPTIONS; process.env.PGOPTIONS = "untrusted";
  try { const env = childEnvironment(connection("postgresql://qa:synthetic@127.0.0.1/db")); assert.equal(env.PGPASSWORD, "synthetic"); assert.equal(env.PGOPTIONS, undefined); assert.equal(env.PGSERVICE, undefined); assert.equal(env.RESEND_API_KEY, undefined); assert.equal(env.DATABASE_URL, undefined); assert.equal(env.PGPASSFILE, "/dev/null"); }
  finally { if (previous === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = previous; }
});

test("symlinked directory ancestors are refused rather than canonicalized into the target", async t => {
  const root = await fixture(t); await mkdir(join(root, "real")); await symlink(join(root, "real"), join(root, "alias"), directoryLinkType);
  await assert.rejects(canonicalDirectory(join(root, "alias")), /UNSAFE_DIRECTORY/);
});

test("missing offline acknowledgement and unsafe restore names fail before network or filesystem writes", async () => {
  await assert.rejects(createBackup({ writesPaused: false, storageMode: "local" }), /OFFLINE_LOCAL_BACKUP_REQUIRED/);
  await assert.rejects(createBackup({ writesPaused: true, storageMode: "s3" }), /OFFLINE_LOCAL_BACKUP_REQUIRED/);
  await assert.rejects(restoreBackup({ trustedBackup: false }), /TRUSTED_BACKUP_REQUIRED/);
  for (const databaseName of ["maras", "postgres", "maras_qa", "maras_restore_x", 'maras_restore_foo";DROP DATABASE maras;--']) await assert.rejects(restoreBackup({ trustedBackup: true, databaseName }), /NEW_RECOVERY_DATABASE_REQUIRED/);
});
