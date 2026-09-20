/** Stable, versioned summary choices shared by the browser and native clients. */
export const SUMMARY_LANGUAGES = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "English" },
  { value: "bilingual", label: "العربية والإنجليزية" },
] as const;
export const SUMMARY_DETAILS = [
  { value: "brief", label: "موجز" },
  { value: "balanced", label: "متوازن" },
  { value: "detailed", label: "مفصّل" },
] as const;
export type SummaryLanguage = typeof SUMMARY_LANGUAGES[number]["value"];
export type SummaryDetail = typeof SUMMARY_DETAILS[number]["value"];
export function summaryOptions(language: unknown, detail: unknown = "balanced"): { language: SummaryLanguage; detail: SummaryDetail } {
  const input = language === undefined ? "ar" : typeof language === "string" ? language.trim().toLowerCase() : "";
  const lang: SummaryLanguage | null = ["ar", "arabic", "العربية"].includes(input) ? "ar"
    : ["en", "english", "الإنجليزية", "الانجليزية"].includes(input) ? "en"
    : ["bilingual", "ar-en", "العربية والإنجليزية", "ثنائي"].includes(input) ? "bilingual" : null;
  if (!lang || !SUMMARY_DETAILS.some(option => option.value === detail)) throw new TypeError("اختر لغة الملخص ومستوى التفصيل من الخيارات المتاحة.");
  return { language: lang, detail: detail as SummaryDetail };
}
export function summaryPrompt(language: unknown, detail?: unknown) {
  const settings = summaryOptions(language, detail);
  const languages = {
    ar: "اكتب الملخص بالعربية، مع المصطلح الأصلي عند أول ظهور إذا كان مفيدًا.",
    en: "Write the entire summary in English. Keep scientific names, equations and units unchanged.",
    bilingual: "اكتب ملخصًا ثنائي اللغة: لكل فكرة فقرة عربية تتبعها فقرة إنجليزية مكافئة. لا تضع ملخصين مختلفين؛ يجب أن تتطابق الحقائق والأرقام والنفي والشروط في الفقرتين.",
  };
  const details = {
    brief: "قدّم موجزًا يذكر الفكرة الرئيسية لكل محور، مع التعريفات والقوانين والتحذيرات العلمية الحاسمة. قلّل الأمثلة والتكرار، لا نطاق التغطية.",
    balanced: "قدّم لكل محور أهم التعريفات والعلاقات والخطوات ومثالًا واردًا في المصدر عند الحاجة، ثم قائمة مراجعة قصيرة.",
    detailed: "فصّل كل محور وخطواته وتعريفاته وشروط القوانين والأمثلة الموجودة في المصدر. حافظ على العلاقات بين الأفكار دون اختراع أمثلة أو حقائق جديدة.",
  };
  return `${languages[settings.language]}\n${details[settings.detail]}\nغطّ جميع محاور النطاق المختار بالترتيب. درجة التفصيل تغيّر الكثافة لا الحقائق أو التغطية. احفظ الأرقام والوحدات والنفي والشروط والمعادلات. لا تضف حقائق من خارج المصدر. استخدم Markdown منظمًا.`;
}
