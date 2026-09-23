import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { posix, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { pureSource } from './helpers/pure-source.mjs';
const archive = await pureSource('lib/document-archive.ts', {deflateRawSync, inflateRawSync});
const document = await pureSource('lib/study-document.ts', {...archive, posix});
const plan = await pureSource('lib/study-processing-plan.ts', {...archive, ...document, posix, createHash});
const generation = await pureSource('lib/study-part-generation.ts', plan);
const pdf = await pureSource('lib/study-pdf-source.ts', {...plan, spawn, mkdtemp, writeFile, readFile, stat, rm, tmpdir, join});
const docx = body => archive.createDocumentArchive({'[Content_Types].xml': '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', 'word/document.xml': `<w:document><w:body>${body}</w:body></w:document>`});
const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const units = Array.from({length: 40}, (_, i) => ({id:`u:${i}`, label:`Unit ${i}`, text:(`Topic ${i} ` + 'scientific reference '.repeat(160)).trim()}));
const part = {mode:'units',contentType:'text/plain',units:[{id:'a', label:'First',text:'Dose -0.05 mg/kg. Ca²⁺ remains 2 ions.'},{id:'b',label:'Second',text:'Separate statement with no numeric claims.'}]};
function result(overrides = {}) { return JSON.stringify({units: part.units.map(unit => ({id:unit.id,status:'complete',text:unit.text,...overrides}))}); }

test('large source preserves all 40 ordered units beyond the legacy 60k threshold', () => {
 const source = units.map(u=>u.text).join('\n\n'); assert.ok(source.length>60000);
 const found = plan.studyTextUnits(Buffer.from(source),'text/plain');
 assert.equal(found.length,40); assert.deepEqual(found.map(u=>u.text), units.map(u=>u.text));
 const parts = plan.groupStudyUnits(found,'text/plain'); assert.equal(parts.length,40);
 plan.assertStudyCoverage(found.map(u=>u.id),parts);
 assert.equal(parts.flatMap(p=>p.units).at(-1).text,units.at(-1).text);
});
test('blank lines inside code and mathematics stay inside one atomic unit', () => {
 const input='A sufficiently detailed introduction.\n\n```js\nconst x = 1;\n\nreturn x;\n```\n\n$$\nE = mc^2\n\nF = ma\n$$';
 const found=plan.studyTextUnits(Buffer.from(input),'text/markdown'); assert.equal(found.length,3); assert.match(found[1].text,/1;\n\nreturn/); assert.match(found[2].text,/mc\^2\n\nF/);
});
test('unclosed scientific/code block and oversized indivisible unit stop before provider dispatch',()=>{
 assert.throws(()=>plan.studyTextUnits(Buffer.from('```\nmeaningful but unclosed content'),'text/markdown'),e=>e.code==='AI_DOCUMENT_REVIEW_REQUIRED');
 assert.throws(()=>plan.groupStudyUnits([{id:'a',label:'table',text:'x'.repeat(48001)}],'text/plain'),e=>e.code==='AI_DOCUMENT_REVIEW_REQUIRED');
});
test('bad UTF8, NUL, and source limits reject rather than truncate',()=>{
 for (const bytes of [Buffer.from([0xc0,0xaf]),Buffer.from('untrusted\0text with enough length'),Buffer.from('a'.repeat(plan.MAX_STUDY_TEXT+1))]) assert.throws(()=>plan.studyTextUnits(bytes,'text/plain'));
});
test('Word keeps document order and entire tables without invented page numbers',()=>{
 const bytes=docx(p('Introductory scientific explanation')+'<w:tbl><w:tr><w:tc>'+p('Head A')+'</w:tc><w:tc>'+p('Head B')+'</w:tc></w:tr><w:tr><w:tc>'+p('0.05 mg')+'</w:tc><w:tc>'+p('2 kg')+'</w:tc></w:tr></w:tbl>'+p('Final complete conclusion'));
 const found=plan.studyTextUnits(bytes,document.DOCX_MIME); assert.equal(found.length,3); assert.match(found[1].text,/0\.05 mg/); assert.match(found[1].text,/2 kg/); assert.ok(found.every(u=>!u.page)); assert.match(found[2].text,/Final/);
});
test('Word unsupported formulas, images, merged cells and scientific raised runs demand review',()=>{
 for (const tag of ['<m:oMath><m:t>x</m:t></m:oMath>','<w:drawing/>','<w:vertAlign w:val="superscript"/>','<w:gridSpan w:val="2"/>']) assert.throws(()=>plan.studyTextUnits(docx(p('A scientific introduction sufficiently long')+p('Before')+tag),document.DOCX_MIME),e=>e.code==='AI_DOCUMENT_REVIEW_REQUIRED');
});
test('PPT order follows presentation relationships, not ZIP or numerical filename order',()=>{
 const bytes=archive.createDocumentArchive({'[Content_Types].xml':'<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>','ppt/presentation.xml':'<p:presentation><p:sldId r:id="r2"/><p:sldId r:id="r1"/></p:presentation>','ppt/_rels/presentation.xml.rels':'<Relationships><Relationship Id="r1" Target="slides/slide1.xml" Type="x/slide"/><Relationship Id="r2" Target="slides/slide2.xml" Type="x/slide"/></Relationships>','ppt/slides/slide1.xml':'<p:sld><a:t>Second scientific slide</a:t></p:sld>','ppt/slides/slide2.xml':'<p:sld><a:t>First scientific slide</a:t></p:sld>'});
 const found=plan.studyTextUnits(bytes,document.PPTX_MIME); assert.match(found[0].text,/First/); assert.match(found[1].text,/Second/);
});
test('split replaces a parent with disjoint ordered children, never parent plus children',()=>{
 const children=plan.splitStudyPart({...part,mode:'whole'}); assert.ok(children.every(c=>c.mode==='units')); plan.assertStudyCoverage(['a','b'],children);
 assert.throws(()=>plan.assertStudyCoverage(['a','b'],[part,...children])); assert.throws(()=>plan.assertStudyCoverage(['a','b'],children.toReversed()));
 assert.throws(()=>plan.splitStudyPart({...part,units:[part.units[0]]}));
});
test('checkpoint hash checks the stored bytes before JSON interpretation',()=>{
 const json=JSON.stringify(part); assert.deepEqual(plan.checkedStudyJson(json,plan.studyHash(json)),part);
 assert.throws(()=>plan.checkedStudyJson(json+' ',plan.studyHash(json)),e=>e.code==='AI_CHECKPOINT_CORRUPT');
 assert.equal(plan.studyBytesHash(Buffer.from([0,1,255])),createHash('sha256').update(Buffer.from([0,1,255])).digest('hex'));
});
test('source and semantic settings invalidate incompatible checkpoint reuse',()=>{
 const a={cacheScope:'private:1',cacheVersion:'v1',objectKey:'private/a',storageProvider:'local',contentType:'text/plain',sizeBytes:30,originalName:'a.txt',scanSha256:'a'.repeat(64)};
 for(const [key,value] of Object.entries({cacheScope:'private:2',objectKey:'private/b',storageProvider:'s3',originalName:'renamed.txt',scanSha256:'b'.repeat(64)})) assert.notEqual(plan.studySourceFingerprint(a),plan.studySourceFingerprint({...a,[key]:value}));
 const config={model:'model-a',instructions:'fixed glossary',temperature:0.1,maxOutputTokens:8192};
 for(const [key,value] of Object.entries({model:'model-b',instructions:'different glossary',temperature:0.2,maxOutputTokens:1024})) assert.notEqual(plan.studyConfigHash(config),plan.studyConfigHash({...config,[key]:value}));
});
test('part validation requires exactly all source IDs in order and no speculative extra fields',()=>{
 assert.equal(generation.parseStudyUnitResult(result(),part,'translation').length,2);
 for(const value of [{units:[{id:'a',status:'complete',text:'incomplete'}]}, {units:JSON.parse(result()).units.toReversed()}, {units:JSON.parse(result()).units,secret:'leak'}, {units:JSON.parse(result()).units.map(u=>({...u,extra:true}))}]) assert.throws(()=>generation.parseStudyUnitResult(JSON.stringify(value),part,'summary'));
});
test('unreadable, empty, truncated and NUL-bearing unit outputs never commit',()=>{
 for(const text of [result({status:'needs_review'}), result({text:''}), result({text:'bad\0text'}),result().slice(0,-4)]) assert.throws(()=>generation.parseStudyUnitResult(text,part,'summary'));
});
test('scientific numeric alarm distinguishes decimal shifts, sign, unit denominator and micrograms',()=>{
 const text='The value is -0.05 mg/kg and 2 µg, not 20 mg.';
 for(const changed of [text.replace('-0.05','-0.5'),text.replace('-0.05','0.05'),text.replace('mg/kg','mg'),text.replace('µg','mg')]) assert.throws(()=>generation.assertTranslationNumbers(text,changed),e=>e.code==='AI_SCIENCE_REVIEW_REQUIRED');
 generation.assertTranslationNumbers('0.05 mg/kg','٠٫٠٥ mg/kg');
});
test('PDF metadata refuses ambiguous duplicates, encrypted/interactive or out-of-bounds documents',()=>{
 const good='Pages: 431\nEncrypted: no\nJavaScript: no\nForm: none\n'; assert.equal(pdf.parseStudyPdfInfo(good),431);
 for(const bad of [good+'Pages: 2\n',good+'Form: none\n',good.replace('Encrypted: no','Encrypted: yes'),good.replace('Form: none','Form: AcroForm'),good.replace('431','1001'),good.replace('431','0')]) assert.throws(()=>pdf.parseStudyPdfInfo(bad));
});
test('PDF parser subprocess environment contains no inherited provider, storage or database secrets',()=>{
 const env=pdf.pdfSourceEnvironment('/tmp/synthetic'); assert.deepEqual(Object.keys(env).sort(),['HOME','LANG','LC_ALL','NODE_ENV','PATH','TMPDIR']);
});

test('actual 431-page PDF packet preserves final original pages and context-only neighbours', { skip: process.platform === 'win32' ? 'PDF parser subprocess isolation requires Linux prlimit; exercised in Linux CI.' : false }, async()=>{
 const {syntheticPdf}=await import('./helpers/synthetic-pdf.mjs');
 const {execFileSync}=await import('node:child_process');
 const bytes=syntheticPdf(431);assert.equal(await pdf.studyPdfPageCount(bytes),431);
 const packet=await pdf.studyPdfPacket(bytes,{mode:'units',contentType:'application/pdf',sourcePages:431,units:[429,430,431].map(page=>({id:`page:${page}`,label:`PDF ${page}`,page}))});
 assert.deepEqual(packet.pages,[428,429,430,431]);assert.deepEqual(packet.corePages,[429,430,431]);assert.equal(await pdf.studyPdfPageCount(packet.bytes),4);
 const path=await mkdtemp(join(tmpdir(),'maras-synthetic-test-'));
 try {const file=join(path,'packet.pdf');await writeFile(file,packet.bytes);const text=execFileSync('pdftotext',[file,'-'],{encoding:'utf8',timeout:10000});for(const page of packet.pages) assert.match(text,new RegExp(`ORIGINAL PAGE ${page}`));assert.doesNotMatch(text,/ORIGINAL PAGE 427/);}
 finally {await rm(path,{recursive:true,force:true});}
 await assert.rejects(pdf.studyPdfPacket(bytes,{mode:'units',contentType:'application/pdf',sourcePages:430,units:[{id:'page:1',label:'PDF 1',page:1}]}),error=>error.code==='AI_SOURCE_CHANGED');
});

test('complete one-line display math never leaves a phantom open processing fence', () => {
 const input = 'Meaningful introduction to conservation of energy.\n\n$$E=mc^2$$\n\nA complete concluding explanation.';
 const found = plan.studyTextUnits(Buffer.from(input),'text/markdown');
 assert.equal(found.length,3); assert.equal(found[1].text,'$$E=mc^2$$');
});
