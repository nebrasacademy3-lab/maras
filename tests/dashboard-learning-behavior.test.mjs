import assert from "node:assert/strict";
import test from "node:test";
import {isolated} from "./helpers/business-fixtures.mjs";
const {dashboardCourseLearning:learning,dashboardRecommendationMatch:match}=await isolated("../lib/dashboard-learning.ts");
const now="2026-09-23T12:00:00.000Z",access={startsAt:"2026-01-01T00:00:00.000Z",expiresAt:null,suspendedAt:null};
const course={slug:"calculus",access:"90 يومًا",units:[{lessons:[{id:"old",title:"درس قديم",ready:true},{id:"recent",title:"آخر متابعة",ready:true},{id:"hidden",title:"قريبًا",ready:false}]}]};
test("resume uses latest available update instead of longest watched video and ignores hidden or foreign lessons",()=>{
 const rows=[{courseSlug:"calculus",lessonId:"old",watchedSeconds:900,completed:true,updatedAt:"2026-09-20T01:00:00Z"},{courseSlug:"calculus",lessonId:"recent",watchedSeconds:2,completed:false,updatedAt:"2026-09-22T01:00:00Z"},{courseSlug:"calculus",lessonId:"hidden",completed:true,updatedAt:now},{courseSlug:"foreign",lessonId:"old",completed:true,updatedAt:now}];
 const data=learning(course,rows,access,now);assert.equal(data.currentLessonId,"recent");assert.equal(data.current,"آخر متابعة");assert.equal(data.progress,50);assert.equal(data.remaining,"90 يومًا");
});
test("a rounded percentage never marks a 199 of 200 lesson course complete",()=>{
 const lessons=Array.from({length:200},(_,id)=>({id:String(id),title:"Lesson "+id,ready:true}));const big={...course,units:[{lessons}]};const progress=lessons.map(lesson=>({courseSlug:course.slug,lessonId:lesson.id,completed:lesson.id!=="199",updatedAt:now}));
 assert.equal(learning(big,progress,access,now).progress,99);progress[199].completed=true;assert.equal(learning(big,progress,access,now).progress,100);
 assert.equal(learning({...course,units:[]},progress,access,now).progress,0);
});
test("deduplicated progress and malformed timestamps cannot inflate completion or break resume",()=>{
 const row={courseSlug:course.slug,lessonId:"old",completed:true,updatedAt:now};assert.equal(learning(course,[row,row],access,now).progress,50);
 const bad=learning(course,[{...row,lessonId:"recent",updatedAt:"invalid"}],access,now);assert.equal(bad.currentLessonId,"old");assert.equal(bad.progress,50);
 const empty=learning({...course,units:[]},[],access,now);assert.equal(empty.currentLessonId,null);assert.equal(empty.current,"ستظهر الدروس المتاحة هنا");
});
test("SSR and refresh share access boundary, remaining label and recommendation match semantics",()=>{
 assert.equal(learning(course,[],{...access,expiresAt:now},now).accessState,"expired");assert.equal(learning(course,[],{...access,startsAt:"2026-09-24T00:00:00Z"},now).accessState,"scheduled");assert.equal(learning(course,[],{...access,suspendedAt:now},now).accessState,"suspended");assert.match(learning(course,[],{...access,expiresAt:now},now).remaining,/^حتى /);
 assert.equal(match({universitySlug:"u",audienceScope:"institution"},"u"),"جامعتك");assert.equal(match({universitySlug:"u",audienceScope:"specialty"},"u"),"تخصصك");assert.equal(match({universitySlug:"other"},"u"),"تخصص مشابه");
});
