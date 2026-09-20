import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstructorContractDocument, validateInstructorContractPdf } from '../lib/instructor-contract-document.mjs';
import { pureSource } from './helpers/pure-source.mjs';
const { instructorWriteRequest } = await pureSource('lib/instructor-onboarding.ts', { sameOriginRequest: r=>r.headers.get('origin')==='https://maras.example', isNativeAppRequest:r=>r.headers.get('test-native')==='yes', InstructorError:class extends Error {constructor(message,status){super(message);this.status=status}} });
export const contractFixture = () => ({id:11,version:2,status:'signed',title:'عقد عمل شارح - نموذج اختبار',termsAr:'يحفظ هذا العقد حقوق العامل والمنشأة.\nيقدم الشارح المحتوى الأصلي وفق التكليفات.',termsEn:'This agreement protects the employee and employer.\nThe instructor provides original content under assigned work.',compensationModel:'hourly',rateHalalas:5000,trialDays:30,trialTermsAr:'يتم تقييم جودة الشرح خلال الفترة المحددة.',trialTermsEn:'Teaching quality is reviewed during the agreed period.',contentHash:'a'.repeat(64),signedAt:'2026-09-20T18:30:00.000Z',instructor:{fullName:'اسم اختبار اصطناعي',email:'qa@example.test',phone:'+966500000000',country:'SA',address:'عنوان اصطناعي للاختبار المحلي'},organization:{legal_name:'منشأة اختبار مراس',legal_address:'عنوان المنشأة التجريبي',commercial_registration_number:'TEST-CR',vat_number:'TEST-VAT',employment_authorization_number:'TEST-RECORD'},employment:{startDate:'2026-10-01',endDate:'',workLocation:'عن بعد',nationality:'السعودية',weeklyHours:20,paymentTermsAr:'الدفع شهرياً وفق الساعات المعتمدة.',paymentTermsEn:'Monthly payment for approved teaching hours.',benefitsAr:'الحقوق النظامية المقررة.',benefitsEn:'Applicable statutory employee entitlements.'},signature:[Array.from({length:20},(_,i)=>({x:.1+i/30,y:.5+Math.sin(i)*.15}))]});
const assets={logo:'data:image/png;base64,AAAA'};
test('contract PDF preserves both languages, snapshot records and numeric signature evidence',()=>{
 const fixture=contractFixture(),document=buildInstructorContractDocument(fixture,assets);
 for(const text of [fixture.termsAr.split('\n')[0],fixture.termsEn.split('\n')[0],fixture.contentHash,fixture.instructor.fullName])assert.ok(document.html.includes(text));
 assert.match(document.html,/<polyline points="[0-9., ]+"/);assert.match(document.footer,/TEST-CR/);assert.match(document.footer,/TEST-VAT/);assert.match(document.footer,/TEST-RECORD/);assert.match(document.footer,/totalPages/);
});
test('contract text cannot execute HTML, load URLs or replace signature SVG',()=>{
 const f=contractFixture();f.termsAr='<img src="http://127.0.0.1/private" onerror="x">';f.instructor.fullName='<script>alert(1)</script>';
 const doc=buildInstructorContractDocument(f,assets);assert.match(doc.html,/&lt;img/);assert.doesNotMatch(doc.html,/<img|<script|<iframe/);
 for(const signature of ['<svg/>',[[{x:'0 onload=x',y:0}]],[[{x:Infinity,y:0}]],Array.from({length:41},()=>f.signature[0])])assert.throws(()=>validateInstructorContractPdf({...f,signature}),{code:'PDF_INPUT_INVALID'});
 assert.throws(()=>buildInstructorContractDocument(f,{logo:'https://example.test/image.png'}),{code:'PDF_ASSET_INVALID'});
});
test('signed PDFs require retained evidence and reject unbounded document values',()=>{
 for(const changed of [{signature:null},{signedAt:''},{contentHash:'tampered'},{termsEn:'x'.repeat(30001)},{trialDays:181},{employment:{...contractFixture().employment,weeklyHours:49}}])assert.throws(()=>validateInstructorContractPdf({...contractFixture(),...changed}),{code:'PDF_INPUT_INVALID'});
});
test('write origin validation throws only for invalid origins and allows authorized browser/native requests',()=>{
 assert.doesNotThrow(()=>instructorWriteRequest(new Request('https://maras.example/api/instructor/contracts/1',{headers:{origin:'https://maras.example'}})));
 assert.doesNotThrow(()=>instructorWriteRequest(new Request('https://maras.example/api/instructor/contracts/1',{headers:{'test-native':'yes'}})));
 assert.throws(()=>instructorWriteRequest(new Request('https://maras.example/api/instructor/contracts/1',{headers:{origin:'https://evil.example'}})),{status:403});
});
