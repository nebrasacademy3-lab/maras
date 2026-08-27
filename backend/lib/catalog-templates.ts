import type { AcademicProgram } from "@/lib/academic-data";

const arabicMap: Record<string, string> = { ا: "a", أ: "a", إ: "i", آ: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y", ة: "h", ى: "a", ء: "a" };

export function asciiSlug(value: string) {
  const transliterated = [...value.toLowerCase()].map((char) => arabicMap[char] || char).join("");
  return transliterated.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "item";
}

export function stableHash(value: string) {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36).slice(0, 7);
}

export function institutionSlug(name: string) { return `${asciiSlug(name)}-${stableHash(name)}`.slice(0, 80); }
export function specialtySlug(name: string) { return `${asciiSlug(name)}-${stableHash(name)}`.slice(0, 80); }
export function courseSlug(institutionSlug: string, specialtyName: string, courseName: string) { return `${institutionSlug}-${asciiSlug(specialtyName)}-${asciiSlug(courseName)}-${stableHash(`${institutionSlug}:${specialtyName}:${courseName}`)}`.slice(0, 80); }
export function lessonId(slug: string, position: number, title = "") { return title ? `${slug}-lesson-${asciiSlug(title)}-${stableHash(`${slug}:${position}:${title}`)}`.slice(0, 100) : `${slug}-lesson-${String(position).padStart(2, "0")}`.slice(0, 100); }

export const templateUnits = ["الوحدة الأولى: الأساسيات والمفاهيم", "الوحدة الثانية: التطبيق والتحليل", "الوحدة الثالثة: التمارين والمراجعة", "الوحدة الرابعة: المشروع والاستعداد"];
export const templateLessons = (courseName: string) => [
  `مدخل إلى ${courseName}`,
  `المفاهيم الأساسية في ${courseName}`,
  `أمثلة وتطبيقات عملية في ${courseName}`,
  `تمارين ومراجعة ${courseName}`,
  `التقييم النهائي ومشروع ${courseName}`,
];

export function templateUnitDescription(courseName: string, unitTitle: string) { return `${unitTitle} في مادة ${courseName}: مسار منظم يمهّد للمفاهيم والتطبيقات والتمارين. يمكن للإدارة تخصيص الوصف وإضافة الفيديوهات المعتمدة.`; }
export function templateLessonDescription(courseName: string, lessonTitle: string) { return `درس تمهيدي ضمن ${courseName}: ${lessonTitle}. يُستكمل الشرح المرئي والملفات من لوحة الإدارة.`; }

export function templateDescription(institutionName: string, program: AcademicProgram, courseName: string) {
  return `قالب تعليمي منظم لمادة «${courseName}» ضمن تخصص «${program.name}» في ${institutionName}. يتضمن وحدات تأسيسية وتطبيقية وتمارين ومراجعة، ويُستكمل بإضافة فيديوهات الشرح من لوحة الإدارة.`;
}

export function templateCourseCode(institutionSlug: string, program: AcademicProgram, courseName: string) {
  return `AUTO-${stableHash(`${institutionSlug}:${program.name}:${courseName}`).toUpperCase()}`;
}
