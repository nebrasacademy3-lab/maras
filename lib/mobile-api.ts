import { sameOriginRequest } from "@/lib/auth";

export const MOBILE_CLIENT = "mobile-v1";

export function isMobileRequest(request: Request) {
  return request.headers.get("x-meras-client") === MOBILE_CLIENT && sameOriginRequest(request);
}

export const mobileNoStoreHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

