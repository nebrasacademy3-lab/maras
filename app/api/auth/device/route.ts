import { browserDeviceCookie, checkRateLimit, clientIp, sameOriginRequest, sessionDeviceIdentity } from "@/lib/auth";
import { jsonError } from "@/lib/api";

// Establish the same browser identity before a top-level OAuth redirect. This
// also upgrades existing local-storage identities to an HttpOnly cookie.
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await checkRateLimit("browser-device", clientIp(request), 60, 60)) return jsonError("محاولات كثيرة. حاول بعد دقيقة.", 429);
  const device = await sessionDeviceIdentity(request);
  return Response.json({ ok: true }, { headers: { "set-cookie": browserDeviceCookie(request, device.deviceId), "cache-control": "no-store" } });
}
