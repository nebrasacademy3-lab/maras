import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, LogIn } from "lucide-react";
import { AuthShell, RegisterForm } from "@/components/auth-shell";
import { getInstitutionsCatalog } from "@/lib/catalog-store";
import { SiteFooter } from "@/components/site-footer";
import { getPublicSettings, settingEnabled } from "@/lib/platform-settings";

export const metadata: Metadata = { title: "إنشاء حساب" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [institutions, settings] = await Promise.all([getInstitutionsCatalog(), getPublicSettings()]);
  const enabled = settingEnabled(settings.student_registration_enabled);
  return <>{enabled ? <AuthShell mode="register"><RegisterForm institutions={institutions} /></AuthShell> : <AuthShell mode="register"><div className="auth-form register-disabled"><div className="auth-heading"><span>التسجيل متوقف مؤقتًا</span><h1>إنشاء الحسابات الجديدة غير متاح الآن</h1><p>أوقفت إدارة مراس التسجيل العام مؤقتًا. الحسابات الحالية تعمل بشكل طبيعي ويمكن تسجيل الدخول إليها.</p></div><div className="privacy-note"><UserPlus size={20}/><span><strong>لا تحتاج إلى إعادة المحاولة المتكرر</strong><small>بمجرد إعادة فتح التسجيل سيظهر زر إنشاء الحساب تلقائيًا في المنصة.</small></span></div><Link href="/login" className="button button-primary auth-submit">تسجيل الدخول <LogIn size={17}/></Link><Link href="/" className="button button-ghost auth-submit">العودة للرئيسية</Link></div></AuthShell>}<SiteFooter /></>;
}
