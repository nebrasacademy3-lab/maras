import assert from "node:assert/strict";
import test from "node:test";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nativeSource } from "./helpers/native-source.mjs";
import { runtimeServices } from "../scripts/runtime-supervisor.mjs";
const files = await nativeSource("lib/gemini-control-files.ts", { constants, lstat: fs.lstat, open: fs.open, realpath: fs.realpath, dirname: path.dirname, isAbsolute: path.isAbsolute, normalize: path.normalize, parse: path.parse });
const posix = { skip: process.platform === "win32" ? "Requires POSIX private modes/O_NOFOLLOW/FIFO; the Ubuntu Quality gates job executes these real filesystem checks." : false };
const token = (value = "synthetic-token", milliseconds = 600000) => JSON.stringify({ accessToken: value, expiresAt: new Date(Date.now() + milliseconds).toISOString() });
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "maras-gemini-control-"));
  await fs.chmod(dir, 0o700);
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "token.json");
  await fs.writeFile(file, token(), { mode: 0o600 });
  return { dir, file };
}
const denied = promise => assert.rejects(promise, error => error.message === "GEMINI_CONTROL_TOKEN_UNAVAILABLE");

test("private short-lived token is read without requiring an environment credential", posix, async t => {
  const { file } = await fixture(t);
  assert.equal(await files.readGeminiControlToken(file), "synthetic-token");
});
test("atomic credential rotation takes effect on the next read without a restart or token cache", posix, async t => {
  const { dir, file } = await fixture(t);
  await files.readGeminiControlToken(file);
  const next = path.join(dir, "replacement.json");
  await fs.writeFile(next, token("synthetic-rotated-token"), { mode: 0o600 });
  await fs.rename(next, file);
  assert.equal(await files.readGeminiControlToken(file), "synthetic-rotated-token");
});
test("public or group-accessible token sources are rejected", posix, async t => {
  const { file } = await fixture(t);
  for (const mode of [0o644, 0o640, 0o604, 0o620, 0o601, 0o777]) {
    await fs.chmod(file, mode); await denied(files.readGeminiControlToken(file));
  }
});
test("symlinks, hard links and non-private parent directories do not become token sources", posix, async t => {
  const { file, dir } = await fixture(t);
  const linked = path.join(dir, "link.json");
  await fs.symlink(file, linked); await denied(files.readGeminiControlToken(linked));
  await fs.unlink(linked); await fs.link(file, linked);
  await denied(files.readGeminiControlToken(linked)); await denied(files.readGeminiControlToken(file));
  await fs.unlink(linked);
  await fs.chmod(dir, 0o777); await denied(files.readGeminiControlToken(file));
  await fs.chmod(dir, 0o700);
});
test("relative paths, parent traversal, URLs, missing files and directories fail with a redacted error", posix, async t => {
  const { file, dir } = await fixture(t);
  for (const unsafe of ["token.json", "https://example.test/token", file + "\0", path.join(dir, "missing"), dir, dir + "/../" + path.basename(dir) + "/token.json"]) await denied(files.readGeminiControlToken(unsafe));
});
test("a symlinked parent is rejected even when the leaf is a private regular file", posix, async t => {
  const { dir, file } = await fixture(t);
  const target = await fs.mkdtemp(path.join(tmpdir(), "maras-gemini-parent-"));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  await fs.symlink(dir, path.join(target, "indirect"));
  await denied(files.readGeminiControlToken(path.join(target, "indirect", path.basename(file))));
});
test("expired, near-expiry, unbounded and malformed tokens fail before any Google request", posix, async t => {
  const { file } = await fixture(t);
  for (const value of ["{", "null", "[]", JSON.stringify({ accessToken: "secret" }), token("synthetic", -1000), token("synthetic", 1000), token("synthetic", 71 * 60000), token("contains a space"), token("a\nheader:secret"), token("x".repeat(8193)), JSON.stringify({ accessToken: "x", expiresAt: "never" }), JSON.stringify({ ...JSON.parse(token()), command: "do-not-execute" })]) {
    await fs.writeFile(file, value); await denied(files.readGeminiControlToken(file));
  }
});
test("oversized, empty and invalid UTF-8 token files are bounded and rejected", posix, async t => {
  const { file } = await fixture(t);
  for (const value of ["", "a".repeat(16385), Buffer.from([0xff, 0xfe, 0x80])]) {
    await fs.writeFile(file, value); await denied(files.readGeminiControlToken(file));
  }
});
test("a FIFO cannot block the worker while opening a control file", { ...posix, timeout: 5000 }, async t => {
  const { file } = await fixture(t); await fs.unlink(file);
  const child = spawn("mkfifo", ["-m", "600", file], { stdio: "ignore" });
  assert.equal(await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); }), 0);
  await denied(files.readGeminiControlToken(file));
});
test("non-secret plans can be readable but never writable by other principals", posix, async t => {
  const { file } = await fixture(t);
  await fs.writeFile(file, '{"synthetic":"non-secret-plan"}'); await fs.chmod(file, 0o644);
  assert.equal(await files.readGeminiControlFile(file, false, 65536), '{"synthetic":"non-secret-plan"}');
  await fs.chmod(file, 0o664);
  await assert.rejects(files.readGeminiControlFile(file, false, 65536), /GEMINI_CONTROL_PLAN_UNAVAILABLE/);
});
test("renewal is disabled by default and only a fixed supervised worker command can be enabled", () => {
  assert.equal(runtimeServices({}).some(s => s.name === "gemini-project-refresh-worker"), false);
  const tokenPath = path.join(path.parse(tmpdir()).root, "run", "secrets", "gemini-token.json");
  const service = runtimeServices({ GEMINI_PROJECT_REFRESH_ENABLED: "true", GEMINI_CONTROL_PLANE_TOKEN_FILE: tokenPath }).find(s => s.name === "gemini-project-refresh-worker");
  assert.equal(service.command, process.execPath);
  assert.ok(service.args.includes("scripts/gemini-project-refresh-worker.ts"));
  assert.ok(service.args.includes("./scripts/ai-worker-runtime.mjs"));
  assert.ok(!JSON.stringify(service).includes(path.basename(tokenPath)));
  for (const env of [{ GEMINI_PROJECT_REFRESH_ENABLED: "yes" }, { GEMINI_PROJECT_REFRESH_ENABLED: "true" }, { GEMINI_PROJECT_REFRESH_ENABLED: "true", GEMINI_CONTROL_PLANE_TOKEN_FILE: "relative.json" }, { GEMINI_PROJECT_REFRESH_ENABLED: "true", GEMINI_CONTROL_PLANE_TOKEN_FILE: path.parse(tokenPath).root + "run" + path.sep + ".." + path.sep + "token" }]) assert.throws(() => runtimeServices(env));
});

// Execute the real CI entry point in a disposable directory. A refused loopback port
// remains the fallback even if a future regression accidentally removes preflight.
test("isolated CI refuses every Gemini credential family before files, migrations or provider work", async t => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "maras-ci-preflight-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const script = fileURLToPath(new URL("../scripts/qa-study-ci.mjs", import.meta.url));
  // Cold Node/module startup can exceed 10s on Windows while other builds run.
  // Keep every real credential-refusal assertion and a bounded per-child deadline.
  const childTimeoutMs = process.platform === "win32" ? 30000 : 10000;
  for (const name of ["GEMINI_FREE_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "GEMINI_CONTROL_PLANE_TOKEN_FILE", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_API_KEY", "RAILWAY_PROJECT_ID", "AWS_SECRET_ACCESS_KEY", "RESEND_API_KEY"]) {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, QA_DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/maras_qa", [name]: "synthetic-sentinel-never-log-this" };
    const child = spawn(process.execPath, [script], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const capture = chunk => { output += chunk.toString(); if (output.length > 16384) child.kill("SIGKILL"); };
    child.stdout.on("data", capture); child.stderr.on("data", capture);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, childTimeoutMs);
    try {
      const code = await new Promise((resolve, reject) => { child.on("exit", resolve); child.on("error", reject); });
      assert.equal(timedOut, false, `${name}: credential preflight exceeded ${childTimeoutMs}ms`);
      assert.equal(code, 1, name); assert.match(output, /Do not supply production credentials/);
      assert.equal(output.includes(env[name]), false); assert.deepEqual(await fs.readdir(dir), []);
    } finally { clearTimeout(timer); }
  }
});

test("calendar rollover is not accepted as an actual token expiry timestamp", posix, async t => {
  const { file } = await fixture(t);
  const RealDate = Date;
  class ControlledDate extends RealDate { static now() { return RealDate.parse("2026-03-03T00:00:00Z"); } }
  const strict = await nativeSource("lib/gemini-control-files.ts", { constants, lstat: fs.lstat, open: fs.open, realpath: fs.realpath, dirname: path.dirname, isAbsolute: path.isAbsolute, normalize: path.normalize, parse: path.parse, Date: ControlledDate });
  await fs.writeFile(file, JSON.stringify({ accessToken: "synthetic", expiresAt: "2026-02-31T00:30:00Z" }));
  await denied(strict.readGeminiControlToken(file));
  await fs.writeFile(file, JSON.stringify({ accessToken: "synthetic", expiresAt: "2026-03-02T24:30:00Z" }));
  await denied(strict.readGeminiControlToken(file));
  await fs.writeFile(file, JSON.stringify({ accessToken: "synthetic", expiresAt: "2026-03-03T00:30:00Z" }));
  assert.equal(await strict.readGeminiControlToken(file), "synthetic");
});
