import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { pushDevices, users } from "@/db/schema";

type PushTarget = { userEmail?: string | null; audience?: string | null };
type ExpoTicket = { status?: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };
export type PushDeliveryResult = { attempted: number; accepted: number; rejected: number; invalidated: number; providerErrors: string[] };

function uniqueErrors(values: string[]) { return [...new Set(values)].slice(0, 8); }

export async function sendPushNotification(target: PushTarget, title: string, body: string, data: Record<string, string | number | boolean | null> = {}): Promise<PushDeliveryResult> {
  const result: PushDeliveryResult = { attempted: 0, accepted: 0, rejected: 0, invalidated: 0, providerErrors: [] };
  try {
    const rows = await getDb().select({ id: pushDevices.id, token: pushDevices.token, email: users.email, role: users.role })
      .from(pushDevices).innerJoin(users, eq(pushDevices.userId, users.id)).where(eq(pushDevices.status, "active"));
    const matching = rows.filter((row) => target.userEmail ? row.email === target.userEmail : !target.audience || target.audience === "user" || target.audience === "public" || row.role === target.audience);
    const selected = [...new Map(matching.map((row) => [row.token, row])).values()];
    result.attempted = selected.length;
    if (!selected.length) return result;

    const invalidDeviceIds: number[] = [];
    for (let index = 0; index < selected.length; index += 100) {
      const batch = selected.slice(index, index + 100);
      const messages = batch.map((row) => ({ to: row.token, title, body, data, sound: "default", priority: "high", channelId: "updates" }));
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", "accept-encoding": "gzip, deflate" },
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          result.rejected += batch.length;
          result.providerErrors.push(`Expo HTTP ${response.status}`);
          continue;
        }
        const payload = await response.json() as { data?: ExpoTicket[]; errors?: Array<{ message?: string; code?: string }> };
        const tickets = Array.isArray(payload.data) ? payload.data : [];
        for (let itemIndex = 0; itemIndex < batch.length; itemIndex += 1) {
          const ticket = tickets[itemIndex];
          if (ticket?.status === "ok") result.accepted += 1;
          else {
            result.rejected += 1;
            const providerError = ticket?.details?.error || ticket?.message || payload.errors?.[0]?.code || payload.errors?.[0]?.message || "Expo rejected the message";
            result.providerErrors.push(providerError);
            if (ticket?.details?.error === "DeviceNotRegistered") invalidDeviceIds.push(batch[itemIndex].id);
          }
        }
      } catch (error) {
        result.rejected += batch.length;
        result.providerErrors.push(error instanceof Error ? error.message : "Expo request failed");
      }
    }
    if (invalidDeviceIds.length) {
      await getDb().update(pushDevices).set({ status: "revoked", lastSeenAt: new Date().toISOString() }).where(inArray(pushDevices.id, invalidDeviceIds));
      result.invalidated = invalidDeviceIds.length;
    }
  } catch (error) {
    result.providerErrors.push(error instanceof Error ? error.message : "Push delivery failed");
  }
  result.providerErrors = uniqueErrors(result.providerErrors);
  return result;
}
