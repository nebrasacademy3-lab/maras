import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("student 360 API is admin-only and returns every operational domain", async () => {
  const route = await read("app/api/admin/students/[email]/route.ts");
  assert.match(route, /roleAllowed\(admin, \["admin"\]\)/);
  assert.match(route, /decodeURIComponent\(\(await params\)\.email\)/);
  for (const table of [
    "courseAccess",
    "lessonProgress",
    "orders",
    "invoices",
    "supportTickets",
    "courseRequests",
    "notificationsDb",
    "authSessions",
    "courseAccessEvents",
  ]) assert.match(route, new RegExp(`from\\(${table}\\)`));
  assert.match(route, /getCoursesCatalog\(true\)/);
  assert.match(route, /getInstitutionsCatalog\(true\)/);
  for (const domain of ["summary", "catalog", "subscriptions", "accessEvents", "progress", "orders", "requests", "support", "notifications", "sessions"]) {
    assert.match(route, new RegExp(`${domain}[,:]`));
  }
  assert.match(route, /"cache-control": "no-store"/);
});

test("student 360 page requires an administrator and keeps profiles out of search", async () => {
  const page = await read("app/admin/students/[email]/page.tsx");
  assert.match(page, /requireRole\(`\/admin\/students\/\$\{encodeURIComponent\(email\)\}`,[\s\S]*\["admin"\]\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /<Student360 email=\{email\}/);
});

test("student profile renders every 360 section and safely encodes its API request", async () => {
  const component = await read("components/student-360.tsx");
  assert.match(component, /\/api\/admin\/students\/\$\{encodeURIComponent\(email\)\}/);
  for (const id of ["profile", "subscriptions", "progress", "orders", "requests", "support", "notifications", "sessions"]) {
    assert.match(component, new RegExp(`id="${id}"`));
  }
  for (const title of ["بيانات الطالب", "الاشتراكات والوصول", "التقدم الدراسي", "الطلبات والفواتير", "طلبات المواد", "الدعم", "الإشعارات", "الجلسات والأجهزة"]) {
    assert.match(component, new RegExp(title));
  }
  assert.match(component, /data-tone=\{tone\(/);
  assert.match(component, /className=\{styles\.ltr\}/);
});

test("admin dashboard links students and the two administration centers", async () => {
  const [dashboard, premiumCss] = await Promise.all([
    read("components/admin-dashboard.tsx"),
    read("app/admin-premium.css"),
  ]);
  assert.match(dashboard, /href=\{`\/admin\/students\/\$\{encodeURIComponent\(row\.email\)\}`\}>ملف 360/);
  assert.match(dashboard, /href="\/admin\/finance"/);
  assert.match(dashboard, /href="\/admin\/operations"/);
  assert.match(dashboard, /المركز المالي/);
  assert.match(dashboard, /التشغيل والتحليلات/);
  assert.match(premiumCss, /\.student-profile-link/);
  assert.match(premiumCss, /\.admin-center-links/);
});
