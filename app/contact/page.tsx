import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clock3, ExternalLink, GraduationCap, Headphones, Mail, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { PublicInformationPage } from "@/components/public-information-page";
import { SocialLinks } from "@/components/social-links";
import { getPublicSettings, whatsappHref } from "@/lib/platform-settings";
import { normalizedSocialLinks } from "@/lib/social-links";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";
import contactStyles from "./contact.module.css";

export function generateMetadata(): Promise<Metadata> { return staticPublicPageMetadata("/contact"); }

export default async function ContactPage() {
  const settings = await getPublicSettings();
  const whatsapp = whatsappHref(settings);
  const socialLinks = normalizedSocialLinks(settings);
  const telegram = socialLinks.find((link) => link.id === "telegram");
  const social = socialLinks.filter((link) => link.id !== "whatsapp");

  return <PublicInformationPage path="/contact" title="نحن قريبون منك" intro="سؤال عن مادة، اقتراح، أو خطوة تحتاج فيها إلى مساعدة؟ اختر القناة المناسبة، ودعنا نكمل معك." audience="contact">
    {(whatsapp || settings.support_email || telegram) && <section aria-labelledby="contact-channels">
      <span className={styles.sectionLabel}>نبدأ من سؤالك</span>
      <h2 id="contact-channels">اختر كيف نتواصل</h2>
      <p>للاستفسارات العامة استخدم القنوات المنشورة هنا. ولطلبات حسابك، تساعدنا تذكرة الدعم على متابعة التفاصيل معك في مكان واحد.</p>
      <div className={contactStyles.channels}>
        {whatsapp && <article className={contactStyles.channel}>
          <span className={styles.cardIcon}><MessageCircle size={25} aria-hidden="true" /></span>
          <span className={styles.sectionLabel}>للاستفسارات العامة</span><h3>واتساب مراس</h3>
          <p>اسأل عن المنصة أو المادة التي تبحث عنها، وسنرشدك إلى الخطوة المناسبة.</p>
          <a className="button button-primary" href={whatsapp} target="_blank" rel="noopener noreferrer">ابدأ المحادثة <ExternalLink size={15} aria-hidden="true" /></a>
        </article>}
        {settings.support_email && <article className={contactStyles.channel}>
          <span className={styles.cardIcon}><Mail size={25} aria-hidden="true" /></span>
          <span className={styles.sectionLabel}>للتفاصيل والشراكات</span><h3>البريد الإلكتروني</h3>
          <p>لرسالة أطول أو اقتراح ترغب في مشاركته مع فريق مراس.</p>
          <bdi className={contactStyles.email}>{settings.support_email}</bdi>
          <a className="button button-soft" href={`mailto:${settings.support_email}`}>أرسل رسالة <ArrowLeft size={15} aria-hidden="true" /></a>
        </article>}
        {telegram && <article className={contactStyles.channel}>
          <span className={styles.cardIcon}><Send size={25} aria-hidden="true" /></span>
          <span className={styles.sectionLabel}>تابع المستجدات</span><h3>تيليجرام مراس</h3>
          <p>اطّلع على الإعلانات والمواد الجديدة عبر قناتنا الرسمية.</p>
          <a className="button button-soft" href={telegram.url} target="_blank" rel="noopener noreferrer">افتح القناة <ExternalLink size={15} aria-hidden="true" /></a>
        </article>}
      </div>
    </section>}
    <section className={contactStyles.support} aria-labelledby="support-heading">
      <div><span className={styles.sectionLabel}><Headphones size={18} aria-hidden="true" /> مساعدة مرتبطة بحسابك</span><h2 id="support-heading">كل التفاصيل، في تذكرة واحدة</h2><p>مشكلة في طلب أو تشغيل درس؟ أرسل التفاصيل من حسابك وتابع الردود من المكان نفسه. إضافة اسم المادة أو رقم الطلب تساعد الفريق على فهم ما تحتاجه.</p><div className={styles.actions}><Link className="button button-primary" href="/support">افتح مركز الدعم <ArrowLeft size={16} aria-hidden="true" /></Link><Link className="button button-ghost" href="/faq">ابحث في الأسئلة الشائعة</Link></div><small>يتطلب مركز الدعم تسجيل الدخول إلى حسابك.</small></div>
      <aside className={contactStyles.supportDetails} aria-label="معلومات التواصل">
        {settings.support_hours && <div><Clock3 size={21} aria-hidden="true" /><span><strong>أوقات الدعم</strong><span>{settings.support_hours}</span></span></div>}
        <div><ShieldCheck size={21} aria-hidden="true" /><span><strong>خصوصيتك أولًا</strong><span>احتفظ بكلمة المرور ورموز التحقق لنفسك. شارك تفاصيل الطلب عبر تذكرة حسابك.</span></span></div>
      </aside>
    </section>
    <div className={contactStyles.shortcuts}>
      <Link href="/request-course"><BookOpen size={25} aria-hidden="true" /><span><strong>تبحث عن مادة غير متاحة؟</strong><span>أرسل طلب توفيرها إلى فريق مراس.</span></span><ArrowLeft size={20} aria-hidden="true" /></Link>
      <Link href="/join-instructors"><GraduationCap size={25} aria-hidden="true" /><span><strong>لديك معرفة تودّ مشاركتها؟</strong><span>تعرّف على فرصة الانضمام كشارح.</span></span><ArrowLeft size={20} aria-hidden="true" /></Link>
    </div>
    {social.length > 0 && <section className={contactStyles.social} aria-labelledby="social-heading"><span className={styles.sectionLabel}>على قنواتنا الرسمية</span><h2 id="social-heading">ابقَ قريبًا من جديد مراس</h2><p>المواد الجديدة والنصائح الجامعية والإعلانات، من مصادرنا المنشورة.</p><SocialLinks settings={settings} className="social-channel-grid" labels includeWhatsapp={false} /></section>}
  </PublicInformationPage>;
}
