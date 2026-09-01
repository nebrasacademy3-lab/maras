import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import {
  AdminMfaError,
  adminMfaStatus,
  beginAdminTotpSetup,
  createAdminStepUp,
  disableAdminTotp,
  verifyAdminTotpSetup,
} from "@/lib/admin-mfa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

function mfaError(error: unknown) {
  if (error instanceof AdminMfaError) {
    return Response.json({ ok: false, code: error.code, error: error.message }, {
      status: error.status,
      headers: RESPONSE_HEADERS,
    });
  }
  console.error("[admin-mfa] request failed", error instanceof Error ? error.message : "unknown error");
  return Response.json({ ok: false, code: "MFA_REQUEST_FAILED", error: "تعذر إكمال إعداد الأمان الآن." }, {
    status: 500,
    headers: RESPONSE_HEADERS,
  });
}

async function mfaAdmin(request: Request) {
  const user = await getSessionUser(request);
  return roleAllowed(user, ["admin", "supervisor"]) ? user : null;
}

export async function GET(request: Request) {
  const user = await mfaAdmin(request);
  if (!user) return jsonError("غير مصرح بعرض إعدادات الأمان", 403);
  try {
    return Response.json({ ok: true, ...await adminMfaStatus(user, request) }, { headers: RESPONSE_HEADERS });
  } catch (error) {
    return mfaError(error);
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await mfaAdmin(request);
  if (!user) return jsonError("غير مصرح بتعديل إعدادات الأمان", 403);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("بيانات المصادقة غير صالحة");
  }

  const action = cleanText(payload.action, 24);
  const limit = action === "setup" ? 3 : 8;
  const windowSeconds = action === "setup" ? 600 : 300;
  if (!await checkRateLimit(`admin-mfa-${action || "unknown"}`, `user:${user.id}`, limit, windowSeconds)) {
    return Response.json({ ok: false, code: "MFA_RATE_LIMITED", error: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا." }, {
      status: 429,
      headers: RESPONSE_HEADERS,
    });
  }

  try {
    if (action === "setup") {
      const setup = await beginAdminTotpSetup(user, cleanText(payload.label, 80));
      return Response.json({ ok: true, ...setup }, { status: 201, headers: RESPONSE_HEADERS });
    }

    const code = cleanText(payload.code, 12).replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      return Response.json({ ok: false, code: "MFA_CODE_INVALID", error: "أدخل رمزًا مكونًا من 6 أرقام." }, {
        status: 400,
        headers: RESPONSE_HEADERS,
      });
    }

    if (action === "verify") {
      return Response.json({ ok: true, ...await verifyAdminTotpSetup(user, code) }, { headers: RESPONSE_HEADERS });
    }
    if (action === "stepUp") {
      const stepUp = await createAdminStepUp(user, request, code);
      return Response.json({ ok: true, stepUpValid: true, stepUpExpiresAt: stepUp.expiresAt, ...(request.headers.get("x-meras-client") === "mobile-v1" ? { stepUpToken: stepUp.token } : {}) }, {
        headers: { ...RESPONSE_HEADERS, "set-cookie": stepUp.cookie },
      });
    }
    if (action === "disable") {
      const disabled = await disableAdminTotp(user, request, code);
      return Response.json({ ok: true, enabled: false, stepUpValid: false }, {
        headers: { ...RESPONSE_HEADERS, "set-cookie": disabled.cookie },
      });
    }
    return jsonError("إجراء المصادقة غير معروف", 404);
  } catch (error) {
    return mfaError(error);
  }
}
