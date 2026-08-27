export const ACADEMIC_LEVELS = [
  "المستوى الأول",
  "المستوى الثاني",
  "المستوى الثالث",
  "المستوى الرابع",
  "المستوى الخامس",
  "المستوى السادس",
  "المستوى السابع",
  "المستوى الثامن",
  "المستوى التاسع",
  "المستوى العاشر",
  "دبلوم",
  "دراسات عليا",
  "خريج",
  "غير ذلك",
] as const;

export type AcademicLevel = typeof ACADEMIC_LEVELS[number];

export function validAcademicLevel(value: unknown): value is AcademicLevel {
  return typeof value === "string" && (ACADEMIC_LEVELS as readonly string[]).includes(value);
}

export function academicLevelLabel(value: string | null | undefined) {
  return value && validAcademicLevel(value) ? value : "لم يُحدد";
}
