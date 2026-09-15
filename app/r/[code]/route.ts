import { publicOrigin } from "@/lib/public-origin";
import { NextResponse } from "next/server";
import { normalizeReferralCode } from "@/lib/referrals";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = normalizeReferralCode(rawCode);
  const target = new URL("/register", publicOrigin());
  if (code) target.searchParams.set("ref", code);
  const response = NextResponse.redirect(target, 307);
  if (code) response.cookies.set("meras_referral", code, {
    httpOnly: true,
    sameSite: "lax",
    secure: target.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}
