import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
const base=new URL(JSON.parse(readFileSync(".data/qa-database.json","utf8")).url);
if(base.hostname!=="127.0.0.1")throw new Error("Loopback QA database required");
const admin=new pg.Client({connectionString:base.toString()});await admin.connect();
const dbName="maras_qa_migration_"+Date.now();
await admin.query("CREATE DATABASE "+dbName+" WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'");await admin.end();
base.pathname="/"+dbName;const pool=new pg.Pool({connectionString:base.toString()});
const folder=".data/migration-qa-"+Date.now();mkdirSync(folder+"/meta",{recursive:true});
const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));
const old={...journal,entries:journal.entries.filter(e=>e.idx<29)};
for(const entry of old.entries)copyFileSync("drizzle/"+entry.tag+".sql",folder+"/"+entry.tag+".sql");
writeFileSync(folder+"/meta/_journal.json",JSON.stringify(old));
try {
await migrate(drizzle(pool),{migrationsFolder:folder});
const user=(await pool.query("INSERT INTO users(email,full_name,status) VALUES ('upgrade-only@example.test','Legacy migration fixture','suspended') RETURNING id")).rows[0];
await pool.query("INSERT INTO catalog_institutions(slug,name,name_en,region,type) VALUES ('qa-upgrade','Upgrade','Upgrade','QA','QA')");
await pool.query("INSERT INTO catalog_specialties(slug,name) VALUES ('qa-upgrade','Upgrade')");
await pool.query("INSERT INTO institution_specialties(institution_slug,specialty_slug) VALUES ('qa-upgrade','qa-upgrade')");
await pool.query("INSERT INTO catalog_courses(slug,institution_slug,specialty_slug,title,title_en,description,price) VALUES ('qa-upgrade','qa-upgrade','qa-upgrade','Upgrade','Upgrade','QA',1)");
for(const status of ['clean','quarantined']) {
 const values=[status,'2026-01-01T00:00:00.000Z',status+'/fixture.pdf'];
 await pool.query("INSERT INTO course_request_files(request_id,user_id,object_key,original_name,content_type,size_bytes,scan_status,scanned_at,scan_provider) VALUES (1,$4,$3,'fixture.pdf','application/pdf',16,$1,$2,'legacy-scanner')",[...values,user.id]);
 await pool.query("INSERT INTO support_reply_files(reply_id,ticket_id,object_key,original_name,content_type,size_bytes,scan_status,scanned_at,scan_provider) VALUES (1,1,$3,'fixture.pdf','application/pdf',16,$1,$2,'legacy-scanner')",values);
 await pool.query("INSERT INTO course_resources(course_slug,title,object_key,original_name,content_type,size_bytes,scan_status,scanned_at,scan_provider) VALUES ('qa-upgrade','Fixture',$3,'fixture.pdf','application/pdf',16,$1,$2,'legacy-scanner')",values);
 await pool.query("INSERT INTO ai_files(user_id,object_key,original_name,content_type,size_bytes,scan_status,scanned_at,status,scan_provider) VALUES ($4,$3,'fixture.pdf','application/pdf',16,$1,$2,CASE WHEN $1='clean' THEN 'ready' ELSE 'quarantined' END,'legacy-scanner')",[...values,user.id]);
}
await migrate(drizzle(pool),{migrationsFolder:'./drizzle'});
const verified=[];
for(const table of ['course_request_files','support_reply_files','course_resources','ai_files']) {
 const rows=(await pool.query('SELECT * FROM '+table+' ORDER BY id')).rows;
 assert.equal(rows[0].scan_status,'pending');assert.equal(rows[0].scanned_at,null);assert.equal(rows[0].scan_sha256,null);assert.equal(rows[0].scan_attempts,0);
 assert.equal(rows[1].scan_status,'quarantined');assert.equal(rows[1].scanned_at,'2026-01-01T00:00:00.000Z');
 if(table==='ai_files')assert.equal(rows[0].status,'pending_scan');
 verified.push(table);
}
const tables=Number((await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")).rows[0].count);
const evidence={testedAt:new Date().toISOString(),databaseEncoding:'UTF8',freshThrough0028:true,upgradeThrough0029:true,tables,legacyCleanRequeued:verified,quarantinePreserved:true,aiReadyChangedToPendingScan:true,production:false};
mkdirSync('verification',{recursive:true});writeFileSync('verification/migration-upgrade.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
} finally {await pool.end();}
