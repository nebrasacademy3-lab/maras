import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushDevices, users } from "@/db/schema";

type PushTarget = { userEmail?: string | null; audience?: string | null };

export async function sendPushNotification(target: PushTarget, title: string, body: string, data: Record<string, string | number | boolean | null> = {}) {
  try {
    const audience = target.audience?.trim().toLowerCase() || "";
    if (!target.userEmail && (!audience || audience === "user")) return;
    const targetFilter = target.userEmail
      ? eq(users.email, target.userEmail.toLowerCase())
      : audience === "public" ? undefined : eq(users.role, audience);
    const rows = await getDb().select({ token: pushDevices.token, email: users.email, role: users.role })
      .from(pushDevices).innerJoin(users, eq(pushDevices.userId, users.id)).where(and(eq(pushDevices.status, "active"), eq(users.status, "active"), targetFilter));
    if (!rows.length) return;
    for (let index = 0; index < rows.length; index += 100) {
      const messages = rows.slice(index, index + 100).map((row) => ({ to: row.token, title, body, data, sound: "default", priority: "high", channelId: "updates" }));
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "accept-encoding": "gzip, deflate" },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(5_000),
      });
    }
  } catch { /* Database notifications remain the reliable source of truth. */ }
}
