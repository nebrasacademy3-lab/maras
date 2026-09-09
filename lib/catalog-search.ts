import type { Course, Institution } from "@/lib/data";

export type CatalogSearchCourse = Pick<Course, "slug" | "title" | "titleEn" | "university" | "specialty" | "color" | "icon">;
export type CatalogSearchInstitution = Pick<Institution, "slug" | "name" | "nameEn" | "region" | "type" | "logo" | "domain">;
export type CatalogSearchResults = { institutions: CatalogSearchInstitution[]; courses: CatalogSearchCourse[] };
export const EMPTY_CATALOG_SEARCH: CatalogSearchResults = { institutions: [], courses: [] };

export function normalizeCatalogSearch(value: string): string {
  return value.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660))).toLocaleLowerCase("ar").replace(/\s+/g, " ").trim();
}

export function catalogSearchMatches(query: string, fields: string[]): boolean {
  const haystack = normalizeCatalogSearch(fields.join(" "));
  return normalizeCatalogSearch(query).split(" ").filter(Boolean).every(word => haystack.includes(word));
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" ? value : "";
const validSlug = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\/\\?#\u0000-\u001f]/.test(value) && value !== "." && value !== "..";

/** Validate the public wire format before any result can enter the dialog. */
export function parseCatalogSearchResults(value: unknown): CatalogSearchResults {
  if (!record(value) || !Array.isArray(value.institutions) || !Array.isArray(value.courses)) throw new Error("تعذر قراءة نتائج البحث. حاول مرة أخرى.");
  const institutions = value.institutions.filter(record).filter(item => validSlug(item.slug) && typeof item.name === "string" && item.name.trim()).slice(0, 6).map(item => ({ slug: text(item.slug), name: text(item.name), nameEn: text(item.nameEn), region: text(item.region), type: text(item.type) as Institution["type"], logo: text(item.logo) || undefined, domain: text(item.domain) || undefined }));
  const courses = value.courses.filter(record).filter(item => validSlug(item.slug) && typeof item.title === "string" && item.title.trim()).slice(0, 6).map(item => ({ slug: text(item.slug), title: text(item.title), titleEn: text(item.titleEn), university: text(item.university), specialty: text(item.specialty), color: text(item.color), icon: text(item.icon) }));
  return { institutions, courses };
}
