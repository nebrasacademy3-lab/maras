import Link from "next/link";
import type { ReactNode } from "react";
import { AtSign, Facebook, Ghost, Instagram, Linkedin, Mail, MessageCircle, Send, Twitter, Youtube } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { getPublicSettings, whatsappHref } from "@/lib/platform-settings";

export async function SiteFooter() {
  const settings = await getPublicSettings();
  const whatsapp = whatsappHref(settings);
  const socials: Array<{ href: string; label: string; icon: ReactNode }> = [];
  if (settings.social_x) socials.push({ href: settings.social_x, label: "X", icon: <Twitter size={18} /> });
  if (settings.social_instagram) socials.push({ href: settings.social_instagram, label: "Instagram", icon: <Instagram size={18} /> });
  if (settings.social_telegram) socials.push({ href: settings.social_telegram, label: "Telegram", icon: <Send size={18} /> });
  if (settings.social_linkedin) socials.push({ href: settings.social_linkedin, label: "LinkedIn", icon: <Linkedin size={18} /> });
  if (settings.social_youtube) socials.push({ href: settings.social_youtube, label: "YouTube", icon: <Youtube size={18} /> });
  if (settings.social_facebook) socials.push({ href: settings.social_facebook, label: "Facebook", icon: <Facebook size={18} /> });
  if (settings.social_snapchat) socials.push({ href: settings.social_snapchat, label: "Snapchat", icon: <Ghost size={18} /> });
  if (settings.social_threads) socials.push({ href: settings.social_threads, label: "Threads", icon: <AtSign size={18} /> });
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <BrandLogo markOnly />
          <p>منصة سعودية تجمع شروحات المواد الجامعية في مكان واحد. ابحث، جرّب مجانًا، ثم تعلّم بثقة.</p>
          <div className="socials footer-brand-socials" role="group" aria-label="قنوات مراس الرسمية">
            {socials.map((item) => <a key={item.label} href={item.href} target="_blank" rel="noreferrer" aria-label={item.label}>{item.icon}</a>)}
            <a href={`mailto:${settings.support_email}`} aria-label="البريد الإلكتروني"><Mail size={18} /></a>
            {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" aria-label="واتساب"><MessageCircle size={18} /></a>}
          </div>
        </div>
        <div><h3>استكشف</h3><Link href="/universities">الجامعات والكليات</Link><Link href="/courses">جميع المواد</Link><Link href="/request-course">اطلب مادة</Link><Link href="/how-it-works">كيف تعمل مراس؟</Link></div>
        <div><h3>مساعدة</h3><Link href="/support">الدعم الفني</Link><Link href="/#faq">الأسئلة الشائعة</Link><Link href="/refund-policy">سياسة الاسترداد</Link><Link href="/contact">تواصل معنا</Link></div>
        <div><h3>قانوني</h3><Link href="/terms">الشروط والأحكام</Link><Link href="/privacy">سياسة الخصوصية</Link><Link href="/content-policy">حقوق المحتوى</Link><Link href="/accessibility">إمكانية الوصول</Link></div>
        <div className="footer-contact"><h3>تواصل معنا</h3><a href={`mailto:${settings.support_email}`}><Mail size={17} /> {settings.support_email}</a>{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={17} /> واتساب مراس</a>}<p>{settings.support_hours}</p></div>
      </div>
      <div className="container footer-bottom"><p>© 2026 مراس العلم. جميع الحقوق محفوظة.</p><span>صُنع للطالب الجامعي في السعودية 🇸🇦</span></div>
    </footer>
  );
}
