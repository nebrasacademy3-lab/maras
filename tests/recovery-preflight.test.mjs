import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { separateKeyFile } from "../scripts/recovery/preflight.mjs";
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "maras-recovery-preflight-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "uploads")); await mkdir(join(root, "keys"));
  return root;
}
test("recovery key cannot be under backup/storage roots or exactly equal a destination", async t => {
  const root = await fixture(t);
  for (const path of ["uploads/key", "uploads/subdir/key", "new-bundle", "new-bundle/key"]) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await assert.rejects(separateKeyFile(join(root, path), [join(root, "uploads"), join(root, "new-bundle")]), /KEY_MUST_BE_OUTSIDE_BACKUP_AND_STORAGE/);
  }
  const allowed = join(root, "keys/key");
  assert.equal(await separateKeyFile(allowed, [join(root, "uploads"), join(root, "bundle")]), allowed);
});
test("a symlinked key parent cannot disguise a key inside the copied directory", async t => {
  const root = await fixture(t);
  await symlink(join(root, "uploads"), join(root, "alias"));
  await assert.rejects(separateKeyFile(join(root, "alias/key"), [join(root, "uploads")]), /UNSAFE_DIRECTORY/);
});
test("CLI refuses co-located key before opening network and never prints credential/path details", async t => {
  const root = await fixture(t), keyPath = join(root, "uploads/key");
  await writeFile(keyPath, randomBytes(32), { mode: 0o600 });
  const run = spawnSync(process.execPath, ["scripts/recovery.mjs", "backup"], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 5000,
    env: { PATH: process.env.PATH, RECOVERY_KEY_FILE: keyPath, RECOVERY_UPLOAD_DIR: join(root, "uploads"), RECOVERY_BUNDLE_DIR: join(root, "bundle"), BACKUP_DATABASE_URL: "postgresql://private-user:never-log-password@203.0.113.1/production" } });
  assert.equal(run.status, 1); assert.equal(run.stdout, "");
  assert.deepEqual(JSON.parse(run.stderr), { ok: false, code: "KEY_MUST_BE_OUTSIDE_BACKUP_AND_STORAGE" });
  assert.equal(run.stderr.includes(root), false); assert.equal(run.stderr.includes("never-log-password"), false);
});
