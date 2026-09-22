import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const file = id => ({ id, originalName: `document-${id}.pdf`, contentType: "application/pdf" });
function harness(transport) {
  let revision = 1;
  const calls = [], exports = {};
  const mocks = {
    "@/src/lib/api": { getApiSessionRevision: () => revision, assertApiSession: value => { if(value !== revision) throw new Error("SESSION_CHANGED"); } },
    "@/src/lib/downloads": { downloadProtectedFile: async options => { calls.push(options); return transport(options, () => { revision++; }); } },
  };
  vm.runInNewContext(ts.transpileModule(read("src/lib/support-downloads.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } });
  return { ...exports, calls };
}
test("support attachment transport preserves MIME and delegates temporary secure saving", async () => {
  const h = harness(async () => ({ action: "saved", uri: "content://chosen" }));
  await h.downloadSupportFile(file(12));
  assert.equal(h.calls[0].path, "/api/support/files/12");
  assert.equal(h.calls[0].mimeType, "application/pdf");
  assert.equal(h.calls[0].saveToFiles, true);
});
test("support batch is sequential and deduplicates repeated attachments", async () => {
  let active=0, peak=0;
  const h=harness(async () => { active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {action:"saved",uri:null}; });
  const result=await h.downloadSupportFiles([file(1),file(2),file(1)]);
  assert.equal(peak,1);assert.equal(h.calls.length,2);assert.equal(result.saved,2);assert.equal(result.shared,0);
});
test("a cancelled system picker stops the support batch without claiming a save", async () => {
  const h=harness(async () => ({action:"cancelled",uri:null}));const result=await h.downloadSupportFiles([file(1),file(2)]);
  assert.equal(h.calls.length,1);assert.equal(result.saved,0);assert.equal(result.cancelled,true);
});
test("support batching cannot start the next download after account replacement", async () => {
  const h=harness(async (_options,change) => {change();return {action:"saved",uri:null};});
  await assert.rejects(()=>h.downloadSupportFiles([file(1),file(2)]),/SESSION_CHANGED/);assert.equal(h.calls.length,1);
});
test("support failure propagates and sharing is not counted as confirmed saving", async () => {
  const failing=harness(async()=>{throw new Error("HTTP 403");});await assert.rejects(()=>failing.downloadSupportFile(file(1)),/HTTP 403/);
  const sharing=harness(async()=>({action:"shared",uri:null}));const result=await sharing.downloadSupportFiles([file(1)]);assert.equal(result.saved,0);assert.equal(result.shared,1);
});
test("support UI has no legacy unbounded download or false saved-on-error message", () => {
  const source=read("src/components/SupportChat.tsx");
  assert.doesNotMatch(source,/FileSystem\.downloadAsync|meras-support\/|تم حفظ الملف داخل مساحة تطبيق مراس/);
  assert.match(source,/cachePolicy="none"/);assert.match(source,/downloadSupportFiles\(allFiles\)/);assert.match(source,/authenticatedRequestHeaders/);
});
