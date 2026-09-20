/** Actual loopback PostgreSQL plus synthetic files. Never calls a live identity/email provider. */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {randomBytes,randomUUID,generateKeyPairSync} from "node:crypto";
import {eq,inArray} from "drizzle-orm";
import {migrate} from "drizzle-orm/node-postgres/migrator";
const local=JSON.parse(readFileSync(".data/qa-database.json","utf8")) as {url:string},parsed=new URL(local.url);
if(parsed.hostname!=="127.0.0.1"||parsed.port!=="55439"||parsed.pathname!=="/maras_qa"||process.env.DATABASE_URL&&process.env.DATABASE_URL!==local.url)throw new Error("Exact local QA database required");
for(const name of ["RAILWAY_PROJECT_ID","RAILWAY_ENVIRONMENT_ID","S3_BUCKET","S3_ENDPOINT","RESEND_API_KEY","TAP_SECRET_KEY","GEMINI_API_KEY"])if(process.env[name])throw new Error("Live configuration prohibited");
const security=JSON.parse(readFileSync(".data/qa-security.json","utf8"));
Object.assign(process.env,security,{DATABASE_URL:local.url,DATABASE_SSL:"false",AUTO_SEED_CATALOG:"false",APP_URL:"http://127.0.0.1:3100",UPLOAD_DIR:process.cwd()+"/.data/qa-deletion-uploads",OAUTH_TOKEN_ENCRYPTION_KEY:randomBytes(32).toString("hex"),APPLE_TEAM_ID:"QA_TEAM",APPLE_KEY_ID:"QA_KEY",APPLE_CLIENT_ID:"qa.client",APPLE_PRIVATE_KEY:generateKeyPairSync("ec",{namedCurve:"P-256"}).privateKey.export({format:"pem",type:"pkcs8"}).toString()});
const [{getDb,closeDb},s,i,tokensSchema,auth,email,route,apple,storage,instructorSecurity]=await Promise.all([import("../db"),import("../db/schema"),import("../db/instructor-schema"),import("../db/oauth-privacy-schema"),import("../lib/auth"),import("../lib/email-verification"),import("../app/api/mobile/account/route"),import("../lib/apple-account-tokens"),import("../lib/storage"),import("../lib/instructor-security")]);
const db=getDb(),nonce=randomUUID(),now=new Date().toISOString(),ids:number[]=[],keys:string[]=[],checks:string[]=[];
const pass=(name:string)=>{checks.push(name);console.log("PASS DELETE",name);};
const savedFetch=globalThis.fetch;let appleAvailable=false,calls=0;
globalThis.fetch=async(input)=>{if(String(input)!=="https://appleid.apple.com/auth/revoke")throw new Error("External requests prohibited");calls++;return new Response("",{status:appleAvailable?200:503});};
const request=(token:string,method="GET",body?:object)=>new Request("http://127.0.0.1:3100/api/mobile/account",{method,headers:{authorization:`Bearer ${token}`,"x-meras-client":"mobile-v1","x-meras-platform":"ios","x-meras-device-id":"qa-deletion-"+nonce,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
async function createAccount(role:string){const [user]=await db.insert(s.users).values({email:`qa-deletion-${nonce}-${role}@example.test`,fullName:"حساب حذف اصطناعي",role,emailVerifiedAt:now}).returning();ids.push(user.id);const session=await auth.createSession(user.id,request(""));if(role==="instructor")await db.insert(i.instructorProfiles).values({userId:user.id,country:"SA",gender:"male",qualification:"bachelor",specialty:"اختبار",addressEncrypted:instructorSecurity.encryptInstructorData("عنوان خاص للاختبار",`address:${user.id}`),bankEncrypted:instructorSecurity.encryptInstructorData("{}",`bank:${user.id}`),status:"approved"});return {user,session};}
async function file(ownerId:number){const key=`private/qa-deletion/${nonce}/${ownerId}.txt`;keys.push(key);await storage.putObject(key,new Blob(["synthetic private content"]).stream(),"text/plain","local");const [conversation]=await db.insert(s.aiConversations).values({userId:ownerId,title:"محادثة خاصة اصطناعية"}).returning();const [file]=await db.insert(s.aiFiles).values({userId:ownerId,conversationId:conversation.id,objectKey:key,originalName:"qa.txt",contentType:"text/plain",sizeBytes:25,storageProvider:"local"}).returning();await db.insert(s.aiMessages).values({userId:ownerId,conversationId:conversation.id,fileId:file.id,role:"user",content:"رسالة خاصة للاختبار"});return key;}
try{
 await migrate(db,{migrationsFolder:"drizzle"});
 const alice=await createAccount("student"),bob=await createAccount("instructor"),aliceKey=await file(alice.user.id),bobKey=await file(bob.user.id);
 await db.insert(s.oauthIdentities).values({userId:alice.user.id,provider:"apple",subject:"qa-subject-"+nonce});
 await db.insert(tokensSchema.appleAccountTokens).values({userId:alice.user.id,clientId:"qa.client",ciphertext:apple.encryptAppleToken("synthetic-refresh-token",alice.user.id,"qa.client"),nextRetryAt:now,updatedAt:now});
 const code="123456";await db.insert(s.emailVerificationCodes).values({userId:alice.user.id,email:alice.user.email,purpose:"delete_account",codeHash:email.hashEmailCode({userId:alice.user.id,email:alice.user.email,purpose:"delete_account"},code),sentAt:now,expiresAt:new Date(Date.now()+600000).toISOString()});
 assert.equal((await (await route.GET(request(alice.session.token))).json()).method,"email_code");
 assert.equal((await route.DELETE(request(alice.session.token,"DELETE",{confirmation:"حذف حسابي",code:"000000"}))).status,400);
 assert.equal((await db.select().from(s.users).where(eq(s.users.id,alice.user.id)))[0].status,"active");pass("passwordless account requires dedicated deletion OTP; wrong code commits an attempt without deleting data");
 const results=await Promise.all([route.DELETE(request(alice.session.token,"DELETE",{confirmation:"حذف حسابي",code})),route.DELETE(request(alice.session.token,"DELETE",{confirmation:"حذف حسابي",code}))]);
 assert.equal(results.filter(result=>result.status===200).length,1);assert.ok(results.every(result=>[200,400,401].includes(result.status)));
 assert.equal((await db.select().from(s.users).where(eq(s.users.id,alice.user.id)))[0].status,"deleted");
 for(const table of [s.oauthIdentities,s.oauthExchanges,s.aiFiles,s.aiMessages,s.aiConversations,s.authDevices])assert.equal((await db.select().from(table).where(eq(table.userId,alice.user.id))).length,0);
 assert.equal(await storage.getObject(aliceKey,undefined,"local"),null);
 assert.equal((await db.select().from(s.users).where(eq(s.users.id,bob.user.id)))[0].status,"active");const bobObject=await storage.getObject(bobKey,undefined,"local");assert.ok(bobObject);await bobObject.body.cancel();pass("concurrent deletion commits once, removes only the owner's AI/files/devices/OAuth, and preserves the other account and file");
 const [pending]=await db.select().from(tokensSchema.appleAccountTokens).where(eq(tokensSchema.appleAccountTokens.userId,alice.user.id));assert.equal(pending.status,"pending");assert.equal(pending.attempts,1);assert.equal(calls,1);pass("Apple outage never blocks personal-data deletion and retains an encrypted retry record");
 appleAvailable=true;await db.update(tokensSchema.appleAccountTokens).set({nextRetryAt:new Date().toISOString()}).where(eq(tokensSchema.appleAccountTokens.userId,alice.user.id));await apple.processAppleRevocations({userId:alice.user.id});assert.equal((await db.select().from(tokensSchema.appleAccountTokens).where(eq(tokensSchema.appleAccountTokens.userId,alice.user.id))).length,0);pass("durable revocation retry calls fixed Apple endpoint and removes token after success");
 await db.insert(s.emailVerificationCodes).values({userId:bob.user.id,email:bob.user.email,purpose:"delete_account",codeHash:email.hashEmailCode({userId:bob.user.id,email:bob.user.email,purpose:"delete_account"},code),sentAt:now,expiresAt:new Date(Date.now()+600000).toISOString()});
 const response=await route.DELETE(request(bob.session.token,"DELETE",{confirmation:"حذف حسابي",code}));if(response.status!==200)throw new Error(await response.text());const [profile]=await db.select().from(i.instructorProfiles).where(eq(i.instructorProfiles.userId,bob.user.id));assert.equal(profile.status,"suspended");assert.equal(profile.bankEncrypted,null);assert.equal(profile.addressEncrypted,"");pass("instructor account deletion erases private profile fields and prevents account reactivation");
 writeFileSync(".data/qa-account-deletion-results.json",JSON.stringify({createdAt:new Date().toISOString(),checks},null,2));
}finally{
 globalThis.fetch=savedFetch;
 if(ids.length){await db.delete(tokensSchema.appleAccountTokens).where(inArray(tokensSchema.appleAccountTokens.userId,ids));await db.delete(s.aiMessages).where(inArray(s.aiMessages.userId,ids));await db.delete(s.aiFiles).where(inArray(s.aiFiles.userId,ids));await db.delete(s.aiConversations).where(inArray(s.aiConversations.userId,ids));await db.delete(i.instructorProfiles).where(inArray(i.instructorProfiles.userId,ids));await db.delete(s.users).where(inArray(s.users.id,ids));}
 for(const key of keys)await storage.deleteObject(key,"local").catch(()=>undefined);
 await closeDb();
}
