import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3, ExternalLink, Facebook, Headphones, Instagram, Linkedin, Mail, MessageCircle, Music2, Send, ShieldCheck, Youtube } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSettings, whatsappHref } from "@/lib/platform-settings";

export const metadata: Metadata = { title: "تواصل معنا" };

const socialChannels = [
  { key: "social_x", label: "X", icon: Send },
  { key: "social_instagram", label: "Instagram", icon: Instagram },
  { key: "social_tiktok", label: "TikTok", icon: Music2 },
  { key: "social_youtube", label: "YouTube", icon: Youtube },
  { key: "social_telegram", label: "Telegram", icon: Send },
  { key: "social_linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "social_facebook", label: "Facebook", icon: Facebook },
  { key: "social_snapchat", label: "Snapchat", icon: MessageCircle },
  { key: "social_threads", label: "Threads", icon: MessageCircle },
] as const;

export default async function ContactPage() {
  const settings = await getPublicSettings();
  const whatsapp = whatsappHref(settings);
  const social = socialChannels.flatMap((channel) => {
    const url = settings[channel.key];
    return url.startsWith("https://") ? [{ ...channel, url }] : [];
  });
  return (
    <main>
      <SiteHeader />
      <section className="page-hero contact-hero">
        <div className="container">
          <div className="breadcrumbs"><Link href="/">الرئيسية</Link><ArrowLeft size={13} /><span>تواصل معنا</span></div>
          <div className="contact-hero-copy"><span className="eyebrow"><MessageCircle size={15} /> قنوات مراس الرسمية</span><h1>نحن قريبون منك</h1><p>للاستفسارات العامة، الشراكات التعليمية، الاقتراحات أو أي سؤال عن المنصة، اختر القناة الأنسب لك وسنكون سعداء بسماعك.</p></div>
        </div>
      </section>
      <section className="content-page contact-page">
        <div className="container">
          <div className="contact-channel-grid">
            {whatsapp ? <article className="contact-channel-card contact-channel-primary"><div className="contact-channel-icon"><MessageCircle size={25} /></div><div><span>الأسرع عادةً</span><h2>واتساب مراس</h2><p>محادثة مباشرة للاستفسارات العامة والتوجيه السريع.</p></div><a className="button button-primary" href={whatsapp} target="_blank" rel="noreferrer">ابدأ المحادثة <ExternalLink size={15} /></a></article> : null}
            {settings.support_email ? <article className="contact-channel-card"><div className="contact-channel-icon email"><Mail size={25} /></div><div><span>للاستفسارات المفصلة</span><h2>البريد الإلكتروني</h2><p>{settings.support_email}</p></div><a className="button button-soft" href={`mailto:${settings.support_email}`}>أرسل رسالة <ArrowLeft size={15} /></a></article> : <article className="contact-channel-card"><div className="contact-channel-icon email"><Mail size={25} /></div><div><span>متابعة محفوظة</span><h2>تذكرة الدعم</h2><p>قدّم طلبك وتابع الرد من حسابك.</p></div><Link className="button button-soft" href="/support">فتح الدعم <ArrowLeft size={15} /></Link></article>}
          </div>
          <div className="contact-content-grid">
            {social.length ? <section className="contact-social-panel"><div className="section-heading"><div><span className="eyebrow">تابع جديد مراس</span><h2>كن على اتصال دائم</h2></div><ShieldCheck size={22} /></div><p>تابعنا لمعرفة المواد الجديدة، الإعلانات، النصائح الجامعية، والفرص التعليمية القادمة.</p><div className="social-channel-grid">{social.map(({ key, label, icon: Icon, url }) => <a key={key} href={url} target="_blank" rel="noreferrer"><Icon size={19} /><span>{label}</span><ExternalLink size={13} /></a>)}</div></section> : null}
            <aside className="contact-support-panel"><Headphones size={25} /><span className="eyebrow">مشكلة تحتاج متابعة؟</span><h2>الدعم الفني</h2><p>تذاكر الدعم مرتبطة بحسابك حتى تحفظ خصوصية بياناتك وتستطيع متابعة الردود والطلبات من مكان واحد.</p><div className="contact-hours"><Clock3 size={15} /> {settings.support_hours}</div><Link className="button button-primary" href="/support">الدخول إلى الدعم الفني <ArrowLeft size={15} /></Link><small>يتطلب تسجيل الدخول أو إنشاء حساب جديد.</small></aside>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
