import assert from "node:assert/strict";
import test from "node:test";
import { isolated, sql, eq, and, or, tables, database } from "./helpers/business-fixtures.mjs";
for(const name of ["catalogCourses","courseUnitsDb","lessonsDb","courseResources","instructorProfiles","instructorContracts","instructorAssignments","instructorUnits","instructorLessons","videoAssets"])tables[name]=new Proxy({_name:name},{get:(target,key)=>key==="_name"?target._name:{table:name,key}});
class InstructorError extends Error{constructor(message,status=400,code){super(message);this.status=status;this.code=code;}}
const policy=await isolated("../lib/instructor-policy.ts"), api=await isolated("../lib/api.ts");
async function fixture(overrides={}){
 const assignment={id:1,userId:9,contractId:2,courseSlug:"calculus",status:"in_progress",revision:1,structureImportedAt:null};
 const db=database({users:[{id:9,role:"instructor",status:"active",emailVerifiedAt:"2026-01-01"}],instructorProfiles:[{userId:9,status:"approved"}],instructorContracts:[{id:2,userId:9,status:"signed"}],instructorAssignments:[assignment],catalogCourses:[{slug:"calculus",title:"Calculus"}],courseUnitsDb:[{id:1,courseSlug:"calculus",title:"Limits",description:"Curriculum",position:0,status:"draft"}],lessonsDb:[{id:"limits",unitId:1,courseSlug:"calculus",title:"Limits",description:"Existing lesson",position:10,status:"draft",videoAssetId:null,freePreview:true}],...overrides});
 const service=await isolated("../lib/instructor-assignments.ts",{...tables,...api,...policy,InstructorError,sql,eq,and,or,asc:value=>value,inArray:(column,values)=>or(...values.map(value=>eq(column,value))),instructorRevision:value=>value,getDb:()=>db,enqueueStorageCleanupTx:async()=>[],collectVideoCleanup:()=>{}});
 const hydrate=()=>db.transaction(tx=>service.importAssignedCourseStructure(tx,db.rows.instructorAssignments[0]));
 return {db,assignment,hydrate,...service};
}
const readyAsset=(id,lessonId)=>({id,courseSlug:"instructor-1",lessonId:"draft-"+lessonId,status:"ready",processingStatus:"ready",hlsMasterObjectKey:"private/master.m3u8",durationSeconds:120});
test("existing course curriculum imports once without copying or exposing protected video assets",async()=>{
 const f=await fixture();await f.hydrate();await f.hydrate();
 assert.equal(f.db.rows.instructorUnits.length,1);assert.equal(f.db.rows.instructorLessons.length,1);
 assert.equal(f.db.rows.instructorUnits[0].sourceUnitId,1);assert.equal(f.db.rows.instructorLessons[0].sourceLessonId,"limits");
 assert.equal(f.db.rows.instructorLessons[0].videoAssetId,undefined);assert.ok(f.db.rows.instructorAssignments[0].structureImportedAt);
 const view=await f.instructorAssignmentDetail(f.db,f.assignment);assert.equal(view.units[0].lessons[0].existingVideo,false);
});
test("publish fills original lesson and appends new lessons without duplicating curriculum or changing preview access",async()=>{
 const f=await fixture();await f.hydrate();const lesson=f.db.rows.instructorLessons[0];lesson.videoAssetId=1;
 f.db.rows.videoAssets.push(readyAsset(1,lesson.id),readyAsset(2,2));
 f.db.rows.instructorLessons.push({id:2,unitId:1,title:"Practice",description:"Additional",position:20,sourceLessonId:null,videoAssetId:2});
 const row=f.db.rows.instructorAssignments[0];row.status="submitted";
 await f.db.transaction(tx=>f.publishInstructorAssignment(tx,row));
 assert.equal(f.db.rows.courseUnitsDb.length,1);assert.equal(f.db.rows.lessonsDb.length,2);
 assert.equal(f.db.rows.lessonsDb[0].id,"limits");assert.equal(f.db.rows.lessonsDb[0].videoAssetId,1);assert.equal(f.db.rows.lessonsDb[0].freePreview,true);
 assert.equal(f.db.rows.lessonsDb[1].position,11);assert.equal(f.db.rows.videoAssets[0].lessonId,"limits");
 const again=await f.db.transaction(tx=>f.publishInstructorAssignment(tx,row));assert.equal(again.reused,true);assert.equal(f.db.rows.lessonsDb.length,2);
});
test("new admin video is never overwritten by a concurrently prepared draft",async()=>{
 const f=await fixture();await f.hydrate();f.db.rows.instructorLessons[0].videoAssetId=1;f.db.rows.videoAssets.push(readyAsset(1,1));f.db.rows.lessonsDb[0].videoAssetId=88;
 f.db.rows.instructorAssignments[0].status="submitted";
 await assert.rejects(f.db.transaction(tx=>f.publishInstructorAssignment(tx,f.db.rows.instructorAssignments[0])),e=>e.status===409&&e.code==="INSTRUCTOR_SOURCE_CHANGED");assert.equal(f.db.rows.lessonsDb[0].videoAssetId,88);assert.equal(f.db.rows.courseUnitsDb.length,1);
});
test("already approved videos satisfy completion without exposing a draft upload or source file",async()=>{
 const f=await fixture();f.db.rows.lessonsDb[0].videoAssetId=88;await f.hydrate();
 const content=await f.assignmentReadyContent(f.db,f.assignment);assert.equal(content[0].lessons[0].asset,null);
 const detail=await f.instructorAssignmentDetail(f.db,f.assignment);assert.equal(detail.units[0].lessons[0].existingVideo,true);assert.equal(detail.units[0].lessons[0].video,null);
});
test("instructors cannot delete linked admin curriculum or bind lessons from another course",async()=>{
 const f=await fixture();await f.hydrate();
 for(const action of ["deleteUnit","deleteLesson"])await assert.rejects(f.db.transaction(tx=>f.editInstructorAssignment(tx,9,1,{action,id:1,expectedRevision:1})),e=>e.status===403);
 f.db.rows.lessonsDb[0].courseSlug="foreign";await assert.rejects(f.assignmentReadyContent(f.db,f.assignment),e=>e.status===409);
});

test("reviewed metadata and order edits publish for source lessons while existing video and access stay intact",async()=>{
 const f=await fixture();f.db.rows.lessonsDb[0].videoAssetId=88;await f.hydrate();
 Object.assign(f.db.rows.instructorUnits[0],{title:"Revised unit",position:4});Object.assign(f.db.rows.instructorLessons[0],{title:"Revised lesson",description:"Reviewed description",position:7});
 const row=f.db.rows.instructorAssignments[0];row.status="submitted";await f.db.transaction(tx=>f.publishInstructorAssignment(tx,row));
 assert.equal(f.db.rows.courseUnitsDb[0].position,4);assert.equal(f.db.rows.lessonsDb[0].title,"Revised lesson");assert.equal(f.db.rows.lessonsDb[0].description,"Reviewed description");assert.equal(f.db.rows.lessonsDb[0].position,7);assert.equal(f.db.rows.lessonsDb[0].videoAssetId,88);assert.equal(f.db.rows.lessonsDb[0].freePreview,true);
});
