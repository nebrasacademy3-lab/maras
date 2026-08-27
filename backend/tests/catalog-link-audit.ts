import { institutions, courses } from "../lib/data";
import { getInstitutionPrograms } from "../lib/academic-data";

const institutionSlugs = new Set(institutions.map((row) => row.slug));
const courseInstitutionErrors = courses.filter((row) => !institutionSlugs.has(row.universitySlug));
const courseProgramErrors = courses.filter((row) => !getInstitutionPrograms(row.universitySlug).some((program) => program.name === row.specialty || program.aliases?.includes(row.specialty)));
const duplicateInstitutionSlugs = institutions.map((row) => row.slug).filter((slug, index, rows) => rows.indexOf(slug) !== index);
const programCounts = institutions.map((row) => ({ slug: row.slug, programs: getInstitutionPrograms(row.slug).length })).sort((a, b) => a.programs - b.programs);
console.log(JSON.stringify({
  institutions: institutions.length,
  courses: courses.length,
  duplicateInstitutionSlugs,
  courseInstitutionErrors: courseInstitutionErrors.map((row) => ({ slug: row.slug, universitySlug: row.universitySlug })),
  courseProgramErrors: courseProgramErrors.map((row) => ({ slug: row.slug, universitySlug: row.universitySlug, specialty: row.specialty })),
  institutionsWithoutPrograms: programCounts.filter((row) => row.programs === 0),
  programRelationCount: programCounts.reduce((sum, row) => sum + row.programs, 0),
}, null, 2));
