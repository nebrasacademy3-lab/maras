import { getInstitutionPrograms, getOfficialProgramSource, moeInstitutionDetails, type AcademicProgram } from "@/lib/academic-data";

const memoryCache = new Map<string, { expires: number; programs: AcademicProgram[] }>();

function decodeEntities(value: string) {
  const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] || " ";
  });
}

function parsePrograms(html: string, fallback: AcademicProgram[], sourceUrl: string) {
  const text = decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:li|p|div|h[1-6]|option|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "");
  const start = text.indexOf("التخصصات");
  if (start < 0) return null;
  const tail = text.slice(start + "التخصصات".length);
  const endCandidates = ["تقدم بطلب الدراسة الآن", "تم القبول", "يجب عليك إكمال البيانات"]
    .map((marker) => tail.indexOf(marker)).filter((index) => index > 0);
  const section = tail.slice(0, endCandidates.length ? Math.min(...endCandidates) : 30_000);
  const rejected = /^(الكليات|التخصصات|الموقع|الرئيسية|البرامج الأكاديمية|تسجيل الدخول|إنشاء حساب|عرض المزيد)$/;
  const names = section.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3 && line.length <= 90 && !rejected.test(line) && !/^\d+$/.test(line) && !line.includes("http"));
  const fallbackByName = new Map(fallback.map((program) => [program.name, program]));
  const inferArea = (name: string): AcademicProgram["area"] => {
    if (/طب|تمريض|صيدل|صحة|علاج|مختبر|أشعة|تغذية|تخدير/.test(name)) return "صحية";
    if (/هندس|عمارة|تخطيط/.test(name)) return "هندسية";
    if (/حاسب|برمج|معلومات|سيبران|بيانات|ذكاء اصطناعي|شبكات/.test(name)) return "تقنية";
    if (/إدارة|ادارة|محاسب|مالية|اقتصاد|تسويق|أعمال|اعمال|سياحة/.test(name)) return "إدارية";
    if (/شريعة|فقه|قرآن|حديث|دعوة|أصول الدين/.test(name)) return "شرعية";
    if (/رياضيات|فيزياء|كيمياء|أحياء|احياء|جيولوج|علوم بحر/.test(name)) return "علمية";
    if (/تربية|تعليم|طفولة|مناهج/.test(name)) return "تربوية";
    if (/تصميم|فنون|أزياء/.test(name)) return "تصميم";
    return "إنسانية";
  };
  const programs = Array.from(new Set(names)).map((name) => ({ ...(fallbackByName.get(name) || ({ name, area: inferArea(name), degree: /ماجستير|دكتوراه/.test(name) ? "دراسات عليا" : /دبلوم/.test(name) ? "دبلوم" : "بكالوريوس" } as AcademicProgram)), verificationStatus: "official-program" as const, sourceUrl }));
  return programs.length >= 4 ? programs : null;
}

export async function getVerifiedInstitutionPrograms(institutionSlug: string, domain?: string) {
  const fallback = getInstitutionPrograms(institutionSlug);
  const detailId = moeInstitutionDetails[institutionSlug];
  if (!detailId) return { programs: fallback, sourceUrl: getOfficialProgramSource(institutionSlug, domain), liveVerified: false };
  const cached = memoryCache.get(institutionSlug);
  if (cached && cached.expires > Date.now()) return { programs: cached.programs, sourceUrl: getOfficialProgramSource(institutionSlug, domain), liveVerified: true };
  try {
    const response = await fetch(getOfficialProgramSource(institutionSlug, domain), {
      headers: { accept: "text/html", "user-agent": "MerasAlElm-Catalog/1.0" },
      signal: AbortSignal.timeout(4_500),
    });
    if (!response.ok) throw new Error("official catalog unavailable");
    const programs = parsePrograms(await response.text(), fallback, getOfficialProgramSource(institutionSlug, domain));
    if (!programs) throw new Error("official specialties could not be parsed");
    memoryCache.set(institutionSlug, { programs, expires: Date.now() + 6 * 60 * 60 * 1000 });
    return { programs, sourceUrl: getOfficialProgramSource(institutionSlug, domain), liveVerified: true };
  } catch {
    return { programs: fallback, sourceUrl: getOfficialProgramSource(institutionSlug, domain), liveVerified: false };
  }
}
