import type { Course, Institution } from "@/lib/data";
import type { PublicSpecialty } from "@/lib/seo-catalog";
import { buildPublicSitemap } from "@/lib/seo-sitemap";
import { seoDescription } from "@/lib/seo";

export type SeoFinding = { code: string; severity: "error" | "warning"; label: string; detail: string; path?: string };
/** Local configuration/content readiness only, never a ranking or indexing guarantee. */
export function buildSeoReadiness(courses: Course[], institutions: Institution[], specialties: PublicSpecialty[], environment: { origin: string; indexing: boolean; verification: boolean }) {
  const sitemap = buildPublicSitemap(courses, institutions, specialties);
  const findings: SeoFinding[] = [];
  if (!environment.indexing) findings.push({code:"INDEXING_DISABLED",severity:"error",label:"الفهرسة العامة غير مفعلة",detail:"راجع NODE_ENV=production وSEO_INDEXING_ENABLED وNEXT_PUBLIC_SITE_URL أو APP_URL. إبقاؤها مغلقة صحيح في بيئة التجربة."});
  if (!environment.verification) findings.push({code:"VERIFICATION_NOT_IN_ENV",severity:"warning",label:"لا يوجد رمز تحقق Google في إعدادات الموقع",detail:"قد تكون الملكية مثبتة بالفعل عبر DNS؛ لا تضف رمزًا بديلًا دون حاجة."});
  if (sitemap.length > 50000) findings.push({code:"SITEMAP_TOO_LARGE",severity:"error",label:"الخريطة تحتاج تقسيمًا",detail:"الخريطة الحالية تتجاوز 50000 رابط. قسّمها قبل إرسالها لمحركات البحث."});
  const visible = new Set(institutions.map(row=>row.slug));
  const titleCounts = new Map<string,number>();
  for (const course of courses) {
    if (!visible.has(course.universitySlug)) continue;
    const title=seoDescription(course.title);const description=seoDescription(course.description,10000);
    const path=`/courses/${encodeURIComponent(course.slug)}`;
    // Same title at different universities is legitimate; report duplicates only within one university.
    const key=JSON.stringify([course.universitySlug,title]);titleCounts.set(key,(titleCounts.get(key)||0)+1);
    if (!title) findings.push({code:"COURSE_TITLE_MISSING",severity:"error",label:"مادة بلا عنوان واضح",detail:course.slug,path});
    if (description.length < 60) findings.push({code:"COURSE_DESCRIPTION_SHORT",severity:"warning",label:"وصف مادة يحتاج محتوى أصليًا أوضح",detail:`${course.title}: أضف ما يتعلمه الطالب ومحتوى المادة والجمهور المستهدف. حد 60 حرفًا إرشاد تحريري داخلي وليس شرط Google.`,path});
    if (!course.coverImage) findings.push({code:"COURSE_IMAGE_MISSING",severity:"warning",label:"صورة مادة غير مخصصة",detail:`${course.title}: راجع الغلاف والنص البديل؛ قد تستخدم الصفحة صورة المشاركة الافتراضية.`,path});
  }
  for (const [key,total] of titleCounts) if(total>1) { const [university,title]=JSON.parse(key) as [string,string]; findings.push({code:"COURSE_TITLE_DUPLICATE",severity:"warning",label:"عنوان متكرر داخل الجامعة",detail:`${title} — ${university} (${total} مواد). ميّز المواد برمزها أو محتواها عند اختلافها.`}); }
  return { generatedAt:new Date().toISOString(), origin:environment.origin, indexingEnabled:environment.indexing,
    summary:{publicCourses:courses.filter(row=>visible.has(row.universitySlug)).length,institutions:institutions.length,sitemapUrls:sitemap.length,errors:findings.filter(row=>row.severity==="error").length,warnings:findings.filter(row=>row.severity==="warning").length},
    findings, excluded:"ملفات الطلاب والإدارة والحسابات والدفع وروابط الفيديو المحمية ليست صفحات عامة للفهرسة.",
    scope:"local_configuration_and_public_catalog_only", score:null,
  };
}
