import test from "node:test";
import assert from "node:assert/strict";
import {isolated} from "./helpers/business-fixtures.mjs";
import {buildInstructorContractDocument,validateInstructorContractPdf} from "../lib/instructor-contract-document.mjs";
const api=await isolated("../lib/api.ts");const policy=await isolated("../lib/instructor-policy.ts");
class InstructorError extends Error{}
const contracts=await isolated("../lib/instructor-contracts.ts",{...api,...policy,InstructorError});
const employment={startDate:"2026-10-01",endDate:"",workLocation:"Remote workplace",weeklyHours:20,nationality:"Saudi",paymentTermsAr:"مواعيد دفعات وشروط أجر التجربة واضحة",paymentTermsEn:"Clear payment schedule and probation remuneration",benefitsAr:"المزايا المتفق عليها",benefitsEn:"Agreed benefits"};
const input={title:"Test instructor agreement",termsAr:"تعليم أصيل وحقوق واضحة. ".repeat(10),termsEn:"Original teaching and clear terms. ".repeat(10),trialDays:30,trialTermsAr:"مراجعة تجربة محددة المدة والجودة",trialTermsEn:"Timed probation and quality assessment",compensationModel:"course",rateHalalas:50000,employment};
test("new drafts normalize compensation policy without altering signed source snapshots",()=>{
 const draft=contracts.instructorContractInput(input);const details=JSON.parse(draft.employmentJson);assert.equal(details.compensationStart,"start_date");assert.equal(details.compensationConditionsAr,"");assert.doesNotThrow(()=>contracts.validateEmploymentOffer(details,30));
});
test("after-trial offers require real probation and explicit bilingual approval conditions",()=>{
 const details={...employment,compensationStart:"after_trial_approval",compensationConditionsAr:"",compensationConditionsEn:""};
 assert.throws(()=>contracts.validateEmploymentOffer(details,30));
 const valid={...details,compensationConditionsAr:"تراجع الإدارة جودة درسين وتبلغ قرار الاعتماد كتابة قبل بدء السعر الجديد",compensationConditionsEn:"The manager reviews two lessons and confirms the start of the agreed rate in writing"};
 assert.throws(()=>contracts.validateEmploymentOffer(valid,0));assert.doesNotThrow(()=>contracts.validateEmploymentOffer(valid,30));
 assert.throws(()=>contracts.instructorContractInput({...input,employment:{...employment,compensationStart:"client-approved"}}));
});
test("exported agreement carries the same editable assessment conditions safely in both languages",()=>{
 const fixture={...input,id:1,version:1,status:"draft",contentHash:"",signedAt:"",instructor:{fullName:"Synthetic Instructor",email:"test@example.test",phone:"+966500000000",country:"SA",address:"Test address"},organization:{legal_name:"Test Maras",legal_address:"Test location",commercial_registration_number:"TEST",vat_number:"",employment_authorization_number:""},signature:null,employment:{...employment,compensationStart:"after_trial_approval",compensationConditionsAr:"اعتماد الإدارة كتابة بعد مراجعة درسين <script>",compensationConditionsEn:"Written approval following review of two lessons"}};
 const rendered=buildInstructorContractDocument(fixture,{logo:"data:image/png;base64,AAAA"});assert.match(rendered.html,/اعتماد الإدارة كتابة/);assert.match(rendered.html,/Written approval following review/);assert.match(rendered.html,/&lt;script&gt;/);assert.doesNotMatch(rendered.html,/<script>/);
 assert.throws(()=>validateInstructorContractPdf({...fixture,employment:{...fixture.employment,compensationConditionsAr:"x".repeat(3001)}}));
 const legacy=buildInstructorContractDocument({...fixture,employment},{logo:"data:image/png;base64,AAAA"});assert.doesNotMatch(legacy.html,/Assessment and compensation commencement/);
});
