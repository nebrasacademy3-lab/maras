"use client";
export function continueRequiredAccountStep(result: { code?: string }) {
  const next = result.code === "EMAIL_VERIFICATION_REQUIRED" ? "/verify-email" : result.code === "PROFILE_INCOMPLETE" ? "/complete-profile" : "";
  if (!next) return false;
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`${next}?return_to=${encodeURIComponent(returnTo)}`);
  return true;
}
