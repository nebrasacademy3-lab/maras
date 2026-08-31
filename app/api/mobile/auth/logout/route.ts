import { jsonError } from "@/lib/api";
import { getSessionUser, revokeSession } from "@/lib/auth";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";
import { getDb } from "@/db";
import { pushDevices } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  const deviceId = (request.headers.get("x-meras-device-id") || "").trim().slice(0, 128);
  if (user && deviceId.length >= 12) {
    await getDb().update(pushDevices).set({ status: "revoked", lastSeenAt: new Date().toISOString() }).where(and(eq(pushDevices.userId, user.id), eq(pushDevices.deviceId, deviceId))).catch(() => undefined);
  }
  await revokeSession(request);
  return Response.json({ ok: true }, { headers: mobileNoStoreHeaders });
}
