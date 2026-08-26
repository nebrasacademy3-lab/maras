import type { Metadata } from "next";
import { AuthShell, LoginForm } from "@/components/auth-shell";
export const metadata: Metadata = { title: "تسجيل الدخول" };
export default function LoginPage(){return <AuthShell mode="login"><LoginForm /></AuthShell>}

