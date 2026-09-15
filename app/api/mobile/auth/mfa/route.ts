import { completeMfaLogin } from "@/lib/account-mfa-login";
import { isMobileRequest } from "@/lib/mobile-api";
import { jsonError } from "@/lib/api";
export function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  return completeMfaLogin(request, true);
}
