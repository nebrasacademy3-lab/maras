import { getInstitutionPrograms, getOfficialProgramSource, studyInSaudiInstitutionIds, type AcademicProgram } from "@/lib/academic-data";

const STUDY_IN_SAUDI_ORIGIN = "https://studyinsaudi.sa";
const MAX_PROGRAM_PAGES = 3;
const memoryCache = new Map<string, { expires: number; programs: AcademicProgram[]; sourceUrl: string; liveVerified: boolean }>();
const discoveredInstitutionIds = new Map<string, string>();

type OfficialInstitution = {
  id?: string;
  nameAr?: string;
  nameEn?: string;
  logoUrl?: string;
  majorsCount?: number;
};

function decodeEntities(value: string) {
  const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] || " ";
  });
}

function plainText(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
}

function inferArea(name: string): AcademicProgram["area"] {
  if (/طب|تمريض|صيدل|صحة|علاج|مختبر|أشعة|تغذية|تخدير|سرير|تشريح/.test(name)) return "صحية";
  if (/هندس|عمارة|تخطيط|بناء|طيران|بترول|مواد/.test(name)) return "هندسية";
  if (/حاسب|برمج|معلومات|سيبران|بيانات|ذكاء اصطناعي|شبكات|تقنية/.test(name)) return "تقنية";
  if (/إدارة|ادارة|محاسب|مالية|اقتصاد|تسويق|أعمال|اعمال|سياحة|موارد بشرية/.test(name)) return "إدارية";
  if (/شريعة|فقه|قرآن|حديث|دعوة|أصول الدين/.test(name)) return "شرعية";
  if (/رياضيات|فيزياء|كيمياء|أحياء|احياء|جيولوج|علوم بحر|إحصاء|احصاء/.test(name)) return "علمية";
  if (/تربية|تعليم|طفولة|مناهج/.test(name)) return "تربوية";
  if (/تصميم|فنون|أزياء|عمارة داخلية/.test(name)) return "تصميم";
  return "إنسانية";
}

function degreeFrom(value: string): AcademicProgram["degree"] {
  if (/ماجستير|دكتوراه|دكتوراة/.test(value)) return "دراسات عليا";
  if (/دبلوم/.test(value)) return "دبلوم";
  return "بكالوريوس";
}

function parseModernPrograms(html: string, sourceUrl: string) {
  const marker = html.indexOf('id="programs-grid"');
  if (marker < 0) return [] as AcademicProgram[];
  const tail = html.slice(marker, marker + 420_000);
  const blocks = tail.split(/(?=<div[^>]+onclick="window\.location\.href='\/ar\/Programs\/Details\/[^']+')/g).slice(1);
  const rows: AcademicProgram[] = [];
  for (const block of blocks) {
    const degreeMatch = block.match(/<!--\s*Degree badge[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    const nameMatch = block.match(/<!--\s*Name \+ Logo row[\s\S]*?<span class="text-\[16px\][^"]*"[^>]*>\s*([^<]+?)(?:\s*<span|<\/span>)/i)
      || block.match(/<span class="text-\[16px\][^"]*"[^>]*>\s*([^<]+?)(?:\s*<span|<\/span>)/i);
    const name = nameMatch ? plainText(nameMatch[1]) : "";
    const degreeLabel = degreeMatch ? plainText(degreeMatch[1]) : "";
    if (name.length < 2 || name.length > 140 || /جامعة|عرض التفاصيل/.test(name)) continue;
    rows.push({ name, area: inferArea(name), degree: degreeFrom(degreeLabel), verificationStatus: "official-program", sourceUrl });
  }
  return Array.from(new Map(rows.map((program) => [`${normalizeName(program.name)}:${program.degree}`, program])).values());
}

function parseLegacyPrograms(html: string, fallback: AcademicProgram[], sourceUrl: string) {
  const text = decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:li|p|div|h[1-6]|option|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "");
  const start = text.indexOf("التخصصات");
  if (start < 0) return [] as AcademicProgram[];
  const tail = text.slice(start + "التخصصات".length);
  const endCandidates = ["تقدم بطلب الدراسة الآن", "تم القبول", "يجب عليك إكمال البيانات"]
    .map((marker) => tail.indexOf(marker)).filter((index) => index > 0);
  const section = tail.slice(0, endCandidates.length ? Math.min(...endCandidates) : 30_000);
  const rejected = /^(الكليات|التخصصات|الموقع|الرئيسية|البرامج الأكاديمية|تسجيل الدخول|إنشاء حساب|عرض المزيد)$/;
  const names = section.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3 && line.length <= 90 && !rejected.test(line) && !/^\d+$/.test(line) && !line.includes("http"));
  const fallbackByName = new Map(fallback.map((program) => [normalizeName(program.name), program]));
  return Array.from(new Set(names)).map((name) => ({ ...(fallbackByName.get(normalizeName(name)) || { name, area: inferArea(name), degree: degreeFrom(name) }), verificationStatus: "official-program" as const, sourceUrl }));
}

async function discoverOfficialInstitution(institutionSlug: string, institutionName?: string) {
  const knownId = studyInSaudiInstitutionIds[institutionSlug] || discoveredInstitutionIds.get(institutionSlug);
  if (knownId) return knownId;
  if (!institutionName) return null;
  try {
    const response = await fetch(`${STUDY_IN_SAUDI_ORIGIN}/api/v1/institutions?pageSize=16&pageNumber=1&search=${encodeURIComponent(institutionName)}`, {
      headers: { accept: "application/json", "user-agent": "MerasAlElm-Catalog/2.0" },
      signal: AbortSignal.timeout(5_500),
    });
    if (!response.ok) return null;
    const body = await response.json() as { items?: OfficialInstitution[] };
    const wanted = normalizeName(institutionName);
    const candidates = body.items || [];
    const matched = candidates.find((item) => normalizeName(item.nameAr || "") === wanted)
      || candidates.find((item) => normalizeName(item.nameAr || "").includes(wanted) || wanted.includes(normalizeName(item.nameAr || "")))
      || (candidates.length === 1 ? candidates[0] : undefined);
    if (!matched?.id) return null;
    discoveredInstitutionIds.set(institutionSlug, matched.id);
    return matched.id;
  } catch { return null; }
}

async function fetchPrograms(sourceUrl: string, fallback: AcademicProgram[]) {
  const separator = sourceUrl.includes("?") ? "&" : "?";
  const pages = await Promise.allSettled(Array.from({ length: MAX_PROGRAM_PAGES }, async (_, index) => {
    const pageUrl = `${sourceUrl}${separator}page=${index + 1}`;
    const response = await fetch(pageUrl, {
      headers: { accept: "text/html", "user-agent": "MerasAlElm-Catalog/2.0" },
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) return [] as AcademicProgram[];
    const html = await response.text();
    const modern = parseModernPrograms(html, sourceUrl);
    return modern.length ? modern : parseLegacyPrograms(html, fallback, sourceUrl);
  }));
  const official = pages.flatMap((page) => page.status === "fulfilled" ? page.value : []);
  return Array.from(new Map(official.map((program) => [`${normalizeName(program.name)}:${program.degree}`, program])).values());
}

export async function getVerifiedInstitutionPrograms(institutionSlug: string, domain?: string, institutionName?: string) {
  const fallback = getInstitutionPrograms(institutionSlug);
  if (institutionSlug === "seu") return { programs: fallback, sourceUrl: getOfficialProgramSource(institutionSlug, domain), liveVerified: fallback.some((program) => program.verificationStatus === "official-program") };
  const cached = memoryCache.get(institutionSlug);
  if (cached && cached.expires > Date.now()) return { programs: cached.programs, sourceUrl: cached.sourceUrl, liveVerified: cached.liveVerified };
  const officialId = await discoverOfficialInstitution(institutionSlug, institutionName);
  if (!officialId) return { programs: fallback, sourceUrl: getOfficialProgramSource(institutionSlug, domain), liveVerified: false };
  const sourceUrl = `${STUDY_IN_SAUDI_ORIGIN}/ar/Institutions/Details/${officialId}`;
  try {
    const official = await fetchPrograms(sourceUrl, fallback);
    if (!official.length) throw new Error("official programs unavailable");
    const officialKeys = new Set(official.map((program) => `${normalizeName(program.name)}:${program.degree}`));
    const merged = [...official, ...fallback.filter((program) => !officialKeys.has(`${normalizeName(program.name)}:${program.degree}`))];
    memoryCache.set(institutionSlug, { programs: merged, sourceUrl, liveVerified: true, expires: Date.now() + 12 * 60 * 60 * 1000 });
    return { programs: merged, sourceUrl, liveVerified: true };
  } catch {
    memoryCache.set(institutionSlug, { programs: fallback, sourceUrl, liveVerified: false, expires: Date.now() + 30 * 60 * 1000 });
    return { programs: fallback, sourceUrl, liveVerified: false };
  }
}
