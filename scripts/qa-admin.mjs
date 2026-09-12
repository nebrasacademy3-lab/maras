import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
const fixture = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
if (new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/maras_qa") || fixture.origin !== "http://127.0.0.1:3100") throw new Error("Local synthetic QA environment required");
const db = new pg.Client({ connectionString: url }); await db.connect();
const admin = fixture.users.find(user => user.role === "admin"), student = fixture.users.find(user => user.role === "student-a");
const checks = []; const now = new Date().toISOString();
async function call(path, user = admin, body) {
  const response = await fetch(fixture.origin + path, { method: body ? "POST" : "GET", headers: { ...(user ? { authorization: `Bearer ${user.token}` } : {}), ...(body ? { origin: fixture.origin, "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON response ${response.status} for ${path}`); }
  return { status: response.status, data };
}
async function check(name, run) { await run(); checks.push({ name, status: "passed" }); console.log("PASS " + name); }
try {
  await db.query("INSERT INTO catalog_courses(slug,institution_slug,specialty_slug,title,description,price,status) VALUES ('qa-admin-roster','qa-university','qa-science','مادة اختبار الإدارة','بيانات اصطناعية للاختبار الإداري فقط',100,'draft') ON CONFLICT(slug) DO NOTHING");
  await db.query("INSERT INTO users(email,full_name,role,status) SELECT 'qa-admin-roster-'||n||'@example.test','مشارك الاختبار '||n,'student','active' FROM generate_series(1,55) n ON CONFLICT(email) DO NOTHING");
  await db.query("INSERT INTO course_waitlist(user_email,course_slug,status) SELECT 'qa-admin-roster-'||n||'@example.test','qa-admin-roster','active' FROM generate_series(1,55) n ON CONFLICT(user_email,course_slug) DO UPDATE SET status='active'");
  await db.query("INSERT INTO orders(order_number,customer_email,customer_name,course_slug,subtotal,total,status,paid_at) SELECT 'QA-ADMIN-ORDER-'||lpad(n::text,4,'0'),$1,'طالب اختبار الإدارة','qa-admin-roster',10,10,'paid',$2 FROM generate_series(1,525) n ON CONFLICT(order_number) DO NOTHING",[student.email, now]);
  for (const [suffix, starts, expires, suspended] of [["active", "2025-01-01T00:00:00Z", null, null], ["suspended", "2025-01-01T00:00:00Z", "2099-01-01T00:00:00Z", now], ["future", "2098-01-01T00:00:00Z", "2099-01-01T00:00:00Z", null], ["expired", "2025-01-01T00:00:00Z", "2025-03-01T00:00:00Z", null]]) {
    await db.query("INSERT INTO course_access(user_email,course_slug,source,starts_at,expires_at,suspended_at) VALUES($1,$2,'admin_complimentary',$3,$4,$5) ON CONFLICT(user_email,course_slug) DO UPDATE SET source='admin_complimentary',starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,suspended_at=EXCLUDED.suspended_at,revoked_at=NULL",[student.email,"qa-admin-"+suffix,starts,expires,suspended]);
  }
  const notice=(await db.query("INSERT INTO notifications(audience,title,body,presentation,push_enabled,push_status,dedupe_key,read_at) VALUES('public','إشعار اختبار الإدارة','فحص حالة القراءة المخصصة لكل طالب','inbox',false,'disabled','qa-admin-read-test',$1) ON CONFLICT(dedupe_key) DO UPDATE SET read_at=EXCLUDED.read_at RETURNING id",[now])).rows[0];
  await db.query("INSERT INTO notification_reads(notification_id,user_id,read_at) VALUES($1,$2,$3) ON CONFLICT(notification_id,user_id) DO UPDATE SET read_at=EXCLUDED.read_at",[notice.id,student.id,now]);
  await check("unauthenticated and student accounts cannot read administrative profiles",async()=>{ assert.equal((await call('/api/admin/students/'+encodeURIComponent(student.email),null)).status,403); assert.equal((await call('/api/admin/students/'+encodeURIComponent(student.email),student)).status,403); });
  let profile;
  await check("Student360 totals include more than 500 records and honor suspended/future/expired access",async()=>{
    const result=await call('/api/admin/students/'+encodeURIComponent(student.email)); assert.equal(result.status,200,JSON.stringify(result.data)); profile=result.data;
    const expected=(await db.query("SELECT count(*)::int AS total FROM orders WHERE customer_email=$1",[student.email])).rows[0].total;
    assert.equal(profile.pagination.orders.total,expected); assert.equal(profile.orders.length,50); assert.ok(expected>=525);
    const active=(await db.query("SELECT count(*)::int AS total FROM course_access WHERE user_email=$1 AND source<>'revenuecat' AND revoked_at IS NULL AND suspended_at IS NULL AND starts_at::timestamptz<=now() AND(expires_at IS NULL OR expires_at::timestamptz>now())",[student.email])).rows[0].total;
    assert.equal(profile.summary.activeSubscriptions,active);
    const row=profile.notifications.find(row=>row.id===notice.id); assert.equal(row.readAt,now); assert.equal(row.audience,'public');
  });
  await check("Student360 paginates orders with no duplicate rows between pages",async()=>{
    const next=await call('/api/admin/students/'+encodeURIComponent(student.email)+'?ordersPage=2'); assert.equal(next.status,200); assert.equal(next.data.orders.length,50);
    assert.ok(next.data.orders.every(row=>!profile.orders.some(first=>first.id===row.id)));
  });
  await check("console server search reaches records past the former 500-record limit",async()=>{
    const result=await call('/api/admin/console?view=orders&q=QA-ADMIN-ORDER-&page=11'); assert.equal(result.status,200); assert.equal(result.data.pagination.total,525); assert.equal(result.data.orders.length,25);
  });
  await check("course waitlist exposes every identity with filtering and stable pagination",async()=>{
    const first=await call('/api/admin/courses/qa-admin-roster?kind=waitlist'); const second=await call('/api/admin/courses/qa-admin-roster?kind=waitlist&page=2'); assert.equal(first.status,200); assert.equal(second.status,200); assert.equal(first.data.pagination.total,55); assert.equal(first.data.rows.length,50); assert.equal(second.data.rows.length,5); assert.ok(second.data.rows.every(row=>!first.data.rows.some(item=>item.id===row.id))); assert.ok(first.data.rows.every(row=>row.student?.fullName));
    const one=await call('/api/admin/courses/qa-admin-roster?kind=waitlist&q=qa-admin-roster-55%40'); assert.equal(one.status,200); assert.equal(one.data.pagination.total,1);
    assert.equal((await call('/api/admin/courses/qa-admin-roster?kind=waitlist',student)).status,403);
  });
  await check("sensitive live role changes require step-up and cannot mutate without it",async()=>{
    const result=await call('/api/admin/console',admin,{action:'updateUser',id:student.id,role:'admin',status:'active'}); assert.ok([428,503].includes(result.status),String(result.status));
    const row=(await db.query('SELECT role FROM users WHERE id=$1',[student.id])).rows[0]; assert.equal(row.role,'student');
  });
  writeFileSync('.data/qa-admin-report.json',JSON.stringify({ generatedAt:new Date().toISOString(),database:'local PostgreSQL synthetic',checks },null,2));
  console.log(`${checks.length} live administration checks passed`);
} finally { await db.end(); }
