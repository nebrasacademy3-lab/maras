import { completeMfaLogin } from "@/lib/account-mfa-login";
export function POST(request: Request) { return completeMfaLogin(request); }
