import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { VerifyEmailForm } from "@/components/verify-email-form";
import { currentUser } from "@/lib/server-auth";
import { accountNext, safeAccountReturnTo } from "@/lib/account-readiness";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تأكيد البريد الإلكتروني", robots: { index: false, follow: false } };
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const query = await searchParams;
  const returnTo = safeAccountReturnTo(query.return_to);
  const user = await currentUser();
  if (!user) redirect(`/login?return_to=${encodeURIComponent(`/verify-email?return_to=${encodeURIComponent(returnTo)}`)}`);
  if (user.emailVerified) {
    const next = accountNext(user);
    redirect(next === "/dashboard" ? (returnTo.startsWith("/verify-email") ? "/dashboard" : returnTo) : `${next}?return_to=${encodeURIComponent(returnTo)}`);
  }
  return <AuthShell mode="register"><VerifyEmailForm email={user.email} /></AuthShell>;
}
