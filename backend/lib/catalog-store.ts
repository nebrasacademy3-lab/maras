import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCourses, catalogInstitutions, catalogSpecialties, courseAccess, courseReviews, courseUnitsDb, institutionSpecialties, lessonsDb, videoAssets } from "@/db/schema";
import { courses as staticCourses, institutions as staticInstitutions, type Course, type Institution, type InstitutionType } from "@/lib/data";
import { getVerifiedInstitutionPrograms } from "@/lib/official-programs";
import { withCatalogSource } from "@/lib/catalog-sources";
import type { AcademicProgram } from "@/lib/academic-data";

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

function secondsLabel(total: number) {
  const minutes = Math.max(1, Math.round(total / 60));
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} س ${rest} د` : `${hours} ساعات`;
}

export async function getInstitutionsCatalog(includeHidden = false): Promise<Institution[]> {
  if (!process.env.DATABASE_URL) return staticInstitutionFallback();
  if (!includeHidden && institutionsCache && institutionsCache.expiresAt > Date.now()) return institutionsCache.value;
  if (!includeHidden && institutionsInFlight) return institutionsInFlight;
  const load = async () => {
  const db = getDb();
  const [rows, specialties, courseRows] = await Promise.all([
    db.select().from(catalogInstitutions).orderBy(asc(catalogInstitutions.sortOrder), asc(catalogInstitutions.name)),
    db.select().from(institutionSpecialties),
    db.select({ slug: catalogCourses.slug, institutionSlug: catalogCourses.institutionSlug, status: catalogCourses.status }).from(catalogCourses),
  ]);
  const overrides = new Map(rows.map((row) => [row.slug, row]));
  const courseStatus = new Map(courseRows.map((row) => [row.slug, row.status]));
  const staticCourseSlugs = new Set(staticCourses.map((course) => course.slug));
  const actualCourseCount = (slug: string) => staticCourses.filter((course) => course.universitySlug === slug && (courseStatus.get(course.slug) === undefined || courseStatus.get(course.slug) === "published")).length + courseRows.filter((course) => course.institutionSlug === slug && course.status === "published" && !staticCourseSlugs.has(course.slug)).length;
  const merged = new Map<string, Institution>();
  for (const item of staticInstitutions) {
    const row = overrides.get(item.slug);
    if (row?.status === "hidden" && !includeHidden) continue;
    merged.set(item.slug, row ? withCatalogSource({
      ...item,
      name: row.name,
      nameEn: row.nameEn,
      region: row.region,
      type: row.type as InstitutionType,
      logo: publicLogo(item.slug, row.logoUrl) || bundledLogo(item.slug),
      domain: row.domain || item.domain,
      directorySourceUrl: row.directorySourceUrl || item.directorySourceUrl,
      aliases: parseAliases(row.aliasesJson, item.aliases),
      verificationStatus: row.verificationStatus === "official-directory" ? "official-directory" : item.verificationStatus,
      specialties: specialties.filter((link) => link.institutionSlug === item.slug && link.status === "published").length || item.specialties,
      courses: actualCourseCount(item.slug),
      featured: row.featured,
    }) : withCatalogSource({ ...item, logo: bundledLogo(item.slug) }));
  }
  for (const row of rows) {
    if (merged.has(row.slug) || (row.status === "hidden" && !includeHidden)) continue;
    merged.set(row.slug, withCatalogSource({
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
      specialties: specialties.filter((link) => link.institutionSlug === row.slug && link.status === "published").length,
      courses: actualCourseCount(row.slug),
      featured: row.featured,
    }));
  }
  const value = [...merged.values()];
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
    return specialty && specialty.status === "published" ? [{ name: specialty.name, area: "إنسانية" as const, degree, verificationStatus, sourceUrl: specialty.sourceUrl || undefined }] : [];
  });
  if (linked.length) return { programs: linked, sourceUrl: institution?.domain ? `https://${institution.domain}` : "/universities", liveVerified: linked.every((program) => program.verificationStatus === "official-program") };
  return getVerifiedInstitutionPrograms(institutionSlug, institution?.domain);
}

export async function getCoursesCatalog(includeDraft = false): Promise<Course[]> {
  if (!process.env.DATABASE_URL) return staticCourses.map((item) => ({ ...item }));
  if (!includeDraft && coursesCache && coursesCache.expiresAt > Date.now()) return coursesCache.value;
  if (!includeDraft && coursesInFlight) return coursesInFlight;
  const load = async () => {
  const db = getDb();
  const [managed, units, lessons, specialties, institutions, reviews, accessRows, links, readyVideos] = await Promise.all([
    db.select().from(catalogCourses),
    db.select().from(courseUnitsDb).orderBy(asc(courseUnitsDb.position)),
    db.select().from(lessonsDb).orderBy(asc(lessonsDb.position)),
    db.select().from(catalogSpecialties),
    getInstitutionsCatalog(true),
    db.select().from(courseReviews).where(eq(courseReviews.status, "published")),
    db.select({ courseSlug: courseAccess.courseSlug }).from(courseAccess).where(isNull(courseAccess.revokedAt)),
    db.select({ institutionSlug: institutionSpecialties.institutionSlug, specialtySlug: institutionSpecialties.specialtySlug, status: institutionSpecialties.status }).from(institutionSpecialties),
    db.select({ lessonId: videoAssets.lessonId }).from(videoAssets).where(eq(videoAssets.status, "ready")),
  ]);
  const validSpecialtyLinks = new Set(links.filter((link) => link.status === "published").map((link) => `${link.institutionSlug}:${link.specialtySlug}`));
  const readyLessonIds = new Set(readyVideos.map((row) => row.lessonId));
  const reviewsByCourse = new Map<string, typeof reviews>();
  const accessCountByCourse = new Map<string, number>();
  const unitsByCourse = new Map<string, typeof units>();
  const lessonsByCourse = new Map<string, typeof lessons>();
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
    const courseBucket = lessonsByCourse.get(lesson.courseSlug) || [];
    courseBucket.push(lesson);
    lessonsByCourse.set(lesson.courseSlug, courseBucket);
    const unitBucket = lessonsByUnit.get(lesson.unitId) || [];
    unitBucket.push(lesson);
    lessonsByUnit.set(lesson.unitId, unitBucket);
  }
  const managedBySlug = new Map(managed.map((row) => [row.slug, row]));
  const result = new Map<string, Course>();
  for (const item of staticCourses) {
    const row = managedBySlug.get(item.slug);
    const linkedRow = row && validSpecialtyLinks.has(`${row.institutionSlug}:${row.specialtySlug}`) ? row : undefined;
    if (linkedRow && linkedRow.status !== "published" && !includeDraft) continue;
    const liveReviews = reviewsByCourse.get(item.slug) || [];
    const liveRating = liveReviews.length ? Math.round(liveReviews.reduce((sum, review) => sum + review.rating, 0) / liveReviews.length * 10) / 10 : 0;
    const liveStudents = accessCountByCourse.get(item.slug) || 0;
    const live = { rating: liveRating, ratingsCount: liveReviews.length, students: liveStudents };
    result.set(item.slug, linkedRow ? { ...item, ...live, title: linkedRow.title, titleEn: linkedRow.titleEn, code: linkedRow.code || undefined, description: linkedRow.description, coverImage: publicCover(item.slug, linkedRow.coverImageUrl) || item.coverImage, price: linkedRow.price, oldPrice: linkedRow.oldPrice || undefined, access: linkedRow.accessLabel, featured: linkedRow.featured, color: themes[linkedRow.coverTheme] || item.color } : { ...item, ...live });
  }
  const specialtyBySlug = new Map(specialties.map((row) => [row.slug, row.name]));
  const institutionBySlug = new Map(institutions.map((row) => [row.slug, row.name]));
  for (const row of managed) {
    if (!validSpecialtyLinks.has(`${row.institutionSlug}:${row.specialtySlug}`)) continue;
    if (result.has(row.slug) || (row.status !== "published" && !includeDraft)) continue;
    const courseUnits = (unitsByCourse.get(row.slug) || []).filter((unit) => includeDraft || unit.status === "published");
    const unitRows = courseUnits.map((unit) => ({
      title: unit.title,
      description: unit.description,
      lessons: (lessonsByUnit.get(unit.id) || []).filter((lesson) => includeDraft || lesson.status === "published").map((lesson) => ({ id: lesson.id, title: lesson.title, description: lesson.description, duration: secondsLabel(lesson.durationSeconds), free: lesson.freePreview, ready: readyLessonIds.has(lesson.id), type: "video" as const })),
    }));
    const flatLessons = unitRows.flatMap((unit) => unit.lessons);
    const durationSeconds = (lessonsByCourse.get(row.slug) || []).reduce((sum, lesson) => sum + lesson.durationSeconds, 0);
    const courseReviewsRows = reviewsByCourse.get(row.slug) || [];
    const rating = courseReviewsRows.length ? Math.round(courseReviewsRows.reduce((sum, review) => sum + review.rating, 0) / courseReviewsRows.length * 10) / 10 : 0;
    result.set(row.slug, {
      slug: row.slug,
      title: row.title,
      titleEn: row.titleEn,
      code: row.code || undefined,
      university: institutionBySlug.get(row.institutionSlug) || row.institutionSlug,
      universitySlug: row.institutionSlug,
      specialty: specialtyBySlug.get(row.specialtySlug) || row.specialtySlug,
      description: row.description,
      coverImage: publicCover(row.slug, row.coverImageUrl),
      price: row.price,
      oldPrice: row.oldPrice || undefined,
      rating,
      ratingsCount: courseReviewsRows.length,
      students: accessCountByCourse.get(row.slug) || 0,
      duration: secondsLabel(durationSeconds),
      lessons: flatLessons.length,
      updatedAt: row.updatedAt,
      instructor: "فريق مراس الأكاديمي",
      color: themes[row.coverTheme] || themes["blue-violet"],
      icon: "📚",
      featured: row.featured,
      access: row.accessLabel,
      units: unitRows,
    });
  }
  const value = [...result.values()];
  if (!includeDraft) coursesCache = { expiresAt: Date.now() + CATALOG_CACHE_TTL, value };
  return value;
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

export async function getRecommendedCourses(institutionSlug: string, specialty: string) {
  const rows = await getCoursesCatalog();
  const primary = rows.filter((course) => course.universitySlug === institutionSlug && course.specialty === specialty);
  const sameProgram = rows.filter((course) => course.specialty === specialty && !primary.some((item) => item.slug === course.slug));
  const sameInstitution = rows.filter((course) => course.universitySlug === institutionSlug && !primary.some((item) => item.slug === course.slug));
  return [...primary, ...sameProgram, ...sameInstitution].slice(0, 8);
}
