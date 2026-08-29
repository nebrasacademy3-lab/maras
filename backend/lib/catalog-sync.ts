import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCourses, catalogInstitutions, catalogSpecialties, courseUnitsDb, institutionSpecialties, lessonsDb } from "@/db/schema";
import { getInstitutionPrograms, getProgramCourses, type AcademicProgram } from "@/lib/academic-data";
import { getInstitutionsCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { courses as staticCourses, type Course, type CourseUnit } from "@/lib/data";
import { courseSlug, lessonId, specialtySlug, templateDescription, templateLessonDescription, templateLessons, templateUnitDescription, templateUnits, templateCourseCode } from "@/lib/catalog-templates";

export type CatalogSeedMode = "core" | "full";

const chunk = <T,>(rows: T[], size = 400) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

async function insertChunks<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (const batch of chunk(rows)) if (batch.length) await insert(batch);
}

function programSource(program: AcademicProgram, institution: { domain?: string; directorySourceUrl?: string }) {
  return program.sourceUrl || institution.directorySourceUrl || (institution.domain ? `https://${institution.domain}` : null);
}

function durationSeconds(value: string) {
  const match = value.trim().match(/^(\d{1,3}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function courseTheme(course: Course, index: number) {
  if (course.color.includes("emerald") || course.color.includes("teal")) return "emerald-blue";
  if (course.color.includes("orange") || course.color.includes("rose") || course.color.includes("amber")) return "orange-red";
  if (course.color.includes("violet") || course.color.includes("fuchsia")) return "blue-violet";
  return index % 2 ? "indigo-cyan" : "blue-violet";
}

function completeStaticOutline(course: Course): CourseUnit[] {
  const units = course.units.map((unit) => ({ ...unit, lessons: [...unit.lessons] }));
  const additions = [
    { title: "التمارين والتطبيقات الشاملة", description: `تطبيقات متدرجة تغطي أهم مهارات ${course.title}.`, lessons: [] },
    { title: "المراجعة والاستعداد للاختبار", description: `مراجعة منظمة ونماذج تدريبية لمادة ${course.title}.`, lessons: [] },
  ];
  while (units.length < 4) units.push(additions[units.length % additions.length]);
  const existing = units.reduce((sum, unit) => sum + unit.lessons.length, 0);
  for (let index = existing; index < course.lessons; index += 1) {
    const target = units[index % units.length];
    const ordinal = index - existing + 1;
    const title = index % 3 === 0
      ? `تطبيق شامل ${ordinal} في ${course.title}`
      : index % 3 === 1
        ? `حل تمارين وتثبيت المفاهيم ${ordinal}`
        : `مراجعة واختبار تدريبي ${ordinal}`;
    target.lessons.push({
      id: lessonId(course.slug, index + 1, title),
      title,
      description: templateLessonDescription(course.title, title),
      duration: "درس",
    });
  }
  return units;
}

export async function syncCatalogTemplates(templatePrice = 49, mode: CatalogSeedMode = "core") {
  const db = getDb();
  const now = new Date().toISOString();
  const institutions = await getInstitutionsCatalog(true);
  const institutionBySlug = new Map(institutions.map((institution) => [institution.slug, institution]));
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
  const linked = new Set<string>();
  const programsByInstitution = new Map<string, AcademicProgram[]>();

  const ensureSpecialty = (name: string, program?: AcademicProgram, institution?: typeof institutions[number]) => {
    let specialty = specialtyByName.get(name);
    if (!specialty) {
      specialty = {
        slug: specialtySlug(name),
        name,
        description: `خطة تعلم منظمة لتخصص ${name} مع مواد تأسيسية وتطبيقية ومشروع ختامي.`,
        sourceUrl: program && institution ? programSource(program, institution) as string | null : institution?.directorySourceUrl || null,
        verifiedAt: now.slice(0, 10),
        verificationStatus: program?.verificationStatus || "discovery",
        faculty: null,
        degree: program?.degree || "بكالوريوس",
        status: "published",
        createdAt: now,
        updatedAt: now,
      };
      specialtyByName.set(name, specialty as typeof existingSpecialties[number]);
      specialtyRows.push(specialty);
    }
    return specialty;
  };
  const ensureLink = (institutionSlug: string, specialtyName: string, sortOrder: number) => {
    const specialty = ensureSpecialty(specialtyName, undefined, institutionBySlug.get(institutionSlug));
    const key = `${institutionSlug}:${specialty.slug}`;
    if (!linked.has(key)) {
      linked.add(key);
      linkRows.push({ institutionSlug, specialtySlug: specialty.slug, sortOrder, status: "published" });
    }
    return specialty;
  };

  for (const institution of institutions) {
    const programs = getInstitutionPrograms(institution.slug);
    programsByInstitution.set(institution.slug, programs);
    for (const [index, program] of programs.entries()) {
      const specialty = ensureSpecialty(program.name, program, institution);
      const key = `${institution.slug}:${specialty.slug}`;
      if (!linked.has(key)) {
        linked.add(key);
        linkRows.push({ institutionSlug: institution.slug, specialtySlug: specialty.slug, sortOrder: index, status: "published" });
      }
    }
  }
  for (const course of staticCourses) ensureLink(course.universitySlug, course.specialty, 0);
  await insertChunks(specialtyRows, async (batch) => db.insert(catalogSpecialties).values(batch).onConflictDoNothing());
  await insertChunks(linkRows, async (batch) => db.insert(institutionSpecialties).values(batch).onConflictDoNothing());

  const existingCourses = await db.select({ slug: catalogCourses.slug }).from(catalogCourses);
  const existingCourseSlugs = new Set(existingCourses.map((course) => course.slug));
  const scheduledCourseSlugs = new Set(existingCourseSlugs);
  const courseRows: typeof catalogCourses.$inferInsert[] = [];
  const targetCourseSlugs = new Set<string>();

  for (const [index, course] of staticCourses.entries()) {
    targetCourseSlugs.add(course.slug);
    if (existingCourseSlugs.has(course.slug)) continue;
    const specialty = ensureSpecialty(course.specialty, undefined, institutionBySlug.get(course.universitySlug));
    courseRows.push({
      slug: course.slug,
      institutionSlug: course.universitySlug,
      specialtySlug: specialty.slug,
      title: course.title,
      titleEn: course.titleEn,
      code: course.code || null,
      description: course.description,
      price: course.price,
      oldPrice: course.oldPrice || null,
      accessLabel: course.access,
      sourceUrl: institutionBySlug.get(course.universitySlug)?.directorySourceUrl || null,
      verifiedAt: now.slice(0, 10),
      status: "published",
      featured: Boolean(course.featured),
      coverTheme: courseTheme(course, index),
      createdAt: now,
      updatedAt: now,
    });
    scheduledCourseSlugs.add(course.slug);
  }

  if (mode === "full") {
    for (const institution of institutions) {
      for (const program of programsByInstitution.get(institution.slug) || []) {
        const specialty = specialtyByName.get(program.name);
        if (!specialty) continue;
        for (const courseName of getProgramCourses(program)) {
          const slug = courseSlug(institution.slug, program.name, courseName);
          targetCourseSlugs.add(slug);
          if (scheduledCourseSlugs.has(slug)) continue;
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
          scheduledCourseSlugs.add(slug);
        }
      }
    }
  }
  await insertChunks(courseRows, async (batch) => db.insert(catalogCourses).values(batch).onConflictDoNothing());

  const allManagedCourses = (await db.select({ slug: catalogCourses.slug, title: catalogCourses.title }).from(catalogCourses)).filter((course) => targetCourseSlugs.has(course.slug));
  const existingUnits = await db.select().from(courseUnitsDb).orderBy(asc(courseUnitsDb.position));
  const unitCount = new Map<string, number>();
  for (const unit of existingUnits) unitCount.set(unit.courseSlug, (unitCount.get(unit.courseSlug) || 0) + 1);
  const staticBySlug = new Map(staticCourses.map((course) => [course.slug, course]));
  const unitRows: typeof courseUnitsDb.$inferInsert[] = [];
  for (const course of allManagedCourses) {
    if ((unitCount.get(course.slug) || 0) > 0) continue;
    const staticCourse = staticBySlug.get(course.slug);
    const outline = staticCourse ? completeStaticOutline(staticCourse) : templateUnits.map((title) => ({ title, description: templateUnitDescription(course.title, title), lessons: [] }));
    outline.forEach((unit, position) => unitRows.push({
      courseSlug: course.slug,
      title: unit.title,
      description: unit.description || templateUnitDescription(course.title, unit.title),
      position,
      status: "published",
      createdAt: now,
      updatedAt: now,
    }));
  }
  await insertChunks(unitRows, async (batch) => db.insert(courseUnitsDb).values(batch));

  const refreshedUnits = await db.select().from(courseUnitsDb).orderBy(asc(courseUnitsDb.position));
  const unitsByCourse = new Map<string, typeof refreshedUnits>();
  for (const unit of refreshedUnits) unitsByCourse.set(unit.courseSlug, [...(unitsByCourse.get(unit.courseSlug) || []), unit]);
  const existingLessons = await db.select({ id: lessonsDb.id, courseSlug: lessonsDb.courseSlug }).from(lessonsDb);
  const lessonCount = new Map<string, number>();
  for (const lesson of existingLessons) lessonCount.set(lesson.courseSlug, (lessonCount.get(lesson.courseSlug) || 0) + 1);
  const lessonsRows: typeof lessonsDb.$inferInsert[] = [];

  for (const course of allManagedCourses) {
    if ((lessonCount.get(course.slug) || 0) > 0) continue;
    const units = (unitsByCourse.get(course.slug) || []).sort((left, right) => left.position - right.position);
    const staticCourse = staticBySlug.get(course.slug);
    if (staticCourse) {
      const outline = completeStaticOutline(staticCourse);
      let globalPosition = 0;
      outline.forEach((unit, unitIndex) => unit.lessons.forEach((lesson, position) => {
        const targetUnit = units[unitIndex];
        if (!targetUnit) return;
        globalPosition += 1;
        lessonsRows.push({
          id: lesson.id || lessonId(course.slug, globalPosition, lesson.title),
          courseSlug: course.slug,
          unitId: targetUnit.id,
          title: lesson.title,
          description: lesson.description || templateLessonDescription(course.title, lesson.title),
          position,
          durationSeconds: durationSeconds(lesson.duration),
          freePreview: Boolean(lesson.free),
          videoAssetId: null,
          status: "published",
          createdAt: now,
          updatedAt: now,
        });
      }));
      continue;
    }
    const names = templateLessons(course.title);
    names.forEach((title, index) => {
      const unit = units[Math.min(units.length - 1, Math.floor(index * Math.max(1, units.length) / names.length))];
      if (!unit) return;
      lessonsRows.push({
        id: lessonId(course.slug, index + 1, title),
        courseSlug: course.slug,
        unitId: unit.id,
        title,
        description: templateLessonDescription(course.title, title),
        position: index,
        durationSeconds: 0,
        freePreview: index === 0,
        videoAssetId: null,
        status: "published",
        createdAt: now,
        updatedAt: now,
      });
    });
  }
  await insertChunks(lessonsRows, async (batch) => db.insert(lessonsDb).values(batch).onConflictDoNothing());
  invalidateCatalogCache();

  return {
    mode,
    institutions: institutionRows.length,
    specialties: specialtyRows.length,
    links: linkRows.length,
    courses: courseRows.length,
    units: unitRows.length,
    lessons: lessonsRows.length,
    totalInstitutions: institutions.length,
    coreCourses: staticCourses.length,
  };
}
