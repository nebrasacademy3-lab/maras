export type TextDirection = "rtl" | "ltr";

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN = /[A-Za-z]/;

export function directionForText(value: string, fallback: TextDirection): TextDirection {
  const arabicIndex = value.search(ARABIC);
  const latinIndex = value.search(LATIN);
  if (arabicIndex < 0 && latinIndex < 0) return fallback;
  if (arabicIndex < 0) return "ltr";
  if (latinIndex < 0) return "rtl";
  return arabicIndex < latinIndex ? "rtl" : "ltr";
}
