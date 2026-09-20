import { and, eq, isNull, or } from "drizzle-orm";
import { notificationsDb } from "@/db/schema";

/** ID-bound private notices never become broadcasts when the email changes.
 * Unresolved legacy user_email targets are withheld, not assigned at read time.
 */
export function notificationRecipientWhere(user: { id: number; role: string } | null) {
  const broadcast = and(isNull(notificationsDb.targetUserId), isNull(notificationsDb.userEmail),
    user ? or(eq(notificationsDb.audience, user.role), eq(notificationsDb.audience, "public")) : eq(notificationsDb.audience, "public"));
  return user ? or(eq(notificationsDb.targetUserId, user.id), broadcast) : broadcast;
}
