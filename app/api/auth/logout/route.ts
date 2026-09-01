import { jsonError } from "@/lib/api";
import { revokeSession, sameOriginRequest } from "@/lib/auth";
import { clearAdminStepUpCookie } from "@/lib/admin-mfa";

async function logoutHeaders(request: Request) {
  const headers = new Headers({
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "clear-site-data": '"cache"',
  });
  headers.append("set-cookie", await revokeSession(request));
  headers.append("set-cookie", clearAdminStepUpCookie(request));
  return headers;
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  return Response.json({ ok: true }, { headers: await logoutHeaders(request) });
}
