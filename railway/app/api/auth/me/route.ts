import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("غير مسجل", 401);
  return Response.json({ ok: true, user }, { headers: { "cache-control": "no-store" } });
}
