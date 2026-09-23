import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { protectStudyPdf } from "../scripts/study-pdf-protection.mjs";
import { syntheticPdf } from "./helpers/synthetic-pdf.mjs";
const executable = process.env.QA_QPDF_PATH || (process.platform === 'win32' ? 'qpdf' : '/usr/bin/qpdf');
let available = true; try { execFileSync(executable,['--version'],{stdio:'ignore',windowsHide:true}); } catch { available = false; }
test('PDF encryption fails closed and removes temporary unprotected data when qpdf is unavailable', async()=>{
 const directory=await mkdtemp(join(tmpdir(),'maras-protect-test-'));
 try {await assert.rejects(protectStudyPdf(syntheticPdf(1),directory,join(directory,'missing-qpdf')),{code:'PDF_PROTECTION_UNAVAILABLE'});assert.deepEqual(await readdir(directory),[]);} finally {await rm(directory,{recursive:true,force:true});}
});
test('real qpdf enforces AES-256 permissions while preserving all pages and accessibility', {skip:!available}, async()=>{
 const directory=await mkdtemp(join(tmpdir(),'maras-protect-real-'));
 try {
  const result=await protectStudyPdf(syntheticPdf(3),directory,executable); assert.deepEqual(await readdir(directory),[]);
  const path=join(directory,'verified.pdf');await writeFile(path,result);
  const report=execFileSync(executable,['--show-encryption',path],{encoding:'utf8',windowsHide:true});
  assert.match(report,/AESv3/);assert.match(report,/extract for any purpose: not allowed/);assert.match(report,/modify anything: not allowed/);assert.match(report,/extract for accessibility: allowed/);
  assert.equal(execFileSync(executable,['--show-npages',path],{encoding:'utf8',windowsHide:true}).trim(),'3');
 } finally {await rm(directory,{recursive:true,force:true});}
});
