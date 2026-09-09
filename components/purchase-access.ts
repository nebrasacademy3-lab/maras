"use client";
export function continueRequiredAccountStep(result: { code?: string }) {
  const next = result.code === "EMAIL_VERIFICATION_REQUIRED" ? "/verify-email" : result.code === "PROFILE_INCOMPLETE" ? "/complete-profile" : "";
  if (!next) return false;
  const returnTo = `${window.location.pathname}${window.location.search}`;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Leave payment setup with fresh client state and re-run server account-readiness guards before retrying checkout.
  window.location.assign(`${next}?return_to=${encodeURIComponent(returnTo)}`);
  return true;
}
