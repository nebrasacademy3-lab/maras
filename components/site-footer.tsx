import Link from "next/link";
import type { ReactNode } from "react";
import { Apple, AtSign, BadgeCheck, Building2, Facebook, Ghost, Instagram, Linkedin, Mail, MessageCircle, Send, Smartphone, Twitter, Youtube } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { getPublicSettings, whatsappHref } from "@/lib/platform-settings";

function isHttps(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function SiteFooter() {
  const settings = await getPublicSettings();
  const whatsapp = whatsappHref(settings);
  const hasLegalRecords = Boolean(
    settings.legal_name.trim()
    || settings.commercial_registration_number.trim()
    || settings.ecommerce_authentication_number.trim()
    || settings.nelc_program_license_number.trim()
    || settings.vat_number.trim()
  );
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
          <p>{settings.footer_description}</p>
          <div className="socials footer-brand-socials" role="group" aria-label="قنوات مراس الرسمية">
            {socials.map((item) => <a key={item.label} href={item.href} target="_blank" rel="noreferrer" aria-label={item.label}>{item.icon}</a>)}
            {settings.support_email && <a href={`mailto:${settings.support_email}`} aria-label="البريد الإلكتروني"><Mail size={18} /></a>}
            {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" aria-label="واتساب"><MessageCircle size={18} /></a>}
          </div>
          {(settings.ios_app_url || settings.android_app_url) && <section className="footer-app-download" aria-labelledby="footer-app-title">
            <div><strong id="footer-app-title">{settings.app_download_title}</strong><small>{settings.app_download_description}</small></div>
            <div className="footer-store-links">
              {settings.ios_app_url && <a className="footer-store-link" href={settings.ios_app_url} target="_blank" rel="noreferrer" aria-label="تنزيل تطبيق مراس للآيفون من App Store"><Apple size={21} /><span><small>حمّل التطبيق من</small><b>App Store</b></span></a>}
              {settings.android_app_url && <a className="footer-store-link" href={settings.android_app_url} target="_blank" rel="noreferrer" aria-label="تنزيل تطبيق مراس للأندرويد من Google Play"><Smartphone size={21} /><span><small>حمّل التطبيق من</small><b>Google Play</b></span></a>}
            </div>
          </section>}
        </div>
        <div><h3>استكشف</h3><Link href="/universities">الجامعات والكليات</Link><Link href="/courses">جميع المواد</Link><Link href="/request-course">اطلب مادة</Link><Link href="/how-it-works">كيف تعمل مراس؟</Link></div>
        <div><h3>مساعدة</h3><Link href="/support">الدعم الفني</Link><Link href="/#faq">الأسئلة الشائعة</Link><Link href="/refund-policy">سياسة الاسترداد</Link><Link href="/contact">تواصل معنا</Link></div>
        <div><h3>قانوني</h3><Link href="/terms">الشروط والأحكام</Link><Link href="/privacy">سياسة الخصوصية</Link><Link href="/content-policy">حقوق المحتوى</Link><Link href="/accessibility">إمكانية الوصول</Link></div>
        <div className="footer-contact"><h3>تواصل معنا</h3>{settings.support_email && <a href={`mailto:${settings.support_email}`}><Mail size={17} /> {settings.support_email}</a>}{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={17} /> واتساب مراس</a>}<Link href="/support">فتح تذكرة دعم</Link><p>{settings.support_hours}</p></div>
      </div>
      {hasLegalRecords ? <div className="container footer-legal-records" aria-label="بيانات المنشأة والتراخيص">
        {settings.legal_name.trim() ? <span><Building2 size={16}/><b>{settings.legal_name.trim()}</b></span> : null}
        {settings.commercial_registration_number.trim() ? <span>سجل تجاري <bdi dir="ltr">{settings.commercial_registration_number.trim()}</bdi>{isHttps(settings.commercial_registration_verify_url) ? <a href={settings.commercial_registration_verify_url} target="_blank" rel="noreferrer">تحقق</a> : null}</span> : null}
        {settings.ecommerce_authentication_number.trim() ? <span><BadgeCheck size={16}/> متجر موثّق برقم <bdi dir="ltr">{settings.ecommerce_authentication_number.trim()}</bdi>{isHttps(settings.ecommerce_authentication_verify_url) ? <a href={settings.ecommerce_authentication_verify_url} target="_blank" rel="noreferrer">تحقق</a> : null}</span> : null}
        {settings.nelc_program_license_number.trim() ? <span>ترخيص برنامج «{settings.nelc_program_name.trim() || "تعليم إلكتروني"}» رقم <bdi dir="ltr">{settings.nelc_program_license_number.trim()}</bdi>{isHttps(settings.nelc_program_license_verify_url) ? <a href={settings.nelc_program_license_verify_url} target="_blank" rel="noreferrer">تحقق من النطاق</a> : null}</span> : null}
        {settings.vat_number.trim() ? <span>الرقم الضريبي <bdi dir="ltr">{settings.vat_number.trim()}</bdi></span> : null}
      </div> : null}
      <div className="container footer-bottom"><p>© 2026 مراس العلم. جميع الحقوق محفوظة.</p><span>صُنع للطالب الجامعي في السعودية 🇸🇦</span></div>
    </footer>
  );
}
