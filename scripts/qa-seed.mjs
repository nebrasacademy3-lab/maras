import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes, pbkdf2Sync, createHash } from "node:crypto";
import pg from "pg";
const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
const parsed = new URL(url);
if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || !parsed.pathname.startsWith("/maras_qa")) throw new Error("Synthetic local database required");
const client = new pg.Client({ connectionString: url });
await client.connect();
const now = new Date().toISOString();
const fixtures = { origin: "http://127.0.0.1:3100", users: [], courses: ["qa-physics", "qa-math"], institution: "qa-university", bundle: "qa-science", readyVideoMetadataOnly: true };
try {
  await client.query("BEGIN");
  await client.query("INSERT INTO catalog_institutions (slug,name,name_en,region,type,status,featured) VALUES ('qa-university','جامعة الاختبار التجريبية','Synthetic QA University','الرياض','أهلية','published',true) ON CONFLICT (slug) DO NOTHING");
  await client.query("INSERT INTO catalog_specialties (slug,name,description,status) VALUES ('qa-science','علوم الاختبار','تخصص اصطناعي للتحقق المحلي فقط','published') ON CONFLICT (slug) DO NOTHING");
  await client.query("INSERT INTO institution_specialties (institution_slug,specialty_slug,status) VALUES ('qa-university','qa-science','published') ON CONFLICT (institution_slug,specialty_slug) DO NOTHING");
  for (const [index, slug] of fixtures.courses.entries()) {
    await client.query("INSERT INTO catalog_courses (slug,institution_slug,specialty_slug,title,title_en,description,price,status,featured) VALUES ($1,'qa-university','qa-science',$2,$3,$4,$5,'published',true) ON CONFLICT (slug) DO NOTHING", [slug, index ? "الرياضيات التجريبية" : "الفيزياء التجريبية", index ? "QA Mathematics" : "QA Physics", "محتوى اصطناعي لفحص عرض المقررات وخطة الدروس والاشتراك على البيئة المحلية. لا يمثل مادة معروضة للبيع في الإنتاج.", index ? 80 : 100]);
    let unit = (await client.query("SELECT id FROM course_units WHERE course_slug=$1 LIMIT 1", [slug])).rows[0];
    if (!unit) unit = (await client.query("INSERT INTO course_units (course_slug,title,status) VALUES ($1,'الوحدة التجريبية','published') RETURNING id", [slug])).rows[0];
    await client.query("INSERT INTO lessons (id,course_slug,unit_id,title,duration_seconds,free_preview,status) VALUES ($1,$2,$3,'درس اختبار اصطناعي',300,false,'published') ON CONFLICT (id) DO NOTHING", [slug+"-lesson",slug,unit.id]);
    if (!(await client.query("SELECT id FROM video_assets WHERE lesson_id=$1 LIMIT 1",[slug+"-lesson"])).rowCount) await client.query("INSERT INTO video_assets (course_slug,lesson_id,object_key,content_type,size_bytes,status) VALUES ($1,$2,$3,'video/mp4',1,'ready')",[slug,slug+"-lesson","qa-fixtures/"+slug+".mp4"]);
  }
  const bundled = (await client.query("INSERT INTO course_bundles (slug,title,description,discount_type,discount_value,status,featured) VALUES ('qa-science','باقة العلوم التجريبية','باقة اصطناعية لفحص العرض والأسعار فقط','fixed',30,'published',true) ON CONFLICT (slug) DO UPDATE SET description=EXCLUDED.description RETURNING id")).rows[0];
  for (const [position, course] of fixtures.courses.entries()) await client.query("INSERT INTO course_bundle_items (bundle_id,course_slug,position) VALUES ($1,$2,$3) ON CONFLICT (bundle_id,course_slug) DO NOTHING",[bundled.id,course,position]);
  for (const role of ["admin", "student-a", "student-b"]) {
    const email = "qa-"+role+"@example.test", password = randomBytes(20).toString("base64url")+"aA1!";
    const salt = randomBytes(16), iterations = 210000;
    const hash = "pbkdf2$"+iterations+"$"+salt.toString("base64url")+"$"+pbkdf2Sync(password,salt,iterations,32,"sha256").toString("base64url");
    const user = (await client.query("INSERT INTO users (email,full_name,password_hash,role,email_verified_at,phone_verified_at,university_slug,specialty,academic_level,profile_completed_at,onboarding_completed_at) VALUES ($1,$2,$3,$4,$5,$5,'qa-university','علوم الاختبار','1',$5,$5) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id", [email, role==="admin" ? "مدير الاختبار" : "طالب الاختبار "+role, hash, role==="admin" ? "admin" : "student", now])).rows[0];
    const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now()+86400000).toISOString(), deviceId = "web-qa-"+role;
    await client.query("INSERT INTO auth_devices (user_id,device_id,device_label,platform) VALUES ($1,$2,'متصفح الاختبار','web') ON CONFLICT (user_id,device_id) DO NOTHING",[user.id,deviceId]);
    await client.query("INSERT INTO auth_sessions (user_id,token_hash,device_id,device_label,platform,expires_at) VALUES ($1,$2,$3,'متصفح الاختبار','web',$4)",[user.id,createHash("sha256").update(token).digest("hex"),deviceId,expiresAt]);
    fixtures.users.push({role,id:user.id,email,password,token,deviceId});
  }
  await client.query("COMMIT");
  mkdirSync(".data",{recursive:true});
  writeFileSync(".data/qa-fixtures.json", JSON.stringify(fixtures));
  const admin = fixtures.users.find(user=>user.role==="admin");
  writeFileSync(".data/qa-browser-state.json", JSON.stringify({cookies:[{name:"meras_session",value:admin.token,domain:"127.0.0.1",path:"/",expires:Math.floor(Date.now()/1000)+86400,httpOnly:true,secure:false,sameSite:"Lax"}],origins:[]}));
  console.log("Synthetic fixtures ready: 3 users, 2 course records and 1 bundle. Secrets saved only under .data.");
} catch (error) { await client.query("ROLLBACK"); throw error; } finally { await client.end(); }
