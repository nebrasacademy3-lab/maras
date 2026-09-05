import type { Metadata } from "next";
import { AuthShell, LoginForm } from "@/components/auth-shell";
import { SiteFooter } from "@/components/site-footer";
export const metadata: Metadata = { title: "تسجيل الدخول", robots: { index: false, follow: false } };
export default function LoginPage(){return <><AuthShell mode="login"><LoginForm /></AuthShell><SiteFooter /></>}
