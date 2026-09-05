import type { SessionUser } from "@/lib/auth";

/** A verified address remains verified; checkout never issues another email code. */
export function accountNext(user: Pick<SessionUser, "emailVerified" | "profileCompleted" | "onboardingCompleted">, native = false) {
  if (!user.emailVerified) return "/verify-email";
  if (!user.profileCompleted) return "/complete-profile";
  if (!user.onboardingCompleted) return "/onboarding";
  return native ? "/home" : "/dashboard";
}

export function safeAccountReturnTo(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://meras.invalid");
    if (url.origin !== "https://meras.invalid" || /^\/api(?:\/|$)/.test(url.pathname) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f])/i.test(url.pathname)) return fallback;
    let decodedPath = url.pathname;
    for (let index = 0; index < 3; index += 1) {
      const decoded = decodeURIComponent(decodedPath);
      if (decoded === decodedPath) break;
      decodedPath = decoded;
    }
    if (/^\/api(?:\/|$)/i.test(decodedPath) || decodedPath.startsWith("//") || /[\\\u0000-\u0020]/.test(decodedPath) || /%[0-9a-f]{2}/i.test(decodedPath)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

export function purchaseRequirement(user: SessionUser) {
  if (!user.emailVerified) return { code: "EMAIL_VERIFICATION_REQUIRED", error: "أكّد بريدك الإلكتروني مرة واحدة لتتمكن من الشراء.", next: "/verify-email" } as const;
  // Administrative navigation can bypass academic onboarding, but purchasing cannot.
  if (!purchaseProfileComplete(user)) {
    return { code: "PROFILE_INCOMPLETE", error: "أكمل الاسم والجوال والجامعة والتخصص والمستوى الدراسي قبل الشراء.", next: "/complete-profile" } as const;
  }
  return null;
}

export function purchaseProfileComplete(user: SessionUser) {
  return Boolean(user.profileCompleted && user.fullName.trim().length >= 5 && user.phone?.trim() && user.universitySlug?.trim() && user.specialty?.trim() && user.academicLevel?.trim());
}

export function purchaseRequirementResponse(user: SessionUser) {
  const requirement = purchaseRequirement(user);
  return requirement ? Response.json({ ok: false, ...requirement }, { status: 403, headers: { "cache-control": "no-store" } }) : null;
}
