import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { pureSource } from "./helpers/pure-source.mjs";
import { MAX_PDF_BYTES, StudyPdfError, validatePdfInput } from "../lib/study-pdf-document.mjs";
const input = { title: "Synthetic", content: "Retained text", sourceName: "test.txt", createdAt: "2026-09-20", branding: { siteUrl: "https://marasalelm.com", description: "Synthetic", whatsapp: "", links: [] } };
async function source(extra = {}) { return pureSource("lib/study-pdf-process.ts", { spawn, mkdtemp, rm, tmpdir, join, resolve, isAbsolute, MAX_PDF_BYTES, StudyPdfError, validatePdfInput, ...extra }); }
test("PDF renderer environment contains no inherited application or cloud credentials", async () => {
  const { pdfChildEnvironment } = await source(); const env = pdfChildEnvironment("/tmp/qa", false, "/usr/bin/chromium");
  assert.deepEqual(Object.keys(env).sort(), ["HOME", "LANG", "MARAS_PDF_CHROMIUM", "NODE_ENV", "PATH", "TMPDIR"].sort());
  assert.equal(env.HOME, "/tmp/qa"); assert.equal(env.NODE_ENV, "production"); assert.equal(env.MARAS_PDF_ISOLATED_QA, undefined);
});
test("sandbox bypass requires explicit isolated CI flags and exact non-production database", async () => {
  const { isolatedPdfQaAllowed } = await source();
  const good = { CI: "true", GITHUB_ACTIONS: "true", MARAS_LOOPBACK_QA: "true", STUDY_PDF_QA_NO_SANDBOX: "true", DATABASE_URL: "postgresql://test@127.0.0.1:55439/maras_qa" };
  assert.equal(isolatedPdfQaAllowed(good), true);
  for (const key of Object.keys(good)) assert.equal(isolatedPdfQaAllowed({ ...good, [key]: "" }), false);
  for (const env of [{ ...good, RAILWAY_PROJECT_ID: "production" }, { ...good, RAILWAY_ENVIRONMENT_ID: "staging" }, { ...good, DATABASE_URL: "postgresql://test@127.0.0.1/production" }, { ...good, DATABASE_URL: "postgresql://test@postgres.internal/maras_qa" }]) assert.equal(isolatedPdfQaAllowed(env), false);
});
test("cancelled renderer process group includes descendants and cleans its private work directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "maras-pdf-process-test-")); const script = join(root, "renderer.mjs");
  await writeFile(script, `import {spawn} from 'node:child_process'; const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:false,stdio:'ignore'}); process.stderr.write('PDF_BROWSER_PID:'+child.pid+'\\n'); setInterval(()=>{},1000);`);
  let childPid, work;
  let readyCallback;
  const ready = new Promise(resolveReady => { readyCallback = resolveReady; });
  const { renderStudyPdf } = await source({ resolve: () => script, spawn: (...args) => { work = args[2].cwd; const child = spawn(...args); child.stderr.on("data", data => { const match = /PDF_BROWSER_PID:(\d+)/.exec(data.toString()); if (match) { childPid = Number(match[1]); readyCallback(); } }); return child; } });
  const controller = new AbortController();
  try {
    const result = renderStudyPdf(input, controller.signal); const rejected = assert.rejects(result, { code: "PDF_CANCELLED" });
    await ready; controller.abort(); await rejected; await assert.rejects(stat(work), { code: "ENOENT" });
    if (process.platform === "linux") {
      await new Promise(resolve => setTimeout(resolve, 100));
      const status = await readFile(`/proc/${childPid}/stat`, "utf8").catch(() => "");
      assert.ok(!status || /\) Z /.test(status), "no live renderer descendant survives cancellation");
    }
  } finally { controller.abort(); await rm(root, { recursive: true, force: true }); }
});
