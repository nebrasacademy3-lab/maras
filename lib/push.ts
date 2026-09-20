import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { pushDevices, users } from "@/db/schema";

export type PushTarget = { userId?: number | null; userEmail?: string | null; audience?: string | null };
type ExpoTicket = { status?: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };
export type PushDeliveryResult = { attempted: number; accepted: number; rejected: number; invalidated: number; providerErrors: string[] };

function uniqueErrors(values: string[]) { return [...new Set(values)].slice(0, 8); }

export async function sendPushNotification(target: PushTarget, title: string, body: string, data: Record<string, string | number | boolean | null> = {}): Promise<PushDeliveryResult> {
  const result: PushDeliveryResult = { attempted: 0, accepted: 0, rejected: 0, invalidated: 0, providerErrors: [] };
  try {
    // Explicit but missing identity must never fall through into a broadcast.
    const bound = Object.prototype.hasOwnProperty.call(target, "userId");
    const email = typeof target.userEmail === "string" ? target.userEmail.trim().toLowerCase() : "";
    if (bound && (!Number.isSafeInteger(target.userId) || !target.userId || target.userId < 1)) {
      result.providerErrors.push("PUSH_RECIPIENT_UNRESOLVED");
      return result;
    }
    if (!bound && !email && !["student", "supervisor", "admin", "public"].includes(target.audience || "")) {
      result.providerErrors.push("PUSH_RECIPIENT_UNRESOLVED");
      return result;
    }
    const predicate = bound ? eq(users.id, target.userId!)
      : email ? eq(users.email, email)
      : target.audience === "public" ? undefined : eq(users.role, target.audience!);
    const rows = await getDb().select({ id: pushDevices.id, token: pushDevices.token })
      .from(pushDevices).innerJoin(users, eq(pushDevices.userId, users.id)).where(and(
        eq(pushDevices.status, "active"), eq(users.status, "active"), predicate,
      ));
    const selected = [...new Map(rows.map((row) => [row.token, row])).values()];
    result.attempted = selected.length;
    if (!selected.length) return result;

    const invalidDeviceIds: number[] = [];
    for (let index = 0; index < selected.length; index += 100) {
      const batch = selected.slice(index, index + 100);
      const messages = batch.map((row) => ({ to: row.token, title, body, data, sound: "default", priority: "high", channelId: "updates" }));
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          redirect: "error",
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
