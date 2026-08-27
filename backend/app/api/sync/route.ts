import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

const signature = (table: string, timestampColumn = "updated_at", where?: ReturnType<typeof sql>) =>
  sql`(SELECT count(*)::text || ':' || coalesce(max(${sql.raw(timestampColumn)}), '') FROM ${sql.raw(table)} ${where || sql``})`;

export async function GET(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("طلب غير مسموح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);

  try {
    const limited = await checkRateLimit("sync-heartbeat", `${user.id}:${clientIp(request)}`, 20, 60);
    if (!limited) return jsonError("طلبات مزامنة كثيرة. حاول لاحقًا.", 429);

    const db = getDb();
    const email = user.email;
    const id = user.id;
    const role = user.role;
    const catalog = sql`md5(concat_ws('|',
      ${signature("catalog_institutions")},
      ${signature("catalog_specialties")},
      ${signature("catalog_courses")},
      ${signature("course_units")},
      ${signature("lessons")},
      ${signature("video_assets")},
      ${signature("platform_settings")}
    ))`;

    const account = role === "student"
      ? sql`md5(concat_ws('|',
          ${signature("users", "updated_at", sql`WHERE id = ${id}`)},
          ${signature("course_access", "starts_at", sql`WHERE user_email = ${email}`)},
          ${signature("lesson_progress", "updated_at", sql`WHERE user_email = ${email}`)},
          ${signature("favorites", "created_at", sql`WHERE user_email = ${email}`)},
          ${signature("cart_items", "created_at", sql`WHERE user_email = ${email}`)}
        ))`
      : sql`md5('not-applicable')`;

    const commerce = role === "student"
      ? sql`md5(${signature("orders", "updated_at", sql`WHERE customer_email = ${email}`)})`
      : sql`md5('not-applicable')`;

    const support = role === "student"
      ? sql`md5(${signature("support_tickets", "updated_at", sql`WHERE user_email = ${email}`)})`
      : role === "supervisor"
        ? sql`md5(${signature("support_tickets", "updated_at")})`
        : sql`md5('not-applicable')`;

    const notifications = role === "student"
      ? sql`md5(${signature("notifications", "created_at", sql`WHERE user_email = ${email} OR (user_email IS NULL AND audience = ${role})`)})`
      : sql`md5('not-applicable')`;
    const requests = role === "student"
      ? sql`md5(${signature("course_requests", "updated_at", sql`WHERE user_id = ${id}`)})`
      : sql`md5('not-applicable')`;

    const supervisor = role === "supervisor"
      ? sql`md5(${signature("course_requests", "updated_at")})`
      : sql`md5('not-applicable')`;

    const admin = role === "admin"
      ? sql`md5(concat_ws('|', ${signature("users")}, ${signature("course_requests")}, ${signature("support_tickets")}, ${signature("orders")}, ${signature("notifications", "created_at")}, ${signature("platform_settings")}))`
      : sql`md5('not-applicable')`;

    const result = await db.execute(sql`
      SELECT
        ${catalog} AS catalog,
        ${account} AS account,
        ${commerce} AS commerce,
        ${support} AS support,
        ${notifications} AS notifications,
        ${requests} AS requests,
        ${supervisor} AS supervisor,
        ${admin} AS admin
    `);
    const row = (result.rows[0] || {}) as Record<string, unknown>;

    const value = (key: string) => typeof row[key] === "string" ? row[key] as string : "0";
    return Response.json({
      ok: true,
      serverTime: new Date().toISOString(),
      channels: {
        catalog: value("catalog"),
        account: value("account"),
        commerce: value("commerce"),
        support: value("support"),
        notifications: value("notifications"),
        requests: value("requests"),
        supervisor: value("supervisor"),
        admin: value("admin"),
      },
      version: value("catalog"),
    }, { headers: mobileNoStoreHeaders });
  } catch {
    return jsonError("تعذر مزامنة الحالة", 503);
  }
}
