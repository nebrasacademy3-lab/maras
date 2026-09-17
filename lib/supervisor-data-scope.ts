import "server-only";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth";
import { hasPermission, ADMIN_PERMISSIONS } from "@/lib/permissions";

/** null means an explicitly global actor, a number means a restricted supervisor. */
export async function supervisorScopeId(user: SessionUser | null): Promise<number | null> {
  if (user?.role !== "supervisor") return null;
  return await hasPermission(user, ADMIN_PERMISSIONS.DATA_ALL) ? null : user.id;
}

/** Correlated predicates execute BEFORE ordering, paging and counting. No client IDs authorize scope. */
export function scopedSubjectSql(actor: number | null, institution: SQLWrapper, specialty: SQLWrapper, specialtySlug?: SQLWrapper): SQL {
  if (actor === null) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM supervisor_assignments ss
    WHERE ss.supervisor_id = ${actor} AND ss.active = true
      AND (ss.institution_slug IS NULL OR ss.institution_slug = ${institution})
      AND (ss.specialty IS NULL OR ss.specialty = ${specialty}${specialtySlug ? sql` OR ss.specialty = ${specialtySlug}` : sql``}))`;
}
export function scopedInstitutionSql(actor: number | null, slug: SQLWrapper, wholeInstitution = false): SQL {
  if (actor === null) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM supervisor_assignments sa WHERE sa.supervisor_id = ${actor}
    AND sa.active = true AND (sa.institution_slug IS NULL OR sa.institution_slug = ${slug})
    AND ${wholeInstitution ? sql`sa.specialty IS NULL` : sql`true`})`;
}
export async function supervisorInstitutionAllowed(user: SessionUser | null, slug: string) {
  const actor = await supervisorScopeId(user);
  if (actor === null) return true;
  const { getDb } = await import("@/db");
  return Boolean((await getDb().execute(sql`SELECT (${scopedInstitutionSql(actor, sql`${slug}`, true)}) AS allowed`)).rows[0]?.allowed);
}
export function scopedCourseSql(actor: number | null, slug: SQLWrapper): SQL {
  if (actor === null) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM catalog_courses sc
    LEFT JOIN catalog_specialties sp ON sp.slug = sc.specialty_slug
    WHERE sc.slug = ${slug} AND ${scopedSubjectSql(actor, sql`sc.institution_slug`, sql`sp.name`, sql`sc.specialty_slug`)}
    AND (sc.audience_scope <> 'institution' OR EXISTS (SELECT 1 FROM supervisor_assignments sa
      WHERE sa.supervisor_id = ${actor} AND sa.active = true AND sa.specialty IS NULL
        AND (sa.institution_slug IS NULL OR sa.institution_slug = sc.institution_slug))))`;
}
export function scopedLessonSql(actor: number | null, id: SQLWrapper): SQL {
  if (actor === null) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM lessons nl WHERE nl.id = ${id} AND ${scopedCourseSql(actor, sql`nl.course_slug`)})`;
}
export function scopedStudentSql(actor: number | null, value: SQLWrapper, by: "id" | "email" = "email"): SQL {
  if (actor === null) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM users su WHERE su.role = 'student'
    AND ${by === "id" ? sql`su.id = ${value}` : sql`lower(su.email) = lower(${value})`}
    AND ${scopedSubjectSql(actor, sql`su.university_slug`, sql`su.specialty`)})`;
}
export function scopedOrderSql(actor: number | null, orderNumber: SQLWrapper): SQL {
  if (actor === null) return sql`true`;
  // The entire order must be in scope. One eligible item cannot expose a mixed bundle.
  return sql`EXISTS (SELECT 1 FROM orders so WHERE so.order_number = ${orderNumber}
    AND ${scopedStudentSql(actor, sql`so.customer_email`)}
    AND ${scopedCourseSql(actor, sql`so.course_slug`)}
    AND NOT EXISTS (SELECT 1 FROM order_items si WHERE si.order_number = so.order_number
      AND NOT (${scopedCourseSql(actor, sql`si.course_slug`)})))`;
}
export function scopedRequestSql(actor: number | null, id: SQLWrapper): SQL {
  if (actor === null) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM course_requests sr WHERE sr.id = ${id}
    AND ${scopedSubjectSql(actor, sql`sr.university_slug`, sql`sr.specialty`)})`;
}

export async function supervisorCourseAllowed(user: SessionUser | null, slug: string) {
  const actor = await supervisorScopeId(user);
  if (actor === null) return true;
  const { getDb } = await import("@/db");
  return Boolean((await getDb().execute(sql`SELECT (${scopedCourseSql(actor, sql`${slug}`)}) AS allowed`)).rows[0]?.allowed);
}
export async function supervisorStudentAllowed(user: SessionUser | null, email: string) {
  const actor = await supervisorScopeId(user);
  if (actor === null) return true;
  const { getDb } = await import("@/db");
  return Boolean((await getDb().execute(sql`SELECT (${scopedStudentSql(actor, sql`${email}`)}) AS allowed`)).rows[0]?.allowed);
}
