import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCourses, catalogInstitutions, catalogSpecialties, courseAccess, courseReviews, courseUnitsDb, institutionSpecialties, lessonsDb, videoAssets } from "@/db/schema";
import { courses as staticCourses, institutions as staticInstitutions, type Course, type Institution, type InstitutionType } from "@/lib/data";
import { getVerifiedInstitutionPrograms } from "@/lib/official-programs";
import { withCatalogSource } from "@/lib/catalog-sources";
import { specialtiesEquivalent, specialtyNameVariants, type AcademicProgram } from "@/lib/academic-data";

const themes: Record<string, string> = {
  "blue-violet": "from-blue-700 to-violet-600",
  "emerald-blue": "from-emerald-600 to-blue-700",
  "orange-red": "from-orange-500 to-rose-600",
  "indigo-cyan": "from-indigo-700 to-cyan-600",
};

const CATALOG_CACHE_TTL = 20_000;
let institutionsCache: { expiresAt: number; value: Institution[] } | null = null;
let coursesCache: { expiresAt: number; value: Course[] } | null = null;
let institutionsInFlight: Promise<Institution[]> | null = null;
let coursesInFlight: Promise<Course[]> | null = null;

export function invalidateCatalogCache() {
  institutionsCache = null;
  coursesCache = null;
}

const publicLogo = (slug: string, value: string | null | undefined) => value?.startsWith("r2:") ? `/api/logos/${slug}` : value || undefined;
const publicCover = (slug: string, value: string | null | undefined) => value?.startsWith("r2:") ? `/api/covers/${slug}` : value || undefined;
const bundledLogo = (slug: string) => `/institutions/${slug}.png`;
const parseAliases = (value: string | null | undefined, fallback: string[] = []) => { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 20) : fallback; } catch { return fallback; } };
const staticInstitutionFallback = () => staticInstitutions.map((item) => withCatalogSource({ ...item, logo: bundledLogo(item.slug), courses: staticCourses.filter((course) => course.universitySlug === item.slug).length }));
const catalogDemoEnabled = () => process.env.NODE_ENV !== "production" && process.env.CATALOG_DEMO_MODE === "true";
const staticCourseFallback = () => staticCourses.map((item) => ({ ...item, ...courseReadiness(item.units) }));

function secondsLabel(total: number) {
  const minutes = Math.max(1, Math.round(total / 60));
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} س ${rest} د` : `${hours} ساعات`;
}

function courseReadiness(units: Course["units"]) {
  const lessons = units.flatMap((unit) => unit.lessons);
  const readyLessons = lessons.filter((lesson) => lesson.ready).length;
  const hasReadyPreview = lessons.some((lesson) => lesson.free && lesson.ready);
  return {
    readyLessons,
    availableForPurchase: lessons.length > 0 && readyLessons === lessons.length && hasReadyPreview,
  };
}

export async function getInstitutionsCatalog(includeHidden = false): Promise<Institution[]> {
  if (!process.env.DATABASE_URL) return catalogDemoEnabled() ? staticInstitutionFallback() : [];
  if (!includeHidden && institutionsCache && institutionsCache.expiresAt > Date.now()) return institutionsCache.value;
  if (!includeHidden && institutionsInFlight) return institutionsInFlight;
  const load = async () => {
    const db = getDb();
    const [rows, specialtyLinks, courseRows] = await Promise.all([
      db.select().from(catalogInstitutions).orderBy(asc(catalogInstitutions.sortOrder), asc(catalogInstitutions.name)),
      db.select({ institutionSlug: institutionSpecialties.institutionSlug, status: institutionSpecialties.status }).from(institutionSpecialties),
      db.select({ institutionSlug: catalogCourses.institutionSlug, status: catalogCourses.status }).from(catalogCourses),
    ]);
    const specialtyCount = new Map<string, number>();
    const courseCount = new Map<string, number>();
    for (const link of specialtyLinks) {
      if (link.status === "published") specialtyCount.set(link.institutionSlug, (specialtyCount.get(link.institutionSlug) || 0) + 1);
    }
    for (const course of courseRows) {
      if (course.status === "published") courseCount.set(course.institutionSlug, (courseCount.get(course.institutionSlug) || 0) + 1);
    }
    const value = rows.flatMap((row): Institution[] => {
      if (!includeHidden && row.status !== "published") return [];
      return [{
        slug: row.slug,
        name: row.name,
        nameEn: row.nameEn,
        region: row.region,
        type: row.type as InstitutionType,
        logo: publicLogo(row.slug, row.logoUrl),
        domain: row.domain || undefined,
        directorySourceUrl: row.directorySourceUrl || undefined,
        aliases: parseAliases(row.aliasesJson),
        verificationStatus: row.verificationStatus === "official-directory" ? "official-directory" : "pending-review",
        specialties: specialtyCount.get(row.slug) || 0,
        courses: courseCount.get(row.slug) || 0,
        featured: row.featured,
      }];
    });
    if (!includeHidden) institutionsCache = { expiresAt: Date.now() + CATALOG_CACHE_TTL, value };
    return value;
  };
  if (!includeHidden) {
    institutionsInFlight = load();
    try { return await institutionsInFlight; } finally { institutionsInFlight = null; }
  }
  return load();
}

export async function getInstitutionCatalog(slug: string, includeHidden = false) {
  return (await getInstitutionsCatalog(includeHidden)).find((item) => item.slug === slug);
}

export async function getProgramsCatalog(institutionSlug: string): Promise<{ programs: AcademicProgram[]; sourceUrl: string; liveVerified: boolean }> {
  if (!process.env.DATABASE_URL) {
    if (!catalogDemoEnabled()) return { programs: [], sourceUrl: "", liveVerified: false };
    const institution = staticInstitutionFallback().find((item) => item.slug === institutionSlug);
    return getVerifiedInstitutionPrograms(institutionSlug, institution?.domain);
  }
  const db = getDb();
  const [links, specialties, institution] = await Promise.all([
    db.select().from(institutionSpecialties).where(eq(institutionSpecialties.institutionSlug, institutionSlug)).orderBy(asc(institutionSpecialties.sortOrder)),
    db.select().from(catalogSpecialties),
    getInstitutionCatalog(institutionSlug, true),
  ]);
  const bySlug = new Map(specialties.map((item) => [item.slug, item]));
  const linked = links.filter((item) => item.status === "published").flatMap((item) => {
    const specialty = bySlug.get(item.specialtySlug);
    const degree: AcademicProgram["degree"] = specialty?.degree === "دبلوم" || specialty?.degree === "دراسات عليا" ? specialty.degree : "بكالوريوس";
    const verificationStatus: AcademicProgram["verificationStatus"] = specialty?.verificationStatus === "official-program" || specialty?.verificationStatus === "discovery" ? specialty.verificationStatus : "pending-review";
    return specialty && specialty.status === "published" ? [{ name: specialty.name, aliases: [...specialtyNameVariants(institutionSlug, specialty.name)].filter((name) => name !== specialty.name), area: "إنسانية" as const, degree, verificationStatus, sourceUrl: specialty.sourceUrl || undefined }] : [];
  });
  const sourceUrl = institution?.directorySourceUrl || (institution?.domain ? `https://${institution.domain}` : "");
  return { programs: linked, sourceUrl, liveVerified: linked.length > 0 && linked.every((program) => program.verificationStatus === "official-program") };
}

export async function getCoursesCatalog(includeDraft = false): Promise<Course[]> {
  if (!process.env.DATABASE_URL) return catalogDemoEnabled() ? staticCourseFallback() : [];
  if (!includeDraft && coursesCache && coursesCache.expiresAt > Date.now()) return coursesCache.value;
  if (!includeDraft && coursesInFlight) return coursesInFlight;
  const load = async () => {
    const db = getDb();
    const now = new Date().toISOString();
    const [managed, units, lessons, specialties, institutions, reviews, accessRows, links, readyVideos] = await Promise.all([
      db.select().from(catalogCourses),
      db.select().from(courseUnitsDb).orderBy(asc(courseUnitsDb.position)),
      db.select().from(lessonsDb).orderBy(asc(lessonsDb.position)),
      db.select().from(catalogSpecialties),
      getInstitutionsCatalog(includeDraft),
      db.select().from(courseReviews).where(eq(courseReviews.status, "published")),
      db.select({ courseSlug: courseAccess.courseSlug }).from(courseAccess).where(and(isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now)))),
      db.select({ institutionSlug: institutionSpecialties.institutionSlug, specialtySlug: institutionSpecialties.specialtySlug, status: institutionSpecialties.status }).from(institutionSpecialties),
      db.select({ lessonId: videoAssets.lessonId }).from(videoAssets).where(eq(videoAssets.status, "ready")),
    ]);
    const validSpecialtyLinks = new Set(links.filter((link) => includeDraft || link.status === "published").map((link) => `${link.institutionSlug}:${link.specialtySlug}`));
    const readyLessonIds = new Set(readyVideos.map((row) => row.lessonId));
    const reviewsByCourse = new Map<string, typeof reviews>();
    const accessCountByCourse = new Map<string, number>();
    const unitsByCourse = new Map<string, typeof units>();
    const lessonsByUnit = new Map<number, typeof lessons>();
    for (const review of reviews) {
      const bucket = reviewsByCourse.get(review.courseSlug) || [];
      bucket.push(review);
      reviewsByCourse.set(review.courseSlug, bucket);
    }
    for (const access of accessRows) accessCountByCourse.set(access.courseSlug, (accessCountByCourse.get(access.courseSlug) || 0) + 1);
    for (const unit of units) {
      const bucket = unitsByCourse.get(unit.courseSlug) || [];
      bucket.push(unit);
      unitsByCourse.set(unit.courseSlug, bucket);
    }
    for (const lesson of lessons) {
      const bucket = lessonsByUnit.get(lesson.unitId) || [];
      bucket.push(lesson);
      lessonsByUnit.set(lesson.unitId, bucket);
    }
    const specialtyBySlug = new Map(specialties.map((row) => [row.slug, row]));
    const institutionBySlug = new Map(institutions.map((row) => [row.slug, row]));
    const result: Course[] = [];
    for (const row of managed) {
      if (!includeDraft && row.status !== "published") continue;
      if (!validSpecialtyLinks.has(`${row.institutionSlug}:${row.specialtySlug}`)) continue;
      const institution = institutionBySlug.get(row.institutionSlug);
      const specialty = specialtyBySlug.get(row.specialtySlug);
      if (!institution || !specialty || (!includeDraft && specialty.status !== "published")) continue;
      const courseUnits = (unitsByCourse.get(row.slug) || []).filter((unit) => includeDraft || unit.status === "published");
      const visibleLessons = courseUnits.flatMap((unit) => (lessonsByUnit.get(unit.id) || []).filter((lesson) => includeDraft || lesson.status === "published"));
      const unitRows = courseUnits.map((unit) => ({
        title: unit.title,
        description: unit.description,
        lessons: (lessonsByUnit.get(unit.id) || []).filter((lesson) => includeDraft || lesson.status === "published").map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          duration: lesson.durationSeconds > 0 ? secondsLabel(lesson.durationSeconds) : "بانتظار الفيديو",
          free: lesson.freePreview,
          ready: readyLessonIds.has(lesson.id),
          type: "video" as const,
        })),
      }));
      const courseReviewsRows = reviewsByCourse.get(row.slug) || [];
      const rating = courseReviewsRows.length ? Math.round(courseReviewsRows.reduce((sum, review) => sum + review.rating, 0) / courseReviewsRows.length * 10) / 10 : 0;
      const durationSeconds = visibleLessons.reduce((sum, lesson) => sum + lesson.durationSeconds, 0);
      result.push({
        slug: row.slug,
        title: row.title,
        titleEn: row.titleEn,
        code: row.code || undefined,
        university: institution.name,
        universitySlug: row.institutionSlug,
        specialty: specialty.name,
        description: row.description,
        coverImage: publicCover(row.slug, row.coverImageUrl),
        price: row.price,
        oldPrice: row.oldPrice || undefined,
        rating,
        ratingsCount: courseReviewsRows.length,
        students: accessCountByCourse.get(row.slug) || 0,
        duration: secondsLabel(durationSeconds),
        lessons: visibleLessons.length,
        updatedAt: row.updatedAt,
        instructor: "فريق مراس الأكاديمي",
        color: themes[row.coverTheme] || themes["blue-violet"],
        icon: "📚",
        featured: row.featured,
        access: row.accessLabel,
        units: unitRows,
        ...courseReadiness(unitRows),
      });
    }
    if (!includeDraft) coursesCache = { expiresAt: Date.now() + CATALOG_CACHE_TTL, value: result };
    return result;
  };
  if (!includeDraft) {
    coursesInFlight = load();
    try { return await coursesInFlight; } finally { coursesInFlight = null; }
  }
  return load();
}

export async function getCourseCatalog(slug: string, includeDraft = false) {
  return (await getCoursesCatalog(includeDraft)).find((item) => item.slug === slug);
}

export function selectRecommendedCourses(rows: Course[], institutionSlug: string, specialty: string, ownedCourseSlugs: Iterable<string> = []) {
  const owned = new Set(ownedCourseSlugs);
  const candidates = rows.filter((course) => course.availableForPurchase === true && !owned.has(course.slug));
  const matchesProgram = (course: Course) => specialtiesEquivalent(institutionSlug, specialty, course.universitySlug, course.specialty);
  const primary = candidates.filter((course) => course.universitySlug === institutionSlug && matchesProgram(course));
  const sameProgram = candidates.filter((course) => matchesProgram(course) && course.universitySlug !== institutionSlug);
  const sameInstitution = candidates.filter((course) => course.universitySlug === institutionSlug && !matchesProgram(course));
  return [...primary, ...sameProgram, ...sameInstitution].slice(0, 8);
}

export async function getRecommendedCourses(institutionSlug: string, specialty: string, ownedCourseSlugs: Iterable<string> = []) {
  return selectRecommendedCourses(await getCoursesCatalog(), institutionSlug, specialty, ownedCourseSlugs);
}
