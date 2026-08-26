import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "استعادة كلمة المرور", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() { return <AuthShell mode="login"><ForgotPasswordForm /></AuthShell>; }
