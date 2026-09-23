import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pureSource } from "./helpers/pure-source.mjs";
import { studyTableCells, studyMarkdownLines } from "../lib/study-markup.mjs";
import { richStudyHtml } from "../lib/study-rich-text.mjs";
import { studyMarkdownHtml, buildStudyPdfDocument, pdfInputDigest } from "../lib/study-pdf-document.mjs";

test("table separators inside scientific expressions and code never split cells", () => {
  const row = '| الدالة | $P(A|B)$ و $|x|$ | `a|b` | escaped \\| text |';
  assert.deepEqual(studyTableCells(row), ["الدالة", "$P(A|B)$ و $|x|$", "`a|b`", "escaped | text"]);
  const markdown = '| اسم | قانون |\n| --- | --- |\n| احتمال شرطي | $P(A|B)$ |';
  for (const render of [richStudyHtml, studyMarkdownHtml]) {
    const html = render(markdown); assert.equal((html.match(/<td /g) || []).length, 2); assert.match(html, /katex/);
  }
});
test("multiline display formulas and aligned equations render consistently without touching code", () => {
  for (const expression of ['$$E = mc^2\n+ x$$', '\\[E=mc^2\n+x\\]', '\\begin{align}\nx&=1\\\\\ny&=2\n\\end{align}']) {
    for (const render of [richStudyHtml, studyMarkdownHtml]) assert.match(render(expression), /class="katex/);
  }
  const code = '```tex\n\\begin{align}\nx&=1\n\\end{align}\n```';
  assert.equal(studyMarkdownLines(code).join('\n'), code);
  assert.doesNotMatch(richStudyHtml(code), /class="katex/);
  assert.equal(readFileSync('lib/study-markup.mjs','utf8'), readFileSync('mobile/src/lib/study-markup.mjs','utf8'));
});
test("PDF owner identity is escaped, appears on every footer and changes the cached document identity", () => {
  const input = {title:'اختبار',sourceName:'lecture.pdf',content:'شرح مفهوم علمي كامل.',createdAt:'2026-09-23',recipient:'طالب <خاص>',branding:{siteUrl:'https://marasalelm.com',whatsapp:'966500000000',description:'تعلم مع مراس',links:[{label:'تطبيق iPhone',url:'https://apps.apple.com/app/example'}]}};
  const doc = buildStudyPdfDocument(input,{logo:'data:image/png;base64,AAAA',mathCss:''});
  assert.match(doc.footer,/طالب &lt;خاص&gt;/); assert.match(doc.html,/نسخة شخصية/); assert.match(doc.html,/apps.apple.com/); assert.match(doc.html,/class="features"/);
  assert.notEqual(pdfInputDigest(input),pdfInputDigest({...input,recipient:'طالب آخر'}));
});
test("conversation memory is bounded and preserves complete scientific messages", async () => {
  const {boundedConversationHistory} = await pureSource('lib/ai-generation.ts');
  const history = Array.from({length:8},(_,i)=>({role:i%2?'assistant':'user',content:String(i).repeat(3500)+' $$x=1$$'}));
  const actual = boundedConversationHistory(history);
  assert.ok(actual.reduce((sum,row)=>sum+row.content.length,0)<=12000); assert.deepEqual(actual,history.slice(-3));
  assert.deepEqual(boundedConversationHistory([{role:'assistant',content:'x'.repeat(20000)}]),[]);
});

test("artifact endpoint defaults to protected PDF and rejects the retired Word format before rendering", async () => {
  let renders=0;
  const pdfBytes=Buffer.from('%PDF-1.7 synthetic permissions /Encrypt');
  const api=await pureSource('app/api/ai/artifacts/[id]/download/route.ts',{
    studentWorkspaceRequirementResponse:()=>null,isNativeAppRequest:()=>false,
    checkRateLimit:async()=>true,getSessionUser:async()=>({id:1,role:'student',fullName:'طالب'}),
    jsonError:(error,status)=>Response.json({error},{status}),aiError:error=>Response.json({error:error.message},{status:500}),
    safeAttachmentDisposition:name=>'attachment; filename="'+encodeURIComponent(name)+'"',
    exportStudyPdf:async()=>{renders++;return {bytes:pdfBytes,sourceDigest:'source',id:'saved',version:'maras-study-pdf-v2',expiresAt:'2026-09-24'};},
    loadStudyPdfSource:async()=>({sourceDigest:'source',artifact:{kind:'summary'}}),StudyPdfError:class extends Error{},
  });
  const ctx={params:Promise.resolve({id:'1'})};
  const defaultResult=await api.GET(new Request('https://maras.example/api/ai/artifacts/1/download'),ctx);
  assert.equal(defaultResult.status,200);assert.equal(defaultResult.headers.get('content-type'),'application/pdf');
  assert.deepEqual(Buffer.from(await defaultResult.arrayBuffer()),pdfBytes);assert.equal(renders,1);
  const retired=await api.GET(new Request('https://maras.example/api/ai/artifacts/1/download?format=docx'),ctx);
  assert.equal(retired.status,400);assert.equal(renders,1);
});
