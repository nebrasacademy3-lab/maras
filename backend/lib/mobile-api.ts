import { sameOriginRequest } from "@/lib/auth";

export const MOBILE_CLIENT = "mobile-v1";

export function isMobileRequest(request: Request) {
  // Shared web surfaces may intentionally reuse a mobile DTO route with their
  // same-origin cookie session.
  if (sameOriginRequest(request)) return true;
  if (request.headers.get("x-meras-client") !== MOBILE_CLIENT) return false;
  const origin = request.headers.get("origin")?.trim();
  // React Native does not send browser Origin/Sec-Fetch headers. A supplied
  // cross-site Origin remains forbidden; the custom header forces browser CORS
  // preflight. It identifies the protocol only—protected routes still require
  // an authenticated bearer session.
  if (origin) return false;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) {
    const contentType = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json" && contentType !== "multipart/form-data") return false;
  }
  return true;
}

export const mobileNoStoreHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
