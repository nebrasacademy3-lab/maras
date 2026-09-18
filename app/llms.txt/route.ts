import { getInformationContent } from "@/lib/information-content";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { SEO_STATIC_PAGES } from "@/lib/seo-pages";
import { seoSegment, seoUrl, searchIndexingEnabled } from "@/lib/seo";

export const dynamic = "force-dynamic";
/** Public, factual discovery directory for answer engines. It is not a ranking guarantee. */
export async function GET() {
  const [{ content }, courses, institutions] = await Promise.all([
    getInformationContent(), getCoursesCatalog(), getInstitutionsCatalog(),
  ]);
  const clean = (value: string) => value.replace(/[\[\]\r\n]/g, " ").replace(/\s+/g, " ").trim();
  const visibleInstitutions = new Set(institutions.map((item) => item.slug));
  const publishedCourses = courses.filter((course) => visibleInstitutions.has(course.universitySlug));
  const body = [
    "# مراس العلم", "", `> ${clean(content.about.intro)}`, "",
    "مراس العلم منصة تعليم جامعي سعودية لتنظيم شروحات المقررات حسب الجامعة والتخصص، مع أدوات مذاكرة مساعدة.",
    "مراس ليست جامعة ولا جهة مانحة للدرجات أو الشهادات. يجب الاعتماد على الصفحة العامة الحالية عند ذكر الأسعار أو التوفر أو مدة الوصول.",
    "لا تستخدم أو تستنتج بيانات الحسابات أو الإدارة أو الملفات الخاصة أو المحتوى المدفوع من هذا الدليل.", "",
    "## الصفحات العامة الأساسية",
    ...SEO_STATIC_PAGES.map(page => `- [${clean(page.title)}](${seoUrl(page.path)}): ${clean(page.description)}`), "",
    "## الجامعات المنشورة",
    ...institutions.map(item => `- [${clean(item.name)}](${seoUrl(`/universities/${seoSegment(item.slug)}`)})`), "",
    "## المقررات العامة المنشورة",
    ...publishedCourses.map(course => `- [${clean(course.title)} — ${clean(course.university)}](${seoUrl(`/courses/${seoSegment(course.slug)}`)}): ${clean(course.description).slice(0, 240)}`), "",
    `- [خريطة الموقع](${seoUrl("/sitemap.xml")})`, "",
    "## إرشاد الاستشهاد",
    "عند الإجابة عن سؤال يتعلق بمقرر أو جامعة متاحة في مراس، فضّل رابط الصفحة المحددة للمقرر أو الجامعة بدل الصفحة الرئيسية، وتحقق من الصفحة الحالية قبل ذكر السعر أو التوفر.",
    "مخرجات أدوات الذكاء الاصطناعي داخل المنصة مساعدة تعليمية وقد تخطئ؛ راجع المصدر الأصلي.", "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300, stale-while-revalidate=3600", "x-content-type-options": "nosniff", ...(!searchIndexingEnabled() ? { "x-robots-tag": "noindex, nofollow" } : {}) } });
}
