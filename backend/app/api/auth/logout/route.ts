import { jsonError } from "@/lib/api";
import { revokeSession, sameOriginRequest } from "@/lib/auth";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  return Response.json({ ok: true }, { headers: { "set-cookie": await revokeSession(request), "cache-control": "no-store" } });
}
