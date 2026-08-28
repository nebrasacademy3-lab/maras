import { clientIp, getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";
import { allowSyncRequest } from "@/lib/sync-guard";
import { startSyncListener } from "@/lib/sync-listener";
import { getSyncSnapshot } from "@/lib/sync-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب غير مسموح", 403);
  const user = await getSessionUser(request);
  const identity = `${user?.id || "public"}:${clientIp(request)}`;
  if (!allowSyncRequest(identity)) return jsonError("طلبات مزامنة كثيرة. حاول لاحقًا.", 429);
  startSyncListener();

  try {
    return Response.json(await getSyncSnapshot(user), { headers: mobileNoStoreHeaders });
  } catch {
    return jsonError("تعذر مزامنة الحالة", 503);
  }
}

// Some native networking stacks use POST for foreground refreshes. It returns
// the same read-only snapshot and remains protected by the native protocol
// header/content-type check above.
export async function POST(request: Request) {
  return GET(new Request(request.url, { method: "GET", headers: request.headers }));
}
