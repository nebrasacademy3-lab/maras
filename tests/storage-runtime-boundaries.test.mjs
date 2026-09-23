import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pureSource } from "./helpers/pure-source.mjs";

const policy = await pureSource("lib/storage-policy.ts");
const remote = { S3_ENDPOINT: "https://storage.example.com", S3_BUCKET: "meras-test", S3_ACCESS_KEY_ID: "synthetic-key", S3_SECRET_ACCESS_KEY: "synthetic-secret" };
async function fixture(t, env = {}, transport = () => assert.fail("unexpected network request")) {
  const directory = await fs.mkdtemp(join(tmpdir(), "meras-storage-test-"));
  const root = join(directory, "uploads");
  await fs.mkdir(root);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const storage = await pureSource("lib/storage.ts", {
    createHash, createHmac, constants, createReadStream, createWriteStream,
    access: fs.access, lstat: fs.lstat, mkdir: fs.mkdir, mkdtemp: fs.mkdtemp, open: fs.open,
    readdir: fs.readdir, realpath: fs.realpath, rename: fs.rename, rm: fs.rm,
    tmpdir: () => directory, dirname, join, relative, resolve, Readable, Transform, pipeline,
    ...policy, fetch: transport,
    process: { env: { NODE_ENV: "production", UPLOAD_DIR: root, ...env }, cwd: () => directory, platform: process.platform },
  });
  return { storage, root, directory };
}
const body = value => new Response(value).body;
const listing = (keys, more = "false", token = "") => `<ListBucketResult><IsTruncated>${more}</IsTruncated>${keys.map(key => `<Contents><Key>${key}</Key></Contents>`).join("")}${token ? `<NextContinuationToken>${token}</NextContinuationToken>` : ""}</ListBucketResult>`;

test("a partial S3 configuration cannot silently select local storage", async t => {
  const { storage } = await fixture(t, { S3_ENDPOINT: remote.S3_ENDPOINT });
  assert.throws(() => storage.activeStorageProvider(), /incomplete/);
});

test("DigitalOcean cannot silently use its ephemeral disk for new uploads", async t => {
  const { storage } = await fixture(t, { HOSTING_PLATFORM: "digitalocean-app-platform" });
  assert.throws(() => storage.activeStorageProvider(), /Durable S3 storage is required/);
});

test("local reads, writes and prefix deletes reject symlink components", async t => {
  const { storage, root, directory } = await fixture(t);
  const outside = join(directory, "outside");
  await fs.mkdir(outside); await fs.writeFile(join(outside, "secret.txt"), "unchanged sentinel");
  await fs.symlink(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  // A Windows junction needs no Developer Mode/admin privilege and exercises
  // the same leaf isSymbolicLink guard; Ubuntu still uses an actual file symlink.
  await fs.symlink(process.platform === "win32" ? outside : join(outside, "secret.txt"), join(root, "linked.txt"), process.platform === "win32" ? "junction" : "file");
  await assert.rejects(storage.getObject("escape/secret.txt", undefined, "local"), /Unsafe/);
  await assert.rejects(storage.getObject("linked.txt", undefined, "local"), /Unsafe/);
  await assert.rejects(storage.putObject("escape/new.txt", body("attack"), "text/plain", "local"), /Unsafe/);
  await assert.rejects(storage.deleteObject("escape/secret.txt", "local"), /Unsafe/);
  await assert.rejects(storage.deletePrefix("escape", "local"), /Unsafe/);
  assert.equal(await fs.readFile(join(outside, "secret.txt"), "utf8"), "unchanged sentinel");
  await assert.rejects(fs.access(join(outside, "new.txt")), { code: "ENOENT" });
});

test("real upload bytes are limited and partial files do not replace an existing object", async t => {
  const { storage, root } = await fixture(t, { STORAGE_MAX_UPLOAD_BYTES: String(1024 * 1024) });
  await storage.putObject("object.txt", body("original"), "text/plain", "local");
  await assert.rejects(storage.putObject("object.txt", body(new Uint8Array(1024 * 1024 + 1)), "text/plain", "local"), /byte limit/);
  assert.equal(await fs.readFile(join(root, "object.txt"), "utf8"), "original");
  assert.deepEqual(await fs.readdir(root), ["object.txt"]);
  await assert.rejects(storage.putObject("tiny.txt", body("12345"), "text/plain", "local", { maxBytes: 4 }), /byte limit/);
});

test("materialization cannot delete or overwrite a pre-existing destination", async t => {
  const { storage, directory } = await fixture(t);
  await storage.putObject("object.txt", body("source"), "text/plain", "local");
  const destination = join(directory, "existing.txt");
  await fs.writeFile(destination, "keep me");
  await assert.rejects(storage.materializeObject("object.txt", destination, "local"), { code: "EEXIST" });
  assert.equal(await fs.readFile(destination, "utf8"), "keep me");
  assert.equal(await storage.materializeObject("object.txt", join(directory, "copy.txt"), "local"), true);
  assert.equal(await fs.readFile(join(directory, "copy.txt"), "utf8"), "source");
});

test("invalid ranges and cancelled reads do not issue storage requests", async t => {
  const { storage } = await fixture(t, remote);
  for (const range of [{ offset: -1, length: 1 }, { offset: 0, length: 0 }, { offset: Number.MAX_SAFE_INTEGER, length: 2 }]) {
    assert.equal(await storage.getObject("private/test.txt", range, "s3"), null);
  }
  await assert.rejects(storage.getObject("private/test.txt", undefined, "s3", AbortSignal.abort()), { name: "AbortError" });
});

test("all prefix-list pages are validated before any delete; an out-of-prefix key fails closed", async t => {
  const methods = [];
  const { storage } = await fixture(t, remote, async (_url, init) => {
    methods.push(init.method);
    return new Response(listing(["private/owner-a/valid.txt", "private/owner-b/private.txt"]));
  });
  await assert.rejects(storage.deletePrefix("private/owner-a", "s3"), /escaped the requested prefix/);
  assert.deepEqual(methods, ["GET"]);
});

test("listing whitespace is preserved rather than changing the key being deleted", async t => {
  const deleted = [];
  const { storage } = await fixture(t, remote, async (url, init) => {
    if (init.method === "GET") return new Response(listing(["private/owner-a/a  b.txt"]));
    deleted.push(decodeURIComponent(new URL(url).pathname));
    return new Response(null, { status: 204 });
  });
  await storage.deletePrefix("private/owner-a/", "s3");
  assert.deepEqual(deleted, ["/meras-test/private/owner-a/a  b.txt"]);
});

test("oversized, incomplete or cyclic listings never lead to partial deletion", async t => {
  for (const xml of ["x".repeat(2 * 1024 * 1024 + 1), listing(["private/a/file"], "true"), "<ListBucketResult><Key>private/a/file</Key>"]) {
    const methods = [];
    const { storage } = await fixture(t, remote, async (_url, init) => { methods.push(init.method); return new Response(xml); });
    await assert.rejects(storage.deletePrefix("private/a", "s3"));
    assert.deepEqual(methods, ["GET"]);
  }
  const methods = [];
  const { storage } = await fixture(t, remote, async (_url, init) => { methods.push(init.method); return new Response(listing(["private/a/file"], "true", "same")); });
  await assert.rejects(storage.deletePrefix("private/a", "s3"), /continuation token/);
  assert.deepEqual(methods, ["GET", "GET"]);
});

test("provider errors discard and cancel the response body without exposing its details", async t => {
  let cancelled = false;
  const { storage } = await fixture(t, remote, async (_url, init) => {
    assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit");
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("SECRET_PROVIDER_DETAIL")); },
      cancel() { cancelled = true; },
    }), { status: 500 });
  });
  await assert.rejects(storage.getObject("private/a/file", undefined, "s3"), error => {
    assert.equal(error.message, "S3 GET failed (500)"); return true;
  });
  assert.equal(cancelled, true);
});

test("a full S3 response cannot masquerade as a bounded range read", async t => {
  const { storage } = await fixture(t, remote, async () => new Response("123456789", { headers: { "content-length": "9" } }));
  await assert.rejects(storage.getObject("private/a/file", { offset: 0, length: 4 }, "s3"), /response metadata/);
});

test("caller cancellation is combined with a deadline and readiness closes unused bodies", async t => {
  const caller = new AbortController(); let observedSignal; let cancelled = false;
  const { storage } = await fixture(t, remote, async (_url, init) => {
    observedSignal = init.signal;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  });
  assert.equal(await storage.checkStorageReadiness(caller.signal), true);
  assert.notEqual(observedSignal, caller.signal);
  assert.equal(cancelled, true);
  caller.abort(); assert.equal(observedSignal.aborted, true);
});

test("endpoint validation rejects normalized traversal and private IPv6 aliases", () => {
  for (const url of ["https://storage.example.com/a/../b", "https://storage.example.com/a/%2e%2e/b", "https://storage.example.com/a//b", "https://[::ffff:127.0.0.1]", "https://[::ffff:7f00:1]", "https://[fe80::1]", "https://0x7f000001"]) {
    assert.throws(() => policy.storageEndpointUrl(url));
  }
  assert.equal(policy.storageUploadLimitBytes(""), 512 * 1024 * 1024);
  assert.equal(policy.storageTransferTimeoutMs(""), 15 * 60_000);
});


test("private-object deletion rejects failed S3 requests but remains idempotent on 404", async t => {
 for (const status of [403, 500, 503]) {
  const { storage } = await fixture(t, remote, async (_url, init) => { assert.equal(init.method, "DELETE"); return new Response("PRIVATE_PROVIDER_DETAIL", { status }); });
  await assert.rejects(storage.deleteObject("instructors/9/documents/fixture.enc", "s3"), error => error.message === "S3 DELETE failed (" + status + ")");
 }
 const { storage } = await fixture(t, remote, async () => new Response(null, { status: 404 }));
 await storage.deleteObject("instructors/9/documents/fixture.enc", "s3");
});
