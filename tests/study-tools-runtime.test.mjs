import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { posix } from "node:path";
import * as zlib from "node:zlib";
import ts from "typescript";

async function isolated(path, dependencies = {}) {
  const key = "__study_" + randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const source = (await readFile(new URL(path, import.meta.url), "utf8")).replace(/^import .+;\r?\n/gm, "");
    const output = ts.transpileModule(`const {${Object.keys(dependencies).join(",")}} = globalThis[${JSON.stringify(key)}];\n${source}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    return await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
  } finally { delete globalThis[key]; }
}
class AiPlatformError extends Error { constructor(code, message, status = 400) { super(message); Object.assign(this, { code, status }); } }
const archive = await isolated("../lib/document-archive.ts", { deflateRawSync: zlib.deflateRawSync, inflateRawSync: zlib.inflateRawSync });
const documents = await isolated("../lib/study-document.ts", { ...archive, posix });
const exportDocument = await isolated("../lib/study-export.ts", archive);
const generation = await isolated("../lib/ai-generation.ts", { AiPlatformError, ...documents });
const identifiers = await isolated("../lib/public-identifiers.ts", { asciiSlug: value => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") });
const cache = await isolated("../lib/ai-file-actions.ts", { createHash });
const docx = main => archive.createDocumentArchive({ "[Content_Types].xml": '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', "word/document.xml": `<w:document><w:body>${main}</w:body></w:document>` });
const slide = text => `<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`;
const pptx = (one, two) => archive.createDocumentArchive({
  "[Content_Types].xml": '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
  "ppt/presentation.xml": '<p:presentation><p:sldIdLst><p:sldId r:id="r2"/><p:sldId r:id="r1"/></p:sldIdLst></p:presentation>',
  "ppt/_rels/presentation.xml.rels": '<Relationships><Relationship Id="r1" Target="slides/slide1.xml" Type="x/slide"/><Relationship Id="r2" Target="slides/slide2.xml" Type="x/slide"/></Relationships>',
  "ppt/slides/slide1.xml": slide(one), "ppt/slides/slide2.xml": slide(two),
});

test("Office extraction preserves Arabic text, tables and visible content, not deleted revisions or field instructions", () => {
  const bytes = docx('<w:p><w:r><w:t>الطاقة محفوظة &amp; القوة تقاس بالنيوتن</w:t></w:r></w:p><w:del><w:r><w:t>deleted secret</w:t></w:r></w:del><w:p><w:instrText>untrusted instructions</w:instrText></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>كتلة</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>كيلوجرام</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
  const text = documents.studyDocumentText(bytes, documents.DOCX_MIME);
  assert.match(text, /الطاقة محفوظة & القوة/); assert.match(text, /كتلة/); assert.match(text, /كيلوجرام/);
  assert.doesNotMatch(text, /deleted secret|untrusted instructions/);
});
test("PowerPoint follows presentation relationships instead of alphabetical slide filenames", () => {
  const text = documents.studyDocumentText(pptx("Second displayed slide, scientific examples", "First displayed slide, important definitions"), documents.PPTX_MIME);
  assert.ok(text.indexOf("First displayed") < text.indexOf("Second displayed"));
  assert.match(text, /الشريحة 1/); assert.match(text, /الشريحة 2/);
});
test("image-only presentations and oversized text fail explicitly rather than silently fabricating or truncating", () => {
  assert.throws(() => documents.studyDocumentText(pptx("", ""), documents.PPTX_MIME), archive.DocumentFormatError);
  assert.throws(() => documents.studyDocumentText(Buffer.from("a".repeat(60001)), "text/plain"), archive.DocumentFormatError);
  assert.equal(documents.studyDocumentText(Buffer.from("%PDF-"), "application/pdf"), null);
});
test("ZIP safety rejects traversal, encryption, corrupt CRCs, decompression bombs and external XML entities", () => {
  assert.throws(() => archive.openDocumentArchive(archive.createDocumentArchive({ "../evil.xml": "text" })), archive.DocumentFormatError);
  const encrypted = archive.createDocumentArchive({ "a.xml": "safe text" });
  const central = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); encrypted.writeUInt16LE(0x801, central + 8);
  assert.throws(() => archive.openDocumentArchive(encrypted), archive.DocumentFormatError);
  const corrupted = archive.createDocumentArchive({ "a.xml": "safe text" });
  corrupted.writeUInt32LE(0, corrupted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 16);
  assert.throws(() => archive.openDocumentArchive(corrupted).text("a.xml"), archive.DocumentFormatError);
  const bomb = archive.createDocumentArchive({ "a.xml": "a".repeat(2 * 1024 * 1024) });
  assert.throws(() => archive.openDocumentArchive(bomb).text("a.xml"), archive.DocumentFormatError);
  const entity = archive.createDocumentArchive({ "a.xml": '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>' });
  assert.throws(() => archive.openDocumentArchive(entity).text("a.xml"), archive.DocumentFormatError);
});
test("generated DOCX is a readable archive with RTL paragraphs, title, tables, source attribution and branded footer", () => {
  const bytes = exportDocument.createStudyDocx({ title: "ملخص الفيزياء", sourceName: "المحاضرة & الأولى.pptx", createdAt: "2026-09-15", content: "# العناوين المهمة\nالطاقة محفوظة في النظام المعزول.\n| المصطلح | الوحدة |\n| --- | --- |\n| القوة | نيوتن |" });
  const zip = archive.openDocumentArchive(bytes), xml = zip.text("word/document.xml");
  assert.match(xml, /مراس العلم/); assert.match(xml, /المحاضرة &amp; الأولى/); assert.match(xml, /<w:bidi\/>/); assert.match(xml, /<w:tbl>/);
  assert.match(zip.text("word/footer1.xml"), /مراس العلم/);
  assert.ok(zip.names.every(name => !/vba|embeddings|external/i.test(name)));
  assert.match(documents.studyDocumentText(bytes, documents.DOCX_MIME), /الطاقة محفوظة/);
});
const questions = Array.from({ length: 5 }, (_, i) => ({ question: `Question ${i + 1}`, choices: ["Alpha", "Beta", "Gamma", "Delta"], correctIndex: 0, explanation: "The attached source explains this fact.", translatedExplanation: null, scientificTerms: [] }));
test("quiz validation requires the exact count, distinct questions and choices and an integer answer, with no truncation", () => {
  const parsed = generation.parseQuiz(JSON.stringify({ title: "Test", questions }), 5);
  assert.equal(parsed.questions.length, 5);
  for (const invalid of [questions.slice(0, 4), [...questions, questions[0]], questions.map((q, i) => i ? q : { ...q, correctIndex: null }), questions.map((q, i) => i ? q : { ...q, question: "x".repeat(1001) }), questions.map((q, i) => i ? q : { ...q, choices: ["a", "a", "b", "c"] }), questions.map((q, i) => i === 1 ? questions[0] : q)]) {
    assert.throws(() => generation.parseQuiz(JSON.stringify({ questions: invalid }), 5), error => error.code === "AI_QUIZ_INVALID");
  }
  assert.deepEqual(Object.keys(generation.publicQuizQuestion(parsed.questions[0])).sort(), ["choices", "id", "question", "type"]);
});
test("cache keys are source/version/user scoped, configuration-aware and ignore irrelevant summary options", () => {
  const input = { scope: "user:1:file:2", version: "sha", name: "lecture.pdf", action: "summary", options: { language: "ar", targetLanguage: "ar", questionCount: 5 }, config: { model: "gemini-test", instructions: "", maxOutputTokens: 4096, temperature: 0.1 } };
  const key = cache.fileActionCacheKey(input);
  assert.equal(key, cache.fileActionCacheKey({ ...input, options: { language: "en", targetLanguage: "en", questionCount: 20 } }));
  assert.notEqual(key, cache.fileActionCacheKey({ ...input, scope: "user:3:file:2" }));
  assert.notEqual(key, cache.fileActionCacheKey({ ...input, version: "changed" }));
  assert.notEqual(key, cache.fileActionCacheKey({ ...input, config: { ...input.config, instructions: "changed" } }));
  assert.equal(cache.fileActionCacheKey({ ...input, action: "translation" }), cache.fileActionCacheKey({ ...input, action: "translation", options: { ...input.options, targetLanguage: "العربية" } }));
});
test("automatic identifiers are bounded, retry-stable with a supplied nonce and distinct even with a very long title", () => {
  const first = identifiers.automaticIdentifier("title".repeat(100), "lesson", 100, "01234567890123456789012345678901");
  assert.ok(first.length <= 100); assert.match(first, /-01234567890123456789$/);
  assert.equal(first, identifiers.automaticIdentifier("title".repeat(100), "lesson", 100, "01234567890123456789012345678901"));
  assert.notEqual(first, identifiers.automaticIdentifier("title".repeat(100), "lesson", 100));
  assert.throws(() => identifiers.automaticIdentifier("x", "lesson", 80, "short"));
});
test("source reads cancel oversized streams and reject incomplete saved files", async () => {
  let cancelled = 0;
  const files = await isolated("../lib/ai-files.ts", { ...documents, AiPlatformError, getObject: async () => ({ size: 100, body: new ReadableStream({ cancel() { cancelled++; } }) }) });
  await assert.rejects(files.readAiFileBytes({ storageProvider: "local", objectKey: "fixture", sizeBytes: 20, contentType: "text/plain" }, 50), error => error.code === "AI_FILE_TOO_LARGE");
  assert.equal(cancelled, 1);
  const incomplete = await isolated("../lib/ai-files.ts", { ...documents, AiPlatformError, getObject: async () => ({ size: 25, body: new Response("short").body }) });
  await assert.rejects(incomplete.readAiFileBytes({ storageProvider: "local", objectKey: "fixture", sizeBytes: 25, contentType: "text/plain" }, 50), error => error.code === "AI_FILE_INCOMPLETE");
});
test("direct upload finalization retries the same object after 503, but never retries permission denials", async () => {
  const calls = [];
  const runtime = await isolated("../lib/video-upload-finalize.ts", { fetch: async (url, init) => { calls.push({ url, init }); return calls.length === 1 ? Response.json({ error: "temporary" }, { status: 503 }) : Response.json({ reused: true, asset: { durationSeconds: 10 } }); }, setTimeout: (fn) => setTimeout(fn, 1) });
  const payload = { objectKey: "existing/object.mp4", courseSlug: "course", lessonId: "lesson", sizeBytes: 100, contentType: "video/mp4", durationSeconds: 0 };
  assert.equal((await runtime.finalizeVideoUpload(payload, new AbortController().signal)).reused, true);
  assert.equal(calls.length, 2); assert.equal(calls[0].init.body, calls[1].init.body); assert.ok(calls.every(call => call.init.method === "POST"));
  let denied = 0;
  const restricted = await isolated("../lib/video-upload-finalize.ts", { fetch: async () => { denied++; return Response.json({ error: "denied" }, { status: 403 }); } });
  await assert.rejects(restricted.finalizeVideoUpload(payload, new AbortController().signal)); assert.equal(denied, 1);
});
