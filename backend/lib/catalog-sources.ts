import type { Institution, InstitutionType } from "@/lib/data";

export type CatalogVerificationStatus = "official-directory" | "official-program" | "discovery" | "pending-review";

export type CatalogSourceRecord = {
  institutionSlug: string;
  directoryUrl: string;
  officialDomain?: string;
  verificationStatus: CatalogVerificationStatus;
  verifiedAt: string;
  aliases: string[];
  notes?: string;
};

export const CATALOG_VERIFIED_AT = "2026-08-27";
export const OFFICIAL_DIRECTORIES = {
  government: "https://www.cua.gov.sa/الجامعات-الحكومية/",
  private: "https://www.cua.gov.sa/الجامعات-الأهلية-والكليات/",
  studyInSaudi: "https://studyinsaudi.moe.gov.sa/Universities",
  technical: "https://tvtc.gov.sa/",
} as const;

const aliases: Record<string, string[]> = {
  fbsu: ["جامعة فهد بن سلطان"],
  jadara: ["كلية جدارة للعلوم الإدارية والإنسانية"],
  bmc: ["كلية البترجي الطبية"],
  ibnsina: ["كلية ابن سينا الأهلية للعلوم الطبية"],
  vision: ["كليات الرؤية"],
  alghad: ["كليات الغد الدولية للعلوم الطبية التطبيقية"],
  inaya: ["كليات العناية الطبية"],
  aic: ["كليات الشرق العربي"],
  alrayan: ["كليات الريان الأهلية"],
  "psc-management": ["كلية الأمير سلطان للإدارة"],
};

export function directoryUrlForType(type: InstitutionType) {
  if (type === "حكومية") return OFFICIAL_DIRECTORIES.government;
  if (type === "تقنية") return OFFICIAL_DIRECTORIES.technical;
  return OFFICIAL_DIRECTORIES.private;
}

export function getCatalogSourceRecord(institution: Pick<Institution, "slug" | "type" | "domain">): CatalogSourceRecord {
  return {
    institutionSlug: institution.slug,
    directoryUrl: directoryUrlForType(institution.type),
    officialDomain: institution.domain,
    verificationStatus: "official-directory",
    verifiedAt: CATALOG_VERIFIED_AT,
    aliases: aliases[institution.slug] || [],
    notes: institution.slug === "psc-management" ? "ورد في دليل CUA ككلية تابعة لجامعة الفيصل؛ لا ينشأ سجل جامعة مستقل." : undefined,
  };
}

export function withCatalogSource(institution: Institution): Institution {
  const source = getCatalogSourceRecord(institution);
  const verificationStatus: Institution["verificationStatus"] = institution.verificationStatus || "official-directory";
  return { ...institution, aliases: [...new Set([...(institution.aliases || []), ...source.aliases])], directorySourceUrl: institution.directorySourceUrl || source.directoryUrl, verificationStatus };
}
