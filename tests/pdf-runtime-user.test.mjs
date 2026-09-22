import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropPdfRootPrivileges } from "../scripts/pdf-runtime-user.mjs";

test("root PDF renderer drops supplementary groups then GID/UID without disabling the browser sandbox", async () => {
 const directory = await mkdtemp(join(tmpdir(), "maras-pdf-test-"));
 const events = [];
 // The root-only branch cannot chmod another user's test directory in non-root CI.
 // Model root ownership through the real file only when the runner is actually root.
 if ((await lstat(directory)).uid !== 0) {
  await assert.rejects(dropPdfRootPrivileges(directory, { platform: "linux", getuid: () => 0, cwd: () => directory, env: { HOME: directory, TMPDIR: directory } }));
  await rm(directory, { recursive: true }); return;
 }
 let uid = 0, gid = 0;
 const runtime = { platform: "linux", getuid: () => uid, getgid: () => gid, getgroups: () => [], cwd: () => directory, env: { HOME: directory, TMPDIR: directory }, setgroups: groups => events.push(["groups", groups]), setgid: value => { gid = value; events.push(["gid", value]); }, setuid: value => { uid = value; events.push(["uid", value]); } };
 try {
  await dropPdfRootPrivileges(directory, runtime);
  assert.deepEqual(events, [["groups", []], ["gid", 65534], ["uid", 65534]]);
  assert.equal((await lstat(directory)).uid, 65534);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
test("PDF identity isolation rejects a mismatched or broad working directory before privilege changes", async () => {
 const directory = await mkdtemp(join(tmpdir(), "not-pdf-"));
 try { await assert.rejects(dropPdfRootPrivileges(directory, { platform: "linux", getuid: () => 0, cwd: () => directory, env: { HOME: directory, TMPDIR: directory } }), /Unsafe PDF/); }
 finally { await rm(directory, { recursive: true, force: true }); }
 await dropPdfRootPrivileges("ignored", { platform: "linux", getuid: () => 1000 });
 await dropPdfRootPrivileges("ignored", { platform: "win32" });
});
