/** Loopback-only SSR/live dashboard contract integration. */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
const local=JSON.parse(readFileSync(".data/qa-database.json","utf8")),url=new URL(local.url),origin="http://127.0.0.1:3100";
if(url.hostname!=="127.0.0.1"||url.pathname!=="/maras_qa")throw new Error("Local QA database required");
Object.assign(process.env,JSON.parse(readFileSync(".data/qa-security.json","utf8")),{DATABASE_URL:local.url,DATABASE_SSL:"false",APP_URL:origin,NODE_ENV:"development"});
const fixture=JSON.parse(readFileSync(".data/qa-fixtures.json","utf8"));
const [{getDb,closeDb},s,auth]=await Promise.all([import("../db"),import("../db/schema"),import("../lib/auth")]);
const db=getDb(),now=new Date().toISOString(),prefix="qa-20260923-dashboard-"+randomUUID().slice(0,8),checks:string[]=[];
const pass=(name:string)=>{checks.push(name);console.log("PASS "+name);};
try{
 const[user]=await db.insert(s.users).values({email:prefix+"@example.test",fullName:"طالب تكامل لوحة مراس",phone:"+9665"+String(parseInt(prefix.slice(-8),16)%100000000).padStart(8,"0"),role:"student",status:"active",universitySlug:fixture.institution,specialty:"علوم الاختبار",academicLevel:"1",emailVerifiedAt:now,profileCompletedAt:now,onboardingCompletedAt:now}).returning();
 const session=await auth.createSession(user.id,new Request(origin+"/api/auth/login",{headers:{origin,"x-meras-device-id":"web-"+prefix,"user-agent":"Synthetic dashboard QA"}}));
 await db.insert(s.catalogCourses).values({slug:prefix,institutionSlug:fixture.institution,specialtySlug:"qa-science",title:"مادة اختبار توافق لوحة الطالب",status:"published",price:50});
 const[unit]=await db.insert(s.courseUnitsDb).values({courseSlug:prefix,title:"وحدة التقدم",status:"published"}).returning();
 const lessons=Array.from({length:200},(_,position)=>({id:prefix+"-"+position,courseSlug:prefix,unitId:unit.id,title:position===199?"متابعة حديثة":position===0?"مشاهدة أقدم طويلة":"درس التقدم "+position,position,status:"published",durationSeconds:100}));
 await db.insert(s.lessonsDb).values(lessons);await db.insert(s.videoAssets).values(lessons.map(lesson=>({courseSlug:prefix,lessonId:lesson.id,objectKey:prefix+"/"+lesson.id+".mp4",contentType:"video/mp4",sizeBytes:16,status:"ready",processingStatus:"ready",hlsMasterObjectKey:prefix+"/"+lesson.id+"/master.m3u8"})));
 await db.insert(s.lessonProgress).values(lessons.map((lesson,index)=>({userId:user.id,userEmail:user.email,courseSlug:prefix,lessonId:lesson.id,watchedSeconds:index===0?999:index===199?2:100,completed:index<199,updatedAt:index===199?"2026-09-22T12:00:00Z":"2026-09-20T12:00:00Z"})));
 await db.insert(s.courseAccess).values([{userId:user.id,userEmail:user.email,courseSlug:prefix,source:"admin",startsAt:"2026-01-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z"},{userId:user.id,userEmail:user.email,courseSlug:fixture.courses[0],source:"admin",startsAt:"2025-01-01T00:00:00Z",expiresAt:"2025-02-01T00:00:00Z"}]);
 const orderNumber=prefix+"-order";await db.insert(s.orders).values({userId:user.id,orderNumber,customerEmail:user.email,customerName:user.fullName,courseSlug:prefix,subtotal:50,total:50,status:"paid"});
 await db.insert(s.refundRequests).values([{requestNumber:prefix+"-refund-1",orderNumber,requestedByEmail:user.email,amountMinor:5000,reason:"Synthetic previous request",status:"rejected",createdAt:"2026-09-20T10:00:00Z"},{requestNumber:prefix+"-refund-2",orderNumber,requestedByEmail:user.email,amountMinor:5000,reason:"Synthetic latest request",status:"pending",createdAt:"2026-09-22T10:00:00Z"}]);
 const[request]=await db.insert(s.courseRequests).values({userId:user.id,university:"جامعة الاختبار",universitySlug:fixture.institution,specialty:"علوم الاختبار",courseName:"طلب اصطناعي",name:user.fullName,phone:user.phone!,status:"available",preparedCourseSlug:prefix}).returning();
 const headers={cookie:"meras_session="+session.token,origin};let payload;
 for(let round=0;round<8;round++){const response=await fetch(origin+"/api/mobile/dashboard",{headers});assert.equal(response.status,200);payload=await response.json();if(payload.owned.some((row:{slug:string})=>row.slug===prefix))break;await new Promise(resolve=>setTimeout(resolve,3000));}
 const course=payload.owned.find((row:{slug:string})=>row.slug===prefix);assert.ok(course);assert.equal(course.progress,99);assert.equal(course.current,"متابعة حديثة");assert.equal(course.currentLessonId,prefix+"-199");assert.match(course.remaining,/^حتى /);assert.equal(course.accessState,"active");assert.equal(course.units[0].lessons.length,200);
 pass("HTTP API retains full mobile course DTO and adds current and remaining with newest resume at 99 percent");
 const expired=payload.expired.find((row:{slug:string})=>row.slug===fixture.courses[0]);assert.equal(expired.accessState,"expired");assert.equal(typeof expired.current,"string");assert.equal(typeof expired.remaining,"string");
 assert.equal(payload.orders.find((row:{orderNumber:string})=>row.orderNumber===orderNumber).refundStatus,"pending");assert.equal(payload.requests.find((row:{id:number})=>row.id===request.id).preparedCourseTitle,course.title);assert.ok(payload.recommended.length>0);assert.ok(payload.recommended.every((row:{match:string})=>["تخصصك","جامعتك","تخصص مشابه"].includes(row.match)));
 pass("refresh includes expired-course labels, latest refund status, prepared-course title and every recommendation match");
 const ssr=await fetch(origin+"/dashboard?view=courses",{headers,redirect:"manual"});assert.equal(ssr.status,200);const html=(await ssr.text()).replaceAll(String.fromCharCode(92),"");assert.ok(html.includes('"current":"متابعة حديثة"'));assert.ok(html.includes('"progress":99'));assert.ok(html.includes('"refundStatus":"pending"'));
 pass("server-rendered dashboard and HTTP refresh agree on resume, progress and refund status");
 await db.update(s.lessonProgress).set({completed:true,updatedAt:now}).where(eq(s.lessonProgress.lessonId,prefix+"-199"));const complete=await fetch(origin+"/api/mobile/dashboard",{headers}).then(response=>response.json());assert.equal(complete.owned.find((row:{slug:string})=>row.slug===prefix).progress,100);
 pass("100 percent appears only after the final available lesson is completed");
 mkdirSync("output/playwright",{recursive:true});writeFileSync("output/playwright/dashboard-learning-integration.json",JSON.stringify({passed:checks.length,checks,environment:"loopback PostgreSQL and SSR/API",syntheticCourse:prefix,video:"metadata only"},null,2));
}finally{await closeDb();}
