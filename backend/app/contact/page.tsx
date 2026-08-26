import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Clock3, Headphones, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SupportForm } from "@/components/support-form";
import { getPublicSettings, whatsappHref } from "@/lib/platform-settings";

export const metadata: Metadata = { title: "تواصل معنا" };
export default async function ContactPage() {
  const settings = await getPublicSettings();
  const whatsapp = whatsappHref(settings);
  return <main><SiteHeader /><section className="page-hero"><div className="container"><div className="breadcrumbs"><Link href="/">الرئيسية</Link><ChevronLeft size={13} /><span>تواصل معنا</span></div><h1>نسمعك ونساعدك</h1><p>استفسار، اقتراح، شراكة تعليمية أو مشكلة تقنية — أرسلها مباشرة إلى فريق مراس.</p></div></section><section className="content-page"><div className="container support-page-grid"><div className="support-form-card"><div><h2>أرسل رسالتك</h2><p>سننشئ تذكرة قابلة للمتابعة ونرد خلال ساعات العمل.</p></div><SupportForm /></div><aside className="support-side"><article><Headphones size={25} /><h3>فريق الدعم</h3><p>{settings.support_hours}</p><span><Clock3 size={14} /> متوسط الرد أقل من ساعتين</span></article><article><Mail size={23} /><div><strong>البريد</strong><small>{settings.support_email}</small></div><a href={`mailto:${settings.support_email}`}>إرسال</a></article>{whatsapp && <article><MessageCircle size={23} /><div><strong>واتساب مراس</strong><small>للاستفسارات العامة</small></div><a href={whatsapp} target="_blank" rel="noreferrer">ابدأ المحادثة</a></article>}<p><ShieldCheck size={15} /> لا نطلب بيانات البطاقة أو كلمة المرور عبر الرسائل.</p></aside></div></section><SiteFooter /></main>;
}
