import type { SeoPage } from "@/lib/seo-pages";
import { seoDescription, seoUrl } from "@/lib/seo";

export const DISCOVERY_MAX_ENTRIES = 1000;
export const DISCOVERY_MAX_BYTES = 256 * 1024;
const publicPath = /^(?:\/|\/(?:courses|bundles|universities)(?:\/[^/?#]+)?|\/universities\/[^/?#]+\/specialties\/[^/?#]+|\/(?:tools|about|why-maras|faq|how-it-works|contact|terms|privacy|refund-policy|content-policy|accessibility))$/;

function plainText(value: string, maximum: number) {
  return seoDescription(value.slice(0, 4096), maximum)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\[\]()\\`<>#]/g, "")
    .replace(/\s+/g, " ").trim();
}

/** A bounded directory, not a ranking protocol. Never serialize raw catalog objects. */
export function renderPublicDiscovery(intro: string, pages: SeoPage[]) {
  const prefix = [
    "# مراس العلم", "", `> ${plainText(intro, 500)}`, "",
    "مراس منصة مساندة للمذاكرة الجامعية، وليست جامعة أو جهة مانحة للدرجات والشهادات الجامعية.",
    "الأسعار والتوفر ومدة الوصول موضحة في الصفحة العامة الحالية لكل مادة أو باقة.",
    "هذا الدليل لا يتضمن الحسابات أو بيانات الطلاب أو الإدارة أو الملفات الخاصة أو الدروس المدفوعة.", "",
    "## الصفحات العامة المنشورة", "",
  ];
  const footer = ["", `- [خريطة الموقع العامة الكاملة](${seoUrl("/sitemap.xml")})`, "",
    "مخرجات أدوات الذكاء الاصطناعي مساعدة تعليمية قد تخطئ، ولا تغني عن مراجعة المصدر الأصلي.", ""];
  const lines: string[] = [], seen = new Set<string>();
  let bytes = Buffer.byteLength([...prefix, ...footer].join("\n"), "utf8");
  for (const page of pages) {
    if (!publicPath.test(page.path)) continue;
    let url: string;
    try {
      url = seoUrl(page.path);
      // Reject traversal, query strings, fragments and normalized alternate paths.
      if (new URL(url).pathname !== page.path || new URL(url).search || new URL(url).hash) continue;
    } catch { continue; }
    if (seen.has(url)) continue;
    const title = plainText(page.title, 140), description = plainText(page.description, 240);
    if (!title) continue;
    const line = `- [${title}](${url}): ${description}`;
    const additionalBytes = Buffer.byteLength("\n" + line, "utf8");
    if (lines.length >= DISCOVERY_MAX_ENTRIES || bytes + additionalBytes > DISCOVERY_MAX_BYTES) break;
    seen.add(url); lines.push(line); bytes += additionalBytes;
  }
  return [...prefix, ...lines, ...footer].join("\n");
}
