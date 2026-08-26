import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushDevices, users } from "@/db/schema";

type PushTarget = { userEmail?: string | null; audience?: string | null };

export async function sendPushNotification(target: PushTarget, title: string, body: string, data: Record<string, string | number | boolean | null> = {}) {
  try {
    const rows = await getDb().select({ token: pushDevices.token, email: users.email, role: users.role })
      .from(pushDevices).innerJoin(users, eq(pushDevices.userId, users.id)).where(eq(pushDevices.status, "active"));
    const selected = rows.filter((row) => target.userEmail ? row.email === target.userEmail : !target.audience || target.audience === "user" || row.role === target.audience);
    if (!selected.length) return;
    for (let index = 0; index < selected.length; index += 100) {
      const messages = selected.slice(index, index + 100).map((row) => ({ to: row.token, title, body, data, sound: "default", priority: "high", channelId: "updates" }));
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "accept-encoding": "gzip, deflate" },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(5_000),
      });
    }
  } catch { /* Database notifications remain the reliable source of truth. */ }
}

