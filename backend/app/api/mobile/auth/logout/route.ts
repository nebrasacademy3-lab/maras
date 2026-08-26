import { jsonError } from "@/lib/api";
import { revokeSession } from "@/lib/auth";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  await revokeSession(request);
  return Response.json({ ok: true }, { headers: mobileNoStoreHeaders });
}
