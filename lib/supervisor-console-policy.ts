import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { scopedCourseSql, scopedRequestSql, scopedStudentSql, scopedSubjectSql, supervisorScopeId } from "@/lib/supervisor-data-scope";

/** Resolve EXISTING records as well as proposed destinations. Never trust a client course label. */
export async function supervisorConsoleMutationAllowed(user: SessionUser | null, body: Record<string, unknown>) {
  const actor = await supervisorScopeId(user);
  if (actor === null) return true;
  const number = (value: unknown) => (typeof value === "number" || typeof value === "string") && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : -1;
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const course = (value: unknown) => scopedCourseSql(actor, sql`${text(value)}`);
  const student = (value: unknown, by: "id" | "email" = "email") => scopedStudentSql(actor, sql`${by === "id" ? number(value) : text(value).toLowerCase()}`, by);
  const request = (value: unknown) => scopedRequestSql(actor, sql`${number(value)}`);
  const check = async (condition: SQL) => Boolean((await getDb().execute(sql`SELECT (${condition}) AS allowed`)).rows[0]?.allowed);
  const id = number(body.id);
  const action = text(body.action);
  if (action === "saveCourse") {
    const destination = sql`EXISTS (SELECT 1 FROM catalog_specialties ds WHERE ds.slug = ${text(body.specialtySlug)}
      AND ${scopedSubjectSql(actor, sql`${text(body.institutionSlug)}`, sql`ds.name`, sql`ds.slug`)})`;
    const old = sql`NOT EXISTS (SELECT 1 FROM catalog_courses oc WHERE oc.slug = ${text(body.slug)}) OR ${course(body.slug)}`;
    const audience = body.audienceScope === "institution" ? sql`EXISTS (SELECT 1 FROM supervisor_assignments sa
      WHERE sa.supervisor_id = ${actor} AND sa.active = true AND sa.specialty IS NULL
        AND (sa.institution_slug IS NULL OR sa.institution_slug = ${text(body.institutionSlug)}))` : sql`true`;
    return check(sql`(${old}) AND ${destination} AND ${audience}`);
  }
  if (action === "saveUnit") return check(sql`${course(body.courseSlug)} AND (${id} = -1 OR EXISTS
    (SELECT 1 FROM course_units cu WHERE cu.id = ${id} AND cu.course_slug = ${text(body.courseSlug)}))`);
  if (action === "saveLesson") return check(sql`${course(body.courseSlug)} AND NOT EXISTS
    (SELECT 1 FROM lessons sl WHERE sl.id = ${text(body.id)} AND sl.course_slug <> ${text(body.courseSlug)})`);
  if (action === "updateUser") return check(student(body.id, "id"));
  if (action === "updateStudentProfile") return check(sql`${student(body.id, "id")} AND
    ${scopedSubjectSql(actor, sql`${text(body.universitySlug)}`, sql`${text(body.specialty)}`)}`);
  if (action === "grantAccess") return check(sql`${student(body.userId, "id")} AND ${course(body.courseSlug)}`);
  if (action === "updateAccess") return check(sql`EXISTS (SELECT 1 FROM course_access ca WHERE ca.id = ${id}
    AND ${scopedStudentSql(actor, sql`ca.user_id`, "id")} AND ${scopedCourseSql(actor, sql`ca.course_slug`)})`);
  if (action === "revokeUserSession") return check(sql`EXISTS (SELECT 1 FROM auth_sessions se WHERE se.id = ${number(body.sessionId ?? body.id)}
    AND ${scopedStudentSql(actor, sql`se.user_id`, "id")})`);
  if (action === "prepareRequest" || action === "updateRequest") return check(sql`${request(body.id)} AND
    ${body.courseSlug ? course(body.courseSlug) : sql`true`}`);
  if (action === "updateTicket") return check(sql`EXISTS (SELECT 1 FROM support_tickets st WHERE st.id = ${id}
    AND ${scopedStudentSql(actor, sql`st.user_id`, "id")})`);
  if (action === "updateReview") return check(sql`EXISTS (SELECT 1 FROM course_reviews rv WHERE rv.id = ${id}
    AND ${scopedCourseSql(actor, sql`rv.course_slug`)})`);
  if (action === "saveCoupon") return check(sql`${course(body.courseSlug)} AND NOT EXISTS
    (SELECT 1 FROM coupons cp WHERE cp.code = ${text(body.code).toUpperCase()} AND NOT (${scopedCourseSql(actor, sql`cp.course_slug`)}))`);
  if (action === "saveSettings") return true; // Explicit global settings capability; no student records.
  if (action === "deleteEntity") {
    const key = number(body.entityId), slug = text(body.entityId);
    switch (body.entityType) {
      case "course": return check(course(slug));
      case "user": return check(student(key, "id"));
      case "course_request": return check(request(key));
      case "unit": return check(sql`EXISTS (SELECT 1 FROM course_units d WHERE d.id = ${key} AND ${scopedCourseSql(actor, sql`d.course_slug`)})`);
      case "lesson": return check(sql`EXISTS (SELECT 1 FROM lessons d WHERE d.id = ${slug} AND ${scopedCourseSql(actor, sql`d.course_slug`)})`);
      case "video": return check(sql`EXISTS (SELECT 1 FROM video_assets d WHERE d.id = ${key} AND ${scopedCourseSql(actor, sql`d.course_slug`)})`);
      case "review": return check(sql`EXISTS (SELECT 1 FROM course_reviews d WHERE d.id = ${key} AND ${scopedCourseSql(actor, sql`d.course_slug`)})`);
      case "support_ticket": return check(sql`EXISTS (SELECT 1 FROM support_tickets d WHERE d.id = ${key} AND ${scopedStudentSql(actor, sql`d.user_id`, "id")})`);
      case "coupon": return check(sql`EXISTS (SELECT 1 FROM coupons d WHERE d.code = ${slug.toUpperCase()} AND ${scopedCourseSql(actor, sql`d.course_slug`)})`);
      default: return false;
    }
  }
  return false;
}
