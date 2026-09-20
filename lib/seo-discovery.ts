import type { SeoPage } from "@/lib/seo-pages";
import { seoDescription, seoUrl } from "@/lib/seo";

export const DISCOVERY_MAX_ENTRIES = 1000;
export const DISCOVERY_MAX_BYTES = 256 * 1024;
const MAX_IDENTITY_NAMES = 8;
const publicPath = /^(?:\/|\/(?:courses|bundles|universities)(?:\/[^/?#]+)?|\/universities\/[^/?#]+\/specialties\/[^/?#]+|\/(?:tools|about|why-maras|faq|how-it-works|contact|terms|privacy|refund-policy|content-policy|accessibility))$/;

type PublicIdentity = { name?: string; alternateNames?: string[]; description?: string; distinction?: string };

function plainText(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  // Bound work before sanitizing and discard script/style contents, not only tags.
  const source = value.slice(0, 4096)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, " ");
  return seoDescription(source, maximum)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\[\]()\\`<>#]/g, "")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, maximum);
}

function publicIdentityLines(identity?: PublicIdentity): string[] {
  if (!identity || typeof identity !== "object") return [];
  const alternateNames = Array.isArray(identity.alternateNames)
    ? identity.alternateNames.slice(0, MAX_IDENTITY_NAMES).map(value => plainText(value, 100)).filter(Boolean)
    : [];
  return [
    "## هوية مراس العلم", "",
    `الاسم: ${plainText(identity.name, 120) || "مراس العلم"}`,
    ...(alternateNames.length ? [`أسماء العرض: ${[...new Set(alternateNames)].join(" — ")}`] : []),
    plainText(identity.description, 500),
    plainText(identity.distinction, 500),
    "",
  ];
}

/** A bounded directory, not a ranking protocol. Never serialize raw catalog objects. */
export function renderPublicDiscovery(intro: string, pages: SeoPage[], identity?: PublicIdentity) {
  const prefix = [
    "# مراس العلم", "", `> ${plainText(intro, 500)}`, "",
    ...publicIdentityLines(identity),
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
