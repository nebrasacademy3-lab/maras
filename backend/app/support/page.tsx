import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Clock3, Headphones, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SupportForm } from "@/components/support-form";
import { getFailClosedPublicSettings, whatsappHref } from "@/lib/platform-settings";
import { getSessionUserFromHeaders } from "@/lib/auth";

export const metadata: Metadata = { title: "الدعم الفني" };

export default async function SupportPage() {
  const cookieHeader = (await cookies()).toString();
  const current = await getSessionUserFromHeaders(new Headers({ cookie: cookieHeader }));
  if (!current) redirect("/login?return_to=%2Fsupport");
  const settings = await getFailClosedPublicSettings();
  const whatsapp = whatsappHref(settings);
  return <main><SiteHeader appMode /><section className="page-hero"><div className="container"><div className="breadcrumbs"><Link href="/dashboard">لوحتي</Link><ChevronLeft size={13} /><span>الدعم</span></div><h1>كيف نقدر نساعدك؟</h1><p>اختر نوع المشكلة وأرسل التفاصيل. تظهر حالة التذكرة والردود داخل حسابك.</p></div></section><section className="content-page"><div className="container support-page-grid"><div className="support-form-card"><div><h2>فتح تذكرة جديدة</h2><p>كلما كانت التفاصيل أوضح، قدرنا نحل المشكلة أسرع.</p></div><SupportForm /></div><aside className="support-side"><article><Headphones size={25} /><h3>فريق مراس معك</h3><p>متوسط وقت الرد أقل من ساعتين أثناء أوقات العمل.</p><span><Clock3 size={14} /> {settings.support_hours}</span></article>{whatsapp && <article><MessageCircle size={23} /><div><strong>واتساب مراس</strong><small>للاستفسارات العامة</small></div><a href={whatsapp} target="_blank" rel="noreferrer">ابدأ المحادثة</a></article>}<article><Mail size={23} /><div><strong>البريد الإلكتروني</strong><small>{settings.support_email}</small></div><a href={`mailto:${settings.support_email}`}>إرسال</a></article><p><ShieldCheck size={15} /> لا ترسل بيانات البطاقة أو كلمة المرور داخل التذكرة.</p></aside></div></section><SiteFooter /></main>;
}
