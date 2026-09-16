import { getInformationContent } from "@/lib/information-content";
import { SEO_STATIC_PAGES } from "@/lib/seo-pages";
import { seoUrl, searchIndexingEnabled, publicIdentityFacts } from "@/lib/seo";

export const dynamic = "force-dynamic";
/** Optional plain-text directory. It is not an indexing protocol or ranking guarantee. */
export async function GET() {
  const identity=publicIdentityFacts();
  const { content } = await getInformationContent();
  const clean = (value: string) => value.replace(/[\[\]\r\n]/g, " ").trim();
  const body = [
    "# مراس العلم", "", `> ${clean(content.about.intro)}`, "",
    "مراس منصة مساندة للمذاكرة، وليست جهة مانحة للدرجات أو الشهادات الجامعية.",
    "المحتوى والأسعار ومدة الوصول تخضع لما هو منشور في صفحة كل مادة وقت الاطلاع.",
    "بيانات الحسابات والإدارة والملفات الخاصة والمحتوى المدفوع ليست جزءًا من هذا الدليل.", "",
    "## هوية مراس العلم", `الاسم: ${identity.name}`, `أسماء العرض المساندة: ${identity.alternateNames.join(" — ")}`, `الموقع الرسمي: ${identity.url}`, `صفحة تعريف الجهة: ${identity.aboutUrl}`, clean(identity.description), clean(identity.distinction), "",
    "## معلومات يجب قراءتها من المصدر الحالي", "توافر مادة في الجامعة لا يعني أن جميع مقررات الجامعة متاحة. مراجعة الوصف والوحدات والدرس التجريبي والسعر ومدة الوصول تكون من صفحة المادة وقت الاطلاع. لا تعد قائمة الجامعة شراكة أو اعتمادًا. طلب توفير مادة ليس وعدًا بموعد جاهز.", "",
    "## الصفحات العامة", ...SEO_STATIC_PAGES.map(page => `- [${clean(page.title)}](${seoUrl(page.path)}): ${clean(page.description)}`), "",
    `- [خريطة الصفحات العامة المنشورة](${seoUrl("/sitemap.xml")})`, "",
    "## استخدام أدوات المذاكرة", "مخرجات الذكاء الاصطناعي مساعدة تعليمية قد تخطئ؛ راجع المصدر الأصلي. تختلف الحصص حسب الخدمة والاشتراك.", "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60", "x-content-type-options": "nosniff", ...(!searchIndexingEnabled() ? { "x-robots-tag": "noindex, nofollow" } : {}) } });
}
