import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, chownSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildInstructorContractPagedDocument } from "../lib/instructor-contract-document.mjs";
import { contractFixture } from "./instructor-contract-document.test.mjs";
const python = process.env.CONTRACT_PDF_TEST_PYTHON || "/usr/bin/python3";
const worker = resolve("scripts/contract-pdf-worker.py");
function isolated(input, args = ["-I", worker]) {
  const directory = mkdtempSync(join(tmpdir(), "maras-pdf-worker-test-"));
  const root = process.getuid?.() === 0;
  if (root) chownSync(directory, 65534, 65534);
  try {
    return spawnSync(python, args, { input, cwd: directory, timeout: 40_000, maxBuffer: 21 * 1024 * 1024,
      ...(root ? { uid: 65534, gid: 65534 } : {}),
      env: { PATH: "/usr/bin:/bin", HOME: directory, TMPDIR: directory, LANG: "C.UTF-8" },
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test("paged contract document keeps immutable bilingual terms, signature, metadata and page counters", () => {
  const fixture = contractFixture();
  const html = buildInstructorContractPagedDocument(fixture, { logo: "data:image/png;base64,AAAA" });
  for (const text of [fixture.termsAr.split("\n")[0], fixture.termsEn.split("\n")[0], fixture.contentHash, "TEST-CR", "TEST-VAT", "TEST-RECORD"]) assert.ok(html.includes(text));
  assert.match(html, /position:running\(contractHeader\)/);
  assert.match(html, /content:counter\(pages\)/);
  assert.match(html, /<polyline points="[0-9., ]+"/);
});
test("actual paged worker produces a bilingual signed PDF without a browser or inherited secrets", () => {
  const fixture = contractFixture();
  const logo = "data:image/png;base64," + readFileSync("public/brand/logo-light-hq.png").toString("base64");
  const result = isolated(buildInstructorContractPagedDocument(fixture, { logo }));
  assert.equal(result.status, 0, result.stderr?.toString());
  assert.ok(result.stdout.length > 10000);
  assert.equal(result.stdout.subarray(0, 5).toString(), "%PDF-");
});
test("worker rejects network and local-file URL resources instead of silently returning a partial PDF", () => {
  for (const url of ["http://127.0.0.1/private", "file:///etc/passwd"]) {
    const result = isolated(`<!doctype html><html><body><img src="${url}"></body></html>`);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.length, 0);
    assert.match(result.stderr.toString(), /PDF_ASSET_INVALID/);
    assert.doesNotMatch(result.stderr.toString(), /passwd|127\.0\.0\.1/);
  }
});
test("OS isolation denies sockets, process execution and forks while allowing font-layout threads", () => {
  const code = `import runpy, socket, subprocess, os, threading\nmodule=runpy.run_path(${JSON.stringify(worker)})\nmodule['harden']()\nfor action in (lambda: socket.socket(), lambda: subprocess.run(['/bin/true']), os.fork):\n try:\n  action()\n except PermissionError:\n  continue\n raise AssertionError('forbidden syscall was allowed')\nthread=threading.Thread(target=lambda:None);thread.start();thread.join()\nprint('ISOLATION_OK')`;
  const result = isolated("", ["-I", "-c", code]);
  assert.equal(result.status, 0, result.stderr?.toString());
  assert.equal(result.stdout.toString().trim(), "ISOLATION_OK");
});
