import type { Course, Institution } from "@/lib/data";
import type { PublicCourseBundle } from "@/lib/course-bundles";
import type { PublicSpecialty } from "@/lib/seo-catalog";
import { courseSeoDescription, seoDescription, seoSegment } from "@/lib/seo";

export type SeoPage = { path: string; title: string; description: string; kind: string; image?: string };
export type SeoOverride = { title: string; description: string };
export const SEO_STATIC_PAGES: SeoPage[] = [
  { path: "/", title: "شروحات المقررات الجامعية في السعودية", description: "استكشف شروحات المقررات حسب الجامعة والتخصص، وشاهد المعاينات المجانية المتاحة، وواصل تعلمك وملفاتك من حساب واحد في مراس العلم.", kind: "عام" },
  { path: "/universities", title: "دليل الجامعات والكليات السعودية وشروحات المواد", description: "تصفح الجامعات والكليات السعودية والتخصصات، ثم اكتشف شروحات المقررات المتوفرة لطلاب كل جامعة على مراس العلم.", kind: "دليل" },
  { path: "/courses", title: "شروحات المواد الجامعية", description: "تصفح المواد الجامعية في مراس العلم حسب الجامعة والتخصص، واستعرض خطة الدروس والأسعار والمعاينات المجانية المتاحة قبل الاشتراك.", kind: "دليل" },
  { path: "/bundles", title: "باقات المواد الجامعية", description: "استعرض باقات المواد المتاحة في مراس العلم، وقارن المواد المشمولة والأسعار والتوفير قبل إضافتها إلى السلة.", kind: "دليل" },
  { path: "/tools", title: "أدوات مراس للمذاكرة بالذكاء الاصطناعي", description: "تعرف على أدوات مراس لتلخيص الملفات وترجمة المحتوى وإنشاء اختبارات تدريبية ومناقشة موضوعات الدراسة، مع حدود الاستخدام والأسعار الحالية.", kind: "عام" },
  { path: "/about", title: "عن مراس العلم", description: "تعرف على منصة مراس العلم، وطريقة تنظيم الشروحات الجامعية حسب الجامعة والتخصص، وخيارات المذاكرة والدعم المتاحة للطلاب.", kind: "عام" },
  { path: "/faq", title: "الأسئلة الشائعة عن مراس العلم", description: "إجابات عن تجربة الدروس والاشتراك وصلاحية المواد والباقات وأدوات المذاكرة والتنبيهات والدعم في منصة مراس العلم.", kind: "مساعدة" },
  { path: "/how-it-works", title: "كيف تعمل مراس؟", description: "تعرف على رحلة الطالب من البحث عن المادة واستعراض الدروس إلى الاشتراك والتعلم داخل منصة مراس العلم.", kind: "مساعدة" },
  { path: "/contact", title: "تواصل معنا", description: "تواصل مع فريق مراس العلم للاستفسارات والمساعدة بشأن حسابك والمواد الجامعية والاشتراكات.", kind: "مساعدة" },
  { path: "/terms", title: "الشروط والأحكام", description: "الشروط المنظمة لاستخدام منصة مراس العلم والحسابات وشراء المحتوى التعليمي والدفع وحقوق المحتوى والشكاوى.", kind: "سياسة" },
  { path: "/privacy", title: "سياسة الخصوصية", description: "سياسة خصوصية منصة مراس العلم: البيانات التي تُجمع، وأغراض معالجتها، ومدة الاحتفاظ بها، وحقوق المستخدم وطرق التواصل والشكوى.", kind: "سياسة" },
  { path: "/refund-policy", title: "سياسة الاسترداد", description: "سياسة طلبات الإلغاء والاسترداد في مراس العلم، وحالات الأهلية وآلية التقديم والمراجعة وإعادة المبلغ.", kind: "سياسة" },
  { path: "/content-policy", title: "حقوق وسياسة المحتوى", description: "تعرف على ملكية المحتوى التعليمي في مراس العلم، وضوابط الاستخدام الشخصي، وآلية تقديم بلاغات حقوق المحتوى.", kind: "سياسة" },
  { path: "/accessibility", title: "إمكانية الوصول", description: "تعرف على دعم التصفح بلوحة المفاتيح ووضوح المحتوى والمظهر في مراس العلم، وكيفية إبلاغ الدعم عن عوائق الوصول.", kind: "سياسة" },
];

export function staticSeoPage(path: string) {
  const page = SEO_STATIC_PAGES.find((item) => item.path === path);
  if (!page) throw new Error("Unknown public SEO page");
  return page;
}

export function bundleSeoDescription(bundle: Pick<PublicCourseBundle, "title" | "description" | "courses">) {
  return seoDescription(`${bundle.title}: ${bundle.courses.map((course) => course.title).join("، ")}. ${bundle.description}`);
}

export function buildSeoPages(courses: Course[], institutions: Institution[], specialties: PublicSpecialty[], bundles: PublicCourseBundle[] = []): SeoPage[] {
  const visible = new Map(institutions.map((item) => [item.slug, item]));
  const published = courses.filter((course) => visible.has(course.universitySlug));
  const pages: SeoPage[] = [...SEO_STATIC_PAGES];
  for (const item of institutions) pages.push({ path: `/universities/${seoSegment(item.slug)}`, title: `مواد وشروحات ${item.name}`, description: `الشروحات والمواد المتوفرة لطلاب ${item.name} على منصة مراس العلم.`, kind: "جامعة" });
  for (const course of published) pages.push({ path: `/courses/${seoSegment(course.slug)}`, title: `${course.title} — ${course.university}`, description: courseSeoDescription(course), image: course.coverImage || "/og.png", kind: "مادة" });
  for (const specialty of specialties) {
    const institution = visible.get(specialty.institutionSlug);
    if (!institution || !published.some((course) => course.universitySlug === institution.slug && (course.audienceScope === "institution" || course.specialtySlug === specialty.slug))) continue;
    pages.push({ path: `/universities/${seoSegment(institution.slug)}/specialties/${seoSegment(specialty.slug)}`, title: `${specialty.name} في ${institution.name}`, description: `مواد وشروحات تخصص ${specialty.name} لطلاب ${institution.name} على منصة مراس العلم. ${specialty.description}`, kind: "تخصص" });
  }
  for (const bundle of bundles) if (bundle.courseSlugs.length >= 2 && bundle.courseSlugs.every((slug) => published.some((course) => course.slug === slug && course.availableForPurchase))) {
    pages.push({ path: `/bundles/${seoSegment(bundle.slug)}`, title: bundle.title, description: bundleSeoDescription(bundle), kind: "باقة" });
  }
  return [...new Map(pages.map((page) => [page.path, page])).values()];
}

// No raw HTML, canonical, robots, script, arbitrary URL or unsupported field can
// be stored by the SEO editor. Empty strings intentionally restore defaults.
export function validateSeoOverride(input: Record<string, unknown>): SeoOverride {
  if (Object.keys(input).some((key) => key !== "title" && key !== "description")) throw new TypeError("حقول SEO غير مدعومة");
  const output: SeoOverride = { title: "", description: "" };
  for (const [key, max] of [["title", 100], ["description", 180]] as const) {
    const value = input[key];
    if (typeof value !== "string" || Array.from(value.trim()).length > max || /[<>\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new TypeError(`أدخل ${key === "title" ? "عنوانًا" : "وصفًا"} نصيًا لا يتجاوز ${max} حرفًا`);
    output[key] = seoDescription(value, max);
  }
  return output;
}
