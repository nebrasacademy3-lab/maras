import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getSessionUser, sameOriginRequest, sessionUserFromRow } from "@/lib/auth";
import { accountNext } from "@/lib/account-readiness";
import { jsonError } from "@/lib/api";
import { consumeEmailCode, EmailCodeError, emailCodeStatus, requestEmailCode } from "@/lib/email-verification";
import { EmailDeliveryError } from "@/lib/transactional-email";
import { readBoundedJsonObject } from "@/lib/request-body";

export const runtime = "nodejs";
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لتأكيد بريدك", 401);
  return Response.json({ ok: true, user, emailVerified: user.emailVerified, next: accountNext(user), ...await emailCodeStatus(user.id, user.email) }, { headers });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لتأكيد بريدك", 401);
  let body: Record<string, unknown>;
  try { body = await readBoundedJsonObject(request); } catch { return jsonError("بيانات التحقق غير صالحة"); }
  if (body.action !== "send" && body.action !== "verify") return jsonError("اختر إرسال الرمز أو تأكيده");
  if (user.emailVerified) return Response.json({ ok: true, alreadyVerified: true, user, next: accountNext(user) }, { headers });
  try {
    if (body.action === "send") return Response.json(await requestEmailCode(user.id, "verify_email", request), { headers });
    const updated = await consumeEmailCode(user.id, "verify_email", body.code, request, async (tx, row, now) => {
      // Persist once; later logins and purchases never reset verification.
      if (!row.emailVerifiedAt) await tx.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, row.id));
      return sessionUserFromRow({ ...row, emailVerifiedAt: row.emailVerifiedAt || now });
    });
    return Response.json({ ok: true, user: updated, next: accountNext(updated) }, { headers });
  } catch (error) {
    if (error instanceof EmailCodeError || error instanceof EmailDeliveryError) return jsonError(error.message, error.status, error.code);
    return jsonError("تعذر تأكيد البريد حاليًا. حاول مرة أخرى.", 503);
  }
}
