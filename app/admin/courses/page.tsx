import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getCoursesCatalog } from "@/lib/catalog-store";
export const metadata: Metadata = { title: "مشتركو المواد وقوائم الانتظار | مراس العلم", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function CourseRosters({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireRole("/admin/courses", ["admin", "supervisor"]);
  const params = await searchParams;
  const q = (params.q || "").trim().slice(0, 120).toLocaleLowerCase("ar");
  const courses = (await getCoursesCatalog(true)).filter(course => `${course.title} ${course.university} ${course.specialty}`.toLocaleLowerCase("ar").includes(q));
  const requested = Number(params.page);
  const page = Math.max(1, Math.min(Math.ceil(courses.length / 40) || 1, Number.isSafeInteger(requested) ? requested : 1));
  return <main><h1>مشتركو المواد وقوائم الانتظار</h1><p>اختر المادة لفتح سجلها واشتراكاتها. لا تحتاج إلى البحث بين مراكز منفصلة.</p><form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBlock: 20 }}><label>ابحث بالمادة أو الجامعة<input name="q" defaultValue={params.q || ""} maxLength={120} className="input" /></label><button className="button button-primary" type="submit">بحث</button></form><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>{courses.slice((page - 1) * 40, page * 40).map(course => <article className="card" key={course.slug} style={{ padding: 20 }}><h2 style={{ fontSize: 20 }}>{course.title}</h2><p>{course.university} · {course.specialty}</p><Link className="button button-outline" href={`/admin/courses/${encodeURIComponent(course.slug)}`}>فتح ملف المادة والمشتركين</Link></article>)}</div>{!courses.length && <p>لا توجد مادة مطابقة.</p>}<nav aria-label="صفحات المواد" style={{ display: "flex", gap: 16, marginBlock: 24 }}>{page > 1 && <Link href={`/admin/courses?q=${encodeURIComponent(q)}&page=${page - 1}`}>السابق</Link>}<span>الصفحة {page} / {Math.max(1, Math.ceil(courses.length / 40))}</span>{page * 40 < courses.length && <Link href={`/admin/courses?q=${encodeURIComponent(q)}&page=${page + 1}`}>التالي</Link>}</nav></main>;
}
