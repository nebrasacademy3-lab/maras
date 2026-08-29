import Link from "next/link";
import type { ReactNode } from "react";
import { AtSign, Facebook, Ghost, Instagram, Linkedin, Mail, MessageCircle, Send, Twitter, Youtube } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { getFailClosedPublicSettings, settingEnabled, whatsappHref } from "@/lib/platform-settings";

export async function SiteFooter() {
  const settings = await getFailClosedPublicSettings();
  const whatsapp = whatsappHref(settings);
  const requestsEnabled = settingEnabled(settings.course_requests_enabled);
  const supportEnabled = settingEnabled(settings.support_enabled);
  const currentYear = new Date().getFullYear();
  const socials: Array<{ href: string; label: string; icon: ReactNode }> = [];
  if (settings.social_x) socials.push({ href: settings.social_x, label: "حساب مراس على X", icon: <Twitter size={18} /> });
  if (settings.social_instagram) socials.push({ href: settings.social_instagram, label: "حساب مراس على إنستغرام", icon: <Instagram size={18} /> });
  if (settings.social_telegram) socials.push({ href: settings.social_telegram, label: "قناة مراس على تيليجرام", icon: <Send size={18} /> });
  if (settings.social_linkedin) socials.push({ href: settings.social_linkedin, label: "حساب مراس على لينكدإن", icon: <Linkedin size={18} /> });
  if (settings.social_youtube) socials.push({ href: settings.social_youtube, label: "قناة مراس على يوتيوب", icon: <Youtube size={18} /> });
  if (settings.social_facebook) socials.push({ href: settings.social_facebook, label: "حساب مراس على فيسبوك", icon: <Facebook size={18} /> });
  if (settings.social_snapchat) socials.push({ href: settings.social_snapchat, label: "حساب مراس على سناب شات", icon: <Ghost size={18} /> });
  if (settings.social_threads) socials.push({ href: settings.social_threads, label: "حساب مراس على ثريدز", icon: <AtSign size={18} /> });
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <BrandLogo markOnly />
          <div><strong>مراس العلم</strong><span>شرح جامعتك، في مكان واحد.</span></div>
          <p>منصة سعودية تجمع شروحات المواد الجامعية في تجربة عربية مرتبة. ابحث، شاهد الدرس المجاني، ثم تعلّم بثقة.</p>
          <div className="socials footer-brand-socials" role="group" aria-label="قنوات مراس الرسمية">
            {socials.map((item) => <a key={item.label} href={item.href} target="_blank" rel="noreferrer" aria-label={item.label}>{item.icon}</a>)}
            {supportEnabled && settings.support_email && <a href={`mailto:${settings.support_email}`} aria-label="مراسلة الدعم عبر البريد الإلكتروني"><Mail size={18} /></a>}
            {supportEnabled && whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" aria-label="واتساب"><MessageCircle size={18} /></a>}
          </div>
        </div>
        <nav aria-label="روابط الاستكشاف"><h3>استكشف</h3><Link href="/universities">الجامعات والكليات</Link><Link href="/courses">جميع المواد</Link>{requestsEnabled ? <Link href="/request-course">اطلب مادة</Link> : <span className="footer-link-disabled">طلب المواد متوقف مؤقتًا</span>}<Link href="/how-it-works">كيف تعمل مراس؟</Link></nav>
        <nav aria-label="روابط المساعدة"><h3>مساعدة</h3>{supportEnabled ? <Link href="/support">الدعم الفني</Link> : <span className="footer-link-disabled">الدعم متوقف مؤقتًا</span>}<Link href="/#faq">الأسئلة الشائعة</Link><Link href="/refund-policy">سياسة الاسترداد</Link><Link href="/contact">تواصل معنا</Link></nav>
        <nav aria-label="الروابط القانونية"><h3>قانوني</h3><Link href="/terms">الشروط والأحكام</Link><Link href="/privacy">سياسة الخصوصية</Link><Link href="/content-policy">حقوق المحتوى</Link><Link href="/accessibility">إمكانية الوصول</Link></nav>
        <div className="footer-contact"><h3>تواصل معنا</h3>{supportEnabled ? <>{settings.support_email && <a href={`mailto:${settings.support_email}`}><Mail size={17} /> <span dir="ltr">{settings.support_email}</span></a>}{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={17} /> واتساب مراس</a>}<p>{settings.support_hours}</p></> : <p className="footer-support-paused">استقبال رسائل الدعم متوقف مؤقتًا. ستظهر القنوات هنا فور إعادة تفعيلها.</p>}</div>
      </div>
      <div className="container footer-bottom"><p>© {currentYear} مراس العلم. جميع الحقوق محفوظة.</p><span>تجربة عربية صُممت للطالب الجامعي في السعودية 🇸🇦</span></div>
    </footer>
  );
}
