import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCourses, courseWaitlist, notificationsDb, users } from "@/db/schema";
import { getCoursesCatalog } from "@/lib/catalog-store";

/** Only eligible courses are selected BEFORE LIMIT; unpublished waiting lists cannot starve launches. */
export async function queueCourseLaunchNotifications(courseSlug?: string, limit = 200, now = new Date()) {
  const catalog = await getCoursesCatalog();
  const launched = new Map(catalog.filter(course => course.availableForPurchase && (!courseSlug || course.slug === courseSlug)).map(course => [course.slug, course]));
  if (!launched.size) return { queued: 0, processed: 0, hasMore: false };
  const batchSize = Math.max(1, Math.min(500, Number.isFinite(limit) ? Math.floor(limit) : 200));
  const timestamp = now.toISOString();
  const db = getDb();
  return db.transaction(async tx => {
    const rows = await tx.select().from(courseWaitlist).where(and(
      eq(courseWaitlist.status, "active"),
      inArray(courseWaitlist.courseSlug, [...launched.keys()]),
      inArray(courseWaitlist.userEmail, tx.select({ email: users.email }).from(users).where(and(eq(users.role, "student"), eq(users.status, "active")))),
      // Recheck administrative closure against live rows, even when another server has an older catalog cache.
      sql`NOT EXISTS (SELECT 1 FROM ${catalogCourses} WHERE ${catalogCourses.slug} = ${courseWaitlist.courseSlug} AND (${catalogCourses.status} <> 'published' OR ${catalogCourses.enrollmentMode} = 'closed'))`,
    )).orderBy(asc(courseWaitlist.updatedAt), asc(courseWaitlist.id)).limit(batchSize).for("update", { skipLocked: true });
    let queued = 0;
    for (const row of rows) {
      const course = launched.get(row.courseSlug)!;
      // Claim and insert share a transaction: a failure rolls BOTH back. Cancellation
      // serializes on this row, and parallel dispatchers skip rows already locked.
      const [claimed] = await tx.update(courseWaitlist).set({ status: "notified", notifiedAt: timestamp, updatedAt: timestamp })
        .where(and(eq(courseWaitlist.id, row.id), eq(courseWaitlist.status, "active"), eq(courseWaitlist.activationVersion, row.activationVersion)))
        .returning({ id: courseWaitlist.id });
      if (!claimed) continue;
      const [notice] = await tx.insert(notificationsDb).values({
        userEmail: row.userEmail, audience: "student", title: "المادة التي تنتظرها أصبحت متاحة",
        body: `فُتح الاشتراك في «${course.title}». افتح صفحة المادة للاطلاع على التفاصيل والدروس المتاحة.`,
        actionUrl: `/courses/${encodeURIComponent(course.slug)}`, actionLabel: "عرض المادة", template: "success",
        dedupeKey: `waitlist:${row.id}:v${row.activationVersion}:launched`, pushEnabled: true, pushStatus: "pending", startsAt: timestamp, createdAt: timestamp,
      }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
      if (notice) queued += 1;
    }
    return { queued, processed: rows.length, hasMore: rows.length === batchSize };
  });
}
