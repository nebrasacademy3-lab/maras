import type { Metadata } from "next";
import { SecurityAuthShell } from "@/components/security-auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "استعادة كلمة المرور", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() { return <><SecurityAuthShell mode="recovery"><ForgotPasswordForm /></SecurityAuthShell><SiteFooter /></>; }
