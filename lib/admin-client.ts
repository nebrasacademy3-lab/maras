"use client";
import { notify, requestAdminVerification } from "@/lib/interaction-events";

/** Only a rejected, pre-mutation MFA challenge is replayed, and at most once. */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  const managed = url.origin === window.location.origin && url.pathname.startsWith("/api/admin/") && !url.pathname.startsWith("/api/admin/security/");
  // Requests with streamed bodies must not be implicitly replayed.
  const replayable = !(input instanceof Request) && !(typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream);
  let response = await fetch(input, init);
  if (managed && replayable && response.status === 428) {
    const payload = await response.clone().json().catch(() => ({})) as { code?: string };
    if (["MFA_STEP_UP_REQUIRED", "MFA_SETUP_REQUIRED"].includes(payload.code || "")) {
      const verified = await requestAdminVerification(payload.code === "MFA_SETUP_REQUIRED");
      if (verified && !init?.signal?.aborted) response = await fetch(input, init);
    }
  }
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (managed && !["GET", "HEAD"].includes(method) && !/\/videos\//.test(url.pathname)) {
    if (response.ok) notify("تم تنفيذ العملية بنجاح", "success");
    else if (response.status !== 428) {
      const result = await response.clone().json().catch(() => ({})) as { error?: string };
      notify(result.error || "تعذر تنفيذ العملية. راجع البيانات وحاول مجددًا.", "error");
    }
  }
  return response;
}
