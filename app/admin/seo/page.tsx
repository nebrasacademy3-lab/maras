import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getCoursesCatalog,getInstitutionsCatalog } from "@/lib/catalog-store";
import { getPublicSpecialtyCatalog } from "@/lib/seo-catalog";
import { googleSiteVerification,searchIndexingEnabled,seoSiteOrigin } from "@/lib/seo";
import { buildSeoReadiness } from "@/lib/seo-readiness";
import styles from "./seo.module.css";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"جاهزية البحث | إدارة مراس",robots:{index:false,follow:false}};
export default async function SeoPage(){
 await requireRole("/admin/seo",["admin"]);
 const [courses,institutions,specialties]=await Promise.all([getCoursesCatalog(),getInstitutionsCatalog(),getPublicSpecialtyCatalog()]);
 const report=buildSeoReadiness(courses,institutions,specialties,{origin:seoSiteOrigin(),indexing:searchIndexingEnabled(),verification:Boolean(googleSiteVerification())});
 return <main dir="rtl" className={styles.page}>
  <header><Link href="/admin">العودة للإدارة</Link><p>جودة المحتوى والتهيئة العامة</p><h1>جاهزية ظهور مراس في البحث</h1><p>هذا فحص للإعدادات والكتالوج الحالي، وليس نتيجة Lighthouse أو إثبات فهرسة في Google.</p></header>
  <section className={styles.metrics} aria-label="ملخص الجاهزية">{[["المواد العامة",report.summary.publicCourses],["الجامعات العامة",report.summary.institutions],["روابط الخريطة",report.summary.sitemapUrls],["مشكلات الإعداد",report.summary.errors],["ملاحظات المحتوى",report.summary.warnings]].map(([label,value])=><article key={String(label)}><strong>{value}</strong><span>{label}</span></article>)}</section>
  <section className={styles.panel}><h2>الإعدادات ومجال الفحص</h2><p>النطاق الأساسي: <bdi>{report.origin}</bdi></p><p>الفهرسة: {report.indexingEnabled?"مفعّلة في الإعدادات":"غير مفعلة في هذه البيئة"}</p><p>{report.excluded}</p><p><a href="/sitemap.xml" target="_blank" rel="noreferrer">عرض خريطة الموقع</a> · <a href="/robots.txt" target="_blank" rel="noreferrer">عرض تعليمات الزحف</a></p><p>فحص HTML الفعلي بعد النشر: <code dir="ltr">npm run seo:audit -- --base {report.origin} --limit 100</code></p><p>راجع النتائج في Google Search Console، واختبر صفحات فعلية بـ Lighthouse. الدرجة الكاملة في أداة واحدة لا تضمن الترتيب أو فهرسة كل صفحة.</p></section>
  <section className={styles.panel}><h2>الملاحظات القابلة للمعالجة</h2>{report.findings.length?report.findings.slice(0,200).map((finding,index)=><article className={styles.finding} data-severity={finding.severity} key={`${finding.code}-${index}`}><h3>{finding.label}</h3><p>{finding.detail}</p>{finding.path&&<Link href={finding.path} target="_blank">عرض الصفحة العامة</Link>}</article>):<p>لم يكشف الفحص المحلي ملاحظات ضمن نطاقه المحدود. يلزم التحقق من الاستجابات الفعلية والفهرسة بعد النشر.</p>}{report.findings.length>200&&<p>تظهر أول 200 ملاحظة من أصل {report.findings.length}. تتوفر جميع الملاحظات في واجهة API الإدارية.</p>}</section>
 </main>;
}
