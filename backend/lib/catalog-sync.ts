import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCourses, catalogInstitutions, catalogSpecialties, courseUnitsDb, institutionSpecialties, lessonsDb } from "@/db/schema";
import { getInstitutionPrograms, getProgramCourses, type AcademicProgram } from "@/lib/academic-data";
import { getInstitutionsCatalog } from "@/lib/catalog-store";
import { courseSlug, lessonId, specialtySlug, templateDescription, templateLessonDescription, templateLessons, templateUnitDescription, templateUnits, templateCourseCode } from "@/lib/catalog-templates";

const chunk = <T,>(rows: T[], size = 400) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

async function insertChunks<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (const batch of chunk(rows)) if (batch.length) await insert(batch);
}

function programSource(program: AcademicProgram, institution: { domain?: string; directorySourceUrl?: string }) {
  return program.sourceUrl || institution.directorySourceUrl || (institution.domain ? `https://${institution.domain}` : null);
}

export async function syncCatalogTemplates(templatePrice = 49) {
  const db = getDb();
  const now = new Date().toISOString();
  const institutions = await getInstitutionsCatalog(true);
  const existingInstitutions = await db.select({ slug: catalogInstitutions.slug }).from(catalogInstitutions);
  const existingInstitutionSlugs = new Set(existingInstitutions.map((row) => row.slug));
  const institutionRows = institutions.filter((institution) => !existingInstitutionSlugs.has(institution.slug)).map((institution, index) => ({
    slug: institution.slug,
    name: institution.name,
    nameEn: institution.nameEn || institution.name,
    region: institution.region,
    type: institution.type,
    domain: institution.domain || null,
    logoUrl: null,
    directorySourceUrl: institution.directorySourceUrl || null,
    verificationStatus: "official-directory",
    aliasesJson: JSON.stringify(institution.aliases || []),
    status: "published",
    featured: Boolean(institution.featured),
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }));
  await insertChunks(institutionRows, async (batch) => db.insert(catalogInstitutions).values(batch).onConflictDoNothing());

  const existingSpecialties = await db.select().from(catalogSpecialties);
  const specialtyByName = new Map(existingSpecialties.map((specialty) => [specialty.name, specialty]));
  const specialtyRows: typeof catalogSpecialties.$inferInsert[] = [];
  const linkRows: typeof institutionSpecialties.$inferInsert[] = [];
  const programsByInstitution = new Map<string, AcademicProgram[]>();
  for (const institution of institutions) {
    const programs = getInstitutionPrograms(institution.slug);
    programsByInstitution.set(institution.slug, programs);
    for (const program of programs) {
      let specialty = specialtyByName.get(program.name);
      if (!specialty) {
        specialty = {
          slug: specialtySlug(program.name),
          name: program.name,
          description: `خطة تعلم منظمة لتخصص ${program.name} مع مواد تأسيسية وتطبيقية ومشروع ختامي.`,
          sourceUrl: programSource(program, institution) as string | null,
          verifiedAt: now.slice(0, 10),
          verificationStatus: program.verificationStatus || "discovery",
          faculty: null,
          degree: program.degree,
          status: "published",
          createdAt: now,
          updatedAt: now,
        };
        specialtyByName.set(program.name, specialty as typeof existingSpecialties[number]);
        specialtyRows.push(specialty);
      }
      linkRows.push({ institutionSlug: institution.slug, specialtySlug: specialty.slug, sortOrder: programs.indexOf(program), status: "published" });
    }
  }
  await insertChunks(specialtyRows, async (batch) => db.insert(catalogSpecialties).values(batch).onConflictDoNothing());
  await insertChunks(linkRows, async (batch) => db.insert(institutionSpecialties).values(batch).onConflictDoNothing());

  const existingCourses = await db.select({ slug: catalogCourses.slug }).from(catalogCourses);
  const existingCourseSlugs = new Set(existingCourses.map((course) => course.slug));
  const courseRows: typeof catalogCourses.$inferInsert[] = [];
  for (const institution of institutions) {
    const programs = programsByInstitution.get(institution.slug) || [];
    for (const program of programs) {
      const specialty = specialtyByName.get(program.name);
      if (!specialty) continue;
      for (const courseName of getProgramCourses(program)) {
        const slug = courseSlug(institution.slug, program.name, courseName);
        if (existingCourseSlugs.has(slug)) continue;
        existingCourseSlugs.add(slug);
        courseRows.push({
          slug,
          institutionSlug: institution.slug,
          specialtySlug: specialty.slug,
          title: courseName,
          titleEn: courseName,
          code: templateCourseCode(institution.slug, program, courseName),
          description: templateDescription(institution.name, program, courseName),
          price: templatePrice,
          oldPrice: null,
          accessLabel: "90 يومًا",
          sourceUrl: programSource(program, institution) as string | null,
          verifiedAt: now.slice(0, 10),
          status: "published",
          featured: false,
          coverTheme: "blue-violet",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
  await insertChunks(courseRows, async (batch) => db.insert(catalogCourses).values(batch).onConflictDoNothing());

  const allManagedCourses = await db.select({ slug: catalogCourses.slug, title: catalogCourses.title }).from(catalogCourses);
  const allUnits = await db.select().from(courseUnitsDb).orderBy(asc(courseUnitsDb.position));
  const unitNamesByCourse = new Map<string, Set<string>>();
  for (const unit of allUnits) { const names = unitNamesByCourse.get(unit.courseSlug) || new Set<string>(); names.add(unit.title); unitNamesByCourse.set(unit.courseSlug, names); }
  const unitRows: typeof courseUnitsDb.$inferInsert[] = [];
  for (const course of allManagedCourses) {
    const existingNames = unitNamesByCourse.get(course.slug) || new Set<string>();
    templateUnits.forEach((title, position) => { if (!existingNames.has(title)) unitRows.push({ courseSlug: course.slug, title, description: templateUnitDescription(course.title, title), position, status: "published", createdAt: now, updatedAt: now }); });
  }
  await insertChunks(unitRows, async (batch) => db.insert(courseUnitsDb).values(batch));

  const refreshedUnits = await db.select().from(courseUnitsDb).orderBy(asc(courseUnitsDb.position));
  const unitsByCourse = new Map<string, typeof refreshedUnits>();
  for (const unit of refreshedUnits) unitsByCourse.set(unit.courseSlug, [...(unitsByCourse.get(unit.courseSlug) || []), unit]);
  const lessonsRows: typeof lessonsDb.$inferInsert[] = [];
  const courseTitleBySlug = new Map(allManagedCourses.map((course) => [course.slug, course.title]));
  for (const course of allManagedCourses) {
    const title = courseTitleBySlug.get(course.slug) || course.slug;
    const units = (unitsByCourse.get(course.slug) || []).sort((a, b) => a.position - b.position).slice(0, templateUnits.length);
    const names = templateLessons(title);
    names.forEach((lessonTitle, index) => {
      const unit = units[Math.min(templateUnits.length - 1, Math.floor(index / 2))];
      if (!unit) return;
      lessonsRows.push({ id: lessonId(course.slug, index + 1), courseSlug: course.slug, unitId: unit.id, title: lessonTitle, description: templateLessonDescription(title, lessonTitle), position: index, durationSeconds: 0, freePreview: index === 0, videoAssetId: null, status: "published", createdAt: now, updatedAt: now });
    });
  }
  const existingLessons = await db.select({ id: lessonsDb.id }).from(lessonsDb);
  const existingLessonIds = new Set(existingLessons.map((lesson) => lesson.id));
  await insertChunks(lessonsRows.filter((lesson) => !existingLessonIds.has(lesson.id)), async (batch) => db.insert(lessonsDb).values(batch).onConflictDoNothing());

  return { institutions: institutionRows.length, specialties: specialtyRows.length, links: linkRows.length, courses: courseRows.length, units: unitRows.length, lessons: lessonsRows.filter((lesson) => !existingLessonIds.has(lesson.id)).length, totalInstitutions: institutions.length };
}
