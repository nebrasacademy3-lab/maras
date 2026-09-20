"use client";
import { notify, requestAdminVerification } from "@/lib/interaction-events";

/** Bind a replayable administrative write to its original actor, then retry a pre-mutation MFA refusal once. */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const managed = url.origin === window.location.origin && url.pathname.startsWith("/api/admin/") && !url.pathname.startsWith("/api/admin/security/");
  const replayable = !(input instanceof Request) && !(typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream);
  let boundInit = init;
  if (managed && replayable && !["GET", "HEAD", "OPTIONS"].includes(method) && !init?.signal?.aborted) {
    const identity = await fetch("/api/admin/me", { credentials: "same-origin", cache: "no-store", signal: init?.signal });
    const actor = await identity.json().catch(() => null) as { user?: { id?: unknown } } | null;
    if (!identity.ok || !Number.isSafeInteger(actor?.user?.id)) return Response.json({ error: "انتهت جلسة الإدارة. احفظ بياناتك ثم سجّل الدخول من جديد.", code: "ADMIN_SESSION_REQUIRED" }, { status: 401 });
    const headers = new Headers(init?.headers); headers.set("x-meras-acting-user", String(actor!.user!.id));
    boundInit = { ...init, headers };
  }
  let response = await fetch(input, boundInit);
  if (managed && replayable && response.status === 428) {
    const payload = await response.clone().json().catch(() => ({})) as { code?: string };
    if (["MFA_STEP_UP_REQUIRED", "MFA_SETUP_REQUIRED"].includes(payload.code || "")) {
      const verified = await requestAdminVerification(payload.code === "MFA_SETUP_REQUIRED");
      if (verified && !init?.signal?.aborted) response = await fetch(input, boundInit);
    }
  }
  if (managed && !["GET", "HEAD"].includes(method) && !/\/videos\//.test(url.pathname)) {
    if (response.ok) notify("تم تنفيذ العملية بنجاح", "success");
    else if (response.status !== 428) {
      const result = await response.clone().json().catch(() => ({})) as { error?: string };
      notify(result.error || "تعذر تنفيذ العملية. راجع البيانات وحاول مجددًا.", "error");
    }
  }
  return response;
}
