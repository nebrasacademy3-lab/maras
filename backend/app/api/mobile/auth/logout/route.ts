import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushDevices } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser, revokeSession } from "@/lib/auth";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

function validExpoToken(value: unknown): value is string {
  return typeof value === "string" && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(value);
}

export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  let pushToken: unknown = null;
  try { pushToken = ((await request.json()) as { pushToken?: unknown }).pushToken; } catch { /* The body is optional for older clients. */ }
  if (user && validExpoToken(pushToken)) {
    try {
      await getDb().update(pushDevices).set({ status: "revoked", lastSeenAt: new Date().toISOString() }).where(and(eq(pushDevices.token, pushToken), eq(pushDevices.userId, user.id)));
    } catch {
      // Session cleanup and the device's local logout must still complete if
      // push storage is temporarily unavailable.
    }
  }
  await revokeSession(request);
  return Response.json({ ok: true }, { headers: mobileNoStoreHeaders });
}
