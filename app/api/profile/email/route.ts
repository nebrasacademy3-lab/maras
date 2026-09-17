import { readBoundedJsonObject } from "@/lib/request-body";
import { getSessionUser, sameOriginRequest } from "@/lib/auth";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { jsonError } from "@/lib/api";
import { EmailChangeError, cancelEmailChange, emailChangeStatus, requestEmailChange, verifyEmailChange } from "@/lib/email-change";
import { EmailDeliveryError } from "@/lib/transactional-email";

export const runtime = "nodejs";
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

function acceptsRequest(request: Request) {
  return sameOriginRequest(request) || isNativeAppRequest(request);
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  return Response.json({ ok: true, ...await emailChangeStatus(user.id, user.email) }, { headers });
}

export async function POST(request: Request) {
  if (!acceptsRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  let payload: Record<string, unknown>;
  try {
    payload = await readBoundedJsonObject(request);
  } catch {
    return jsonError("بيانات تغيير البريد غير صالحة");
  }
  const action = typeof payload.action === "string" ? payload.action : "";
  try {
    if (action === "request") {
      return Response.json(await requestEmailChange(user.id, payload.newEmail, payload.currentPassword, request), { headers });
    }
    if (action === "verify") {
      if (payload.target !== "current" && payload.target !== "new") return jsonError("جهة الرمز غير صالحة", 400);
      return Response.json(await verifyEmailChange(user.id, payload.target, payload.code, request), { headers });
    }
    if (action === "cancel") return Response.json(await cancelEmailChange(user.id), { headers });
    return jsonError("الإجراء غير معروف", 400);
  } catch (error) {
    if (error instanceof EmailChangeError || error instanceof EmailDeliveryError) return jsonError(error.message, error.status, error.code);
    return jsonError("تعذر تغيير البريد حاليًا. حاول مرة أخرى.", 503);
  }
}
