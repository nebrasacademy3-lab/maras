import { jsonError } from "@/lib/api";
import { revokeSession, sameOriginRequest } from "@/lib/auth";

function safeRedirect(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get("to") || "/";
  return to.startsWith("/") && !to.startsWith("//") ? to : "/";
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  return Response.json({ ok: true }, { headers: { "set-cookie": await revokeSession(request), "cache-control": "no-store, max-age=0", "clear-site-data": '"cache"' } });
}

export async function GET(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const target = new URL(safeRedirect(request), request.url);
  return new Response(null, {
    status: 303,
    headers: {
      location: target.toString(),
      "set-cookie": await revokeSession(request),
      "cache-control": "no-store, max-age=0",
      "clear-site-data": '"cache"',
    },
  });
}
