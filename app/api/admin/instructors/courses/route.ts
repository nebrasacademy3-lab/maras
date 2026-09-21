import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCourses, catalogInstitutions, catalogSpecialties } from "@/db/schema";
import { checkRateLimit } from "@/lib/auth";
import { instructorAdmin, InstructorError } from "@/lib/instructor-security";
import { instructorApiError, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await instructorAdmin(request);
    if (!await checkRateLimit("instructor-course-picker", String(actor.id), 60, 60)) throw new InstructorError("طلبات كثيرة", 429);
    const courses = await getDb().select({ slug: catalogCourses.slug, title: catalogCourses.title, status: catalogCourses.status, institution: catalogInstitutions.name, specialty: catalogSpecialties.name })
      .from(catalogCourses).leftJoin(catalogInstitutions, eq(catalogCourses.institutionSlug, catalogInstitutions.slug))
      .leftJoin(catalogSpecialties, eq(catalogCourses.specialtySlug, catalogSpecialties.slug))
      .where(eq(catalogCourses.status, "published")).orderBy(asc(catalogCourses.title));
    return Response.json({ ok: true, courses: courses.map(course => ({ ...course, institution: course.institution || "", specialty: course.specialty || "" })) }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
  } catch (error) { return instructorApiError(error); }
}
