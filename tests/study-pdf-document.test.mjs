import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStudyPdfDocument, escapePdfHtml, pdfInputDigest, studyMarkdownHtml, MAX_PDF_INPUT_CHARS, STUDY_PDF_VERSION } from "../lib/study-pdf-document.mjs";
const fixture = (overrides = {}) => ({ title: "العلم والقياس · Science", sourceName: "مقرر.docx", content: "# القياس\nالكتلة ثابتة.\nMass is constant.\n$$\nF=ma\n$$", createdAt: "2026-09-20T00:00:00.000Z", branding: { siteUrl: "https://marasalelm.com", whatsapp: "966500000000", description: "تعلّم موثوق", links: [{ label: "YouTube", url: "https://youtube.com/@maras" }] }, ...overrides });
const assets = { logo: "data:image/png;base64,AAAA", mathCss: "" };
test("PDF template contains searchable bilingual text, true math, repeated branding and version", () => {
  const input = fixture(); const doc = buildStudyPdfDocument(input, assets);
  assert.match(doc.html, /Mass is constant/); assert.match(doc.html, /الكتلة ثابتة/); assert.match(doc.html, /class="katex/);
  assert.match(doc.header, /data:image\/png/); assert.match(doc.header, /marasalelm.com/); assert.match(doc.header, /966500000000/);
  assert.match(doc.footer, /pageNumber/); assert.match(doc.footer, /totalPages/); assert.ok(doc.html.includes(STUDY_PDF_VERSION));
  assert.match(doc.html, /href="https:\/\/youtube.com\/@maras"/); assert.doesNotMatch(doc.html, /<script|<iframe|onclick=/);
});
test("saved semantic output and branding both participate in immutable export identity", () => {
  const input = fixture(); assert.equal(pdfInputDigest(input), pdfInputDigest(structuredClone(input)));
  for (const changed of [fixture({ content: "Changed semantic result" }), fixture({ title: "Other" }), fixture({ sourceName: "Other.pdf" }), fixture({ createdAt: "2026-09-21" }), fixture({ branding: { ...input.branding, description: "هوية جديدة" } })]) assert.notEqual(pdfInputDigest(input), pdfInputDigest(changed));
});
test("source HTML/SVG/scripts are literal text and all source links remain non-executable references", () => {
  const html = studyMarkdownHtml('<img src="http://127.0.0.1/secret" onerror="alert(1)">\n<script>alert(1)</script>\n[Reference](https://example.com/paper)\n![image](file:///etc/passwd)\n`<svg onload=alert(1)>`');
  assert.doesNotMatch(html, /<img|<script|<svg|<[^>]+(?:href|src)=/);
  assert.match(html, /&lt;img/); assert.match(html, /https:\/\/example.com\/paper/); assert.match(html, /صورة مشار إليها وغير مضمّنة/);
  assert.equal(escapePdfHtml('"<>&\u0000'), "&quot;&lt;&gt;&amp;");
});
test("unsafe TeX primitives are rejected rather than activated or silently omitted", () => {
  for (const command of ["\\href{https://evil.test}{secret}", "\\url{file:///etc/passwd}", "\\includegraphics{x}", "\\htmlStyle{color:red}{x}", "\\def\\x{\\x}\\x", "\\input{secret}", "\\newcommand{\\x}{z}"])
    assert.throws(() => studyMarkdownHtml(`$${command}$`), { code: "PDF_MATH_INVALID" });
  assert.throws(() => studyMarkdownHtml("$\\unknownmacro{x}$"), { code: "PDF_MATH_INVALID" });
  assert.throws(() => studyMarkdownHtml("$" + "x".repeat(4001) + "$"), { code: "PDF_MATH_LIMIT" });
  assert.throws(() => studyMarkdownHtml(Array(501).fill("$x$").join(" ")), { code: "PDF_MATH_LIMIT" });
});
test("wide tables preserve each cell with its heading and malformed rows fail closed", () => {
  const header = Array.from({ length: 9 }, (_, i) => `H${i}`), row = header.map((_, i) => `CELL${i}`);
  const result = studyMarkdownHtml(`${header.join("|")}\n${header.map(() => "---").join("|")}\n${row.join("|")}`);
  assert.match(result, /جدول واسع/);
  for (const value of [...header, ...row]) assert.equal(result.split(value).length - 1, 1);
  assert.throws(() => studyMarkdownHtml("A|B\n---|---\n1|2|3"), { code: "PDF_TABLE_INVALID" });
  assert.match(studyMarkdownHtml("Quantity|Value\n---|---\nMass|5 kg"), /<thead>/);
});
test("incomplete code/math and input size overflow never produce a seemingly complete PDF", () => {
  for (const text of ["```ts\nhello", "$$\nx+1", "\\[\nx+1"]) assert.throws(() => studyMarkdownHtml(text), { code: "PDF_MARKUP_INCOMPLETE" });
  assert.throws(() => buildStudyPdfDocument(fixture({ content: "x".repeat(MAX_PDF_INPUT_CHARS + 1) }), assets), { code: "PDF_INPUT_INVALID" });
});
test("public PDF branding rejects private addresses, credentials, scripts, whitespace and malformed URLs", () => {
  for (const url of ["https://127.0.0.1/", "https://2130706433/", "file:///etc/passwd", "javascript:alert(1)", "https://user:secret@example.com", "https://example.com:4433", "https://localhost", "https://a.internal", "https://a.test", "https://example.com/a b", "broken"])
    assert.throws(() => buildStudyPdfDocument(fixture({ branding: { ...fixture().branding, siteUrl: url } }), assets), { code: "PDF_BRANDING_INVALID" });
  assert.throws(() => buildStudyPdfDocument(fixture({ branding: { ...fixture().branding, whatsapp: "+123" } }), assets), { code: "PDF_BRANDING_INVALID" });
  assert.throws(() => buildStudyPdfDocument(fixture(), { logo: "https://evil.test/x.png", mathCss: "" }), { code: "PDF_ASSET_INVALID" });
});
test("web and native share byte-identical bounded download policy", () => {
  assert.equal(readFileSync("lib/study-pdf-download.ts", "utf8"), readFileSync("mobile/src/lib/study-pdf-download.ts", "utf8"));
});

test("chemical equations preserve charges and subscripts without enabling trusted TeX", () => {
  const html = studyMarkdownHtml("$\\ce{SO4^2- + Ba^2+ -> BaSO4 v}$");
  assert.match(html, /class="katex/); assert.match(html, /SO/); assert.doesNotMatch(html, /katex-error/);
});
