import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isolated } from "./helpers/business-fixtures.mjs";
const tableNames = ["cartItems", "courseAccess", "courseWaitlist", "learningTrackInterests", "learningTracks", "notificationsDb", "orders", "users"];
const tables = Object.fromEntries(tableNames.map(name => [name, new Proxy({ name }, { get: (target, key) => key === "name" ? target.name : { table: name, key } })]));
const eq = (column, value) => row => row[column.key] === value;
const inArray = (column, values) => row => values.includes(row[column.key]);
const and = (...rules) => row => rules.every(rule => rule(row));
const isNull = column => row => row[column.key] == null;
const lte = (column, value) => row => row[column.key] <= value;
const lt = (column, value) => row => row[column.key] < value;
const sql = () => () => true;
const asc = column => ({ column, direction: 1 });
const desc = column => ({ column, direction: -1 });
function fixture(waitlist, beforeClaim) {
  const rows = Object.fromEntries(tableNames.map(name => [name, name === "courseWaitlist" ? structuredClone(waitlist) : []]));
  const db = {
    select(fields) { return { from(table) {
      let predicate = () => true, limit = Infinity, sorts = [];
      const query = {
        where(value) { predicate = value; return query; }, innerJoin() { return query; },
        orderBy(...value) { sorts = value; return query; }, limit(value) { limit = value; return query; },
        then(resolve, reject) { return Promise.resolve().then(() => rows[table.name].filter(predicate).sort((a,b) => { for(const sort of sorts) { const diff=String(a[sort.column.key]||"").localeCompare(String(b[sort.column.key]||"")); if(diff)return diff*sort.direction; }return 0; }).slice(0,limit).map(row => fields ? Object.fromEntries(Object.entries(fields).map(([name,column])=>[name,row[column.key]])) : {...row})).then(resolve,reject); },
      }; return query;
    } }; },
    update(table) { return { set(values) { return { where(predicate) {
      function run() {
        if (table.name === "courseWaitlist" && beforeClaim) beforeClaim(rows.courseWaitlist);
        const selected=rows[table.name].filter(predicate);
        selected.forEach(row=>Object.assign(row,values));
        return selected.map(row=>({ ...row }));
      }
      return { returning: async () => run(), then: (resolve,reject) => Promise.resolve().then(run).then(resolve,reject) };
    } }; } }; },
    insert(table) { return { values(values) {
      const operation = { onConflictDoNothing() { return operation; }, returning: async () => {
        if(rows[table.name].some(row=>row.dedupeKey===values.dedupeKey))return [];
        const row={ id:rows[table.name].length+1, ...values }; rows[table.name].push(row); return [row];
      } }; return operation;
    } }; },
    transaction: callback => callback(db),
  };
  return { db, rows };
}
const row = (id, courseSlug = "ready", enrollmentVersion = 1) => ({ id, userEmail: "student" + id + "@example.test", courseSlug, status: "active", enrollmentVersion, createdAt: "2025-01-01T00:00:00Z" });
async function lifecycle(state) {
  return isolated("../lib/lifecycle-automation.ts", { ...tables, eq, inArray, and, isNull, lte, lt, sql, asc, desc, createHash, getDb:()=>state.db, getCoursesCatalog: async()=>[{ slug:"ready", title:"Ready course",availableForPurchase:true },{slug:"not-ready",title:"Later",availableForPurchase:false}], isInternalDestination:()=>true });
}
test("more than 2000 unavailable waits cannot starve an eligible course launch", async () => {
  const state=fixture([row(1), ...Array.from({length:2100},(_,i)=>({...row(i+2,"not-ready"),createdAt:"2026-01-01T00:00:00Z"}))]);
  const service=await lifecycle(state);
  const result=await service.runLifecycleAutomations(new Date("2026-09-01"));
  assert.equal(result.launchNotifications,1);
  assert.equal(state.rows.courseWaitlist[0].status,"notified");
  assert.equal(state.rows.notificationsDb[0].userEmail,"student1@example.test");
});
test("cancellation, payment conversion and a newer enrollment win over a stale launch snapshot", async () => {
  for(const change of [{status:"cancelled"},{status:"converted"},{enrollmentVersion:2}]) {
    const state=fixture([row(1)],rows=>Object.assign(rows[0],change));
    const service=await lifecycle(state);
    assert.equal((await service.runLifecycleAutomations()).launchNotifications,0);
    assert.equal(state.rows.notificationsDb.length,0);
    for(const [key,value] of Object.entries(change))assert.equal(state.rows.courseWaitlist[0][key],value);
  }
});
test("launch delivery is deduplicated per enrollment and supports explicit rejoining", async () => {
  const state=fixture([row(1)]);
  const service=await lifecycle(state);
  assert.equal((await service.runLifecycleAutomations()).launchNotifications,1);
  assert.equal((await service.runLifecycleAutomations()).launchNotifications,0);
  Object.assign(state.rows.courseWaitlist[0],{status:"active",enrollmentVersion:2});
  assert.equal((await service.runLifecycleAutomations()).launchNotifications,1);
  assert.equal(new Set(state.rows.notificationsDb.map(row=>row.dedupeKey)).size,2);
});
test("scheduler uses one connection and always releases/discards its session lock", async () => {
  for(const scenario of ["success","busy","work-fails","unlock-fails"]) {
    const calls=[];
    let ran=false;
    const connection={ query: async text=>{ calls.push(text); if(text.includes("unlock")&&scenario==="unlock-fails")throw Error("network"); return {rows:[{locked:scenario!=="busy"}]}; },release:discard=>calls.push({discard}) };
    const service=await isolated("../lib/lifecycle-scheduler.ts",{getPool:()=>({connect:async()=>connection}),logEvent:()=>{}});
    const run=()=>service.withLifecycleSchedulerLock(async()=>{ran=true;if(scenario==="work-fails")throw Error("work");return 42;});
    if(scenario==="work-fails")await assert.rejects(run,/work/);else assert.equal(await run(),scenario==="busy"?null:42);
    assert.equal(ran,scenario!=="busy");
    assert.equal(calls.filter(item=>typeof item==="string"&&item.includes("unlock")).length,scenario==="busy"?0:1);
    assert.deepEqual(calls.at(-1),{discard:scenario==="unlock-fails"});
  }
});
