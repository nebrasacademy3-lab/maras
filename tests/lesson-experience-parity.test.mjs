import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pureSource } from "./helpers/pure-source.mjs";
import { richStudyHtml } from "../lib/study-rich-text.mjs";
const shared = await pureSource("lib/lesson-experience.ts");
const gesturesModule = await pureSource("lib/player-gestures.ts");
const read = path => readFile(new URL("../"+path,import.meta.url),"utf8");
test("web/native define the same five lesson tabs and exactly three personal-file tools",async()=>{
  assert.deepEqual(shared.LESSON_TABS.map(t=>t.label),["نظرة عامة","ملاحظاتي","ملفات المادة","اختبر نفسك","المعلم الذكي"]);
  assert.deepEqual(shared.STUDY_ACTIONS,["summary","translation","quiz"]);
  for(const name of ["lesson-experience.ts","player-gestures.ts","study-rich-text.mjs","study-rich-text.d.mts","ai-contracts.ts"]) assert.equal(await read("lib/"+name),await read("mobile/src/lib/"+name));
  const header=await read("mobile/src/components/AppHeader.tsx"),welcome=await read("mobile/app/(auth)/welcome.tsx");
  assert.doesNotMatch(header,/انضم لفريق|instructorCta/);assert.match(welcome,/!user && <AppButton title="انضم لفريق مراس كشارح"/);
  assert.ok(welcome.indexOf('title="إنشاء حساب طالب"')<welcome.indexOf('title="انضم لفريق مراس كشارح"'));
});
test("hold is a temporary boost, release/cancel restore selected rate, and double taps use physical sides",()=>{
  let rate=1.5,playing=true;const seeks=[],hints=[];
  const g=gesturesModule.createPlayerGestures({rate:()=>rate,playing:()=>playing,setRate:r=>rate=r,seek:n=>seeks.push(n),hint:s=>hints.push(s)});
  g.hold();assert.equal(rate,2);g.hold();g.release();assert.equal(rate,1.5);g.tap(99,100,1000);assert.equal(seeks.length,0);
  g.tap(99,100,1400);g.tap(99,100,1650);g.tap(1,100,1800);g.tap(1,100,2010);assert.deepEqual(seeks,[10,-10]);
  g.tap(90,100,2200);g.tap(1,100,2300);assert.equal(seeks.length,2);
  g.hold();g.cancel();assert.equal(rate,1.5);playing=false;g.hold();assert.equal(rate,1.5);assert.equal(hints.at(-1),"");
  assert.equal(shared.boundedSeek(8,10,10),10);assert.equal(shared.boundedSeek(2,-10,10),0);assert.equal(shared.boundedSeek(NaN,10,NaN),0);
});
test("quality choices are derived from server renditions with intact protected grant query",()=>{
  const url="/api/video/l/hls/master.m3u8?course=a&token=opaque";
  assert.deepEqual(shared.playbackQualitySources({hlsUrl:url,streamUrl:url,qualities:[{label:"360p"},{label:"720p"},{label:"../secret"}]}),{"تلقائي":url,"360p":"/api/video/l/hls/360p/index.m3u8?course=a&token=opaque","720p":"/api/video/l/hls/720p/index.m3u8?course=a&token=opaque"});
});
test("scientific text supports equations, chemistry, tables and escaped literal code without active HTML or URLs",()=>{
  const input="# قوانين الدرس\nالقوة $F=ma$ و $\\ce{H2O}$\n$$\n\\int_0^1 x^2 dx=\\frac13\n$$\n| المصطلح | الوحدة |\n| --- | --- |\n| القوة | نيوتن |\n<script>alert(1)</script>\n[رابط](javascript:alert(1))\n![صورة](https://private.invalid/x)\n```js\nalert('<img onerror=hack>')\n```";
  for(const mathml of [false,true]){const html=richStudyHtml(input,mathml);assert.match(html,/<math/);assert.match(html,/<table/);assert.match(html,/القوة/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script\b|<img\b|<iframe\b|href=|src=|onclick=/i);}
  assert.match(richStudyHtml('$\\href{https://private.invalid}{x}$'),/math-source/);
  assert.match(richStudyHtml('$\\invalid{important}$'),/important/);
  assert.match(richStudyHtml('x'.repeat(100001)),/حد العرض/);
});
class AiPlatformError extends Error {constructor(code,message,status=400){super(message);Object.assign(this,{code,status});}}
test("quiz translation projection preserves scientific text without exposing the answer or explanation",async()=>{
  const generation=await pureSource("lib/ai-generation.ts",{AiPlatformError,...shared});
  const questions=Array.from({length:5},(_,i)=>({question:`السؤال ${i}`,choices:["أ","ب","ج","د"],translatedQuestion:`Question ${i}`,translatedChoices:["A","B","C","D"],correctIndex:2,explanation:"المصدر يثبت الإجابة",translatedExplanation:"Source evidence",scientificTerms:[]}));
  const quiz=generation.parseQuiz(JSON.stringify({title:"Quiz",questions}),5);
  const publicQuestion=generation.publicQuizQuestion(quiz.questions[0]);assert.equal(publicQuestion.translatedQuestion,"Question 0");assert.equal(publicQuestion.translatedChoices.length,4);assert.ok(!("correctIndex" in publicQuestion));assert.ok(!("explanation" in publicQuestion));
  assert.throws(()=>generation.parseQuiz(JSON.stringify({questions:questions.map((q,i)=>i?q:{...q,translatedChoices:["A"]})}),5));
  const cache=await pureSource("lib/ai-file-actions.ts",{createHash,...shared});
  const input={scope:"user:1:file:2",version:"hash",name:"lesson.pdf",action:"quiz",options:{language:"ar",targetLanguage:"ar",questionCount:5,difficulty:"easy"},config:{model:"synthetic",instructions:"",maxOutputTokens:4096,temperature:0.1}};
  assert.notEqual(cache.fileActionCacheKey(input),cache.fileActionCacheKey({...input,options:{...input.options,difficulty:"hard"}}));
});
test("lesson tutor sends the current source every turn and cannot silently truncate oversized answers",async()=>{
  const requests=[];let result="## شرح\n$E=mc^2$";
  const generation=await pureSource("lib/ai-generation.ts",{AiPlatformError,...shared,studyDocumentText:()=>"محتوى الدرس فقط",generateGeminiContent:async input=>{requests.push(input);return {text:result};}});
  for(const question of ["اشرح","ثم ماذا؟"]) await generation.generateLessonTutor({config:{instructions:""},bytes:Buffer.from("synthetic"),contentType:"text/plain",originalName:"lesson.txt",history:[],question});
  assert.equal(requests.length,2);for(const request of requests){assert.match(JSON.stringify(request.contents),/محتوى الدرس فقط/);assert.match(request.systemInstruction,/المرجع الوحيد/);assert.match(request.systemInstruction,/لا تخترع رقم صفحة/);}
  result="x".repeat(20001);await assert.rejects(generation.generateLessonTutor({config:{instructions:""},bytes:Buffer.from("x"),contentType:"text/plain",originalName:"lesson.txt",history:[],question:"اشرح"}),e=>e.code==="AI_OUTPUT_INVALID");
});
