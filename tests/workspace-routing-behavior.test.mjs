import assert from "node:assert/strict";
import test from "node:test";
import { isolated } from "./helpers/business-fixtures.mjs";
const web = await isolated("../lib/account-readiness.ts");
const native = await isolated("../mobile/src/lib/account-access.ts", {safeInternalPath: value => web.safeAccountReturnTo(value, "") || null});
const ready = { emailVerified:true,profileCompleted:true,onboardingCompleted:true };
test("password and MFA destinations route owner and delegated staff to administration on web and native",()=>{
 for(const role of ["admin","supervisor"]){
  const user={...ready,role};assert.equal(web.accountNext(user),"/admin");assert.equal(web.accountNext(user,true),"/admin");
  for(const target of ["/dashboard","/courses/a","/cart","/study-tools"]){assert.equal(web.postAuthenticationDestination(web.accountNext(user),target),"/admin");assert.equal(native.authDestination(user,"/home",target),"/admin");}
 }
});
test("verification gates remain first while post-verification staff and instructor destinations remain authoritative",()=>{
 assert.equal(web.accountNext({...ready,role:"admin",emailVerified:false}),"/verify-email");
 assert.match(native.authDestination({...ready,role:"supervisor",emailVerified:false},"/admin","/cart"),/^\/verify-email/);
 assert.equal(web.postAuthenticationDestination("/admin","/dashboard"),"/admin");
 assert.equal(web.postAuthenticationDestination("/instructor","/cart"),"/instructor");
 assert.equal(web.postAuthenticationDestination("/supervisor","/dashboard"),"/admin");
});
test("student return paths survive readiness while malicious and circular return paths are rejected",()=>{
 assert.equal(web.postAuthenticationDestination("/dashboard","/courses/calculus?lesson=1"),"/courses/calculus?lesson=1");
 assert.equal(web.postAuthenticationDestination("/verify-email","/cart"),"/verify-email?return_to=%2Fcart");
 for(const path of ["https://evil.test","//evil.test","/api/admin/staff","/%2f%2fevil.test","/verify-email","/login?return_to=x"])
  assert.equal(web.postAuthenticationDestination("/dashboard",path),"/dashboard");
});
