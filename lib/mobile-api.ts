import { sameOriginRequest } from "@/lib/auth";

export const MOBILE_CLIENT = "mobile-v1";

export function isMobileRequest(request: Request) {
  if (request.headers.get("x-meras-client") !== MOBILE_CLIENT) return false;
  const platform = (request.headers.get("x-meras-platform") || "").trim().toLowerCase();
  // Native React Native requests are not browser CSRF requests and may send no
  // Origin (or a runtime-specific Origin). Authentication is via bearer token and
  // login/register remain rate-limited. Expo Web still requires same-origin.
  if (platform === "android" || platform === "ios") return true;
  return sameOriginRequest(request);
}

export const mobileNoStoreHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
