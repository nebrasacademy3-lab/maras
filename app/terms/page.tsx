import { TermsSections, LEGAL_EFFECTIVE_DATE as EFFECTIVE_DATE, LEGAL_DOCUMENT_VERSION as DOCUMENT_VERSION } from "@/components/published-legal-content";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  CircleHelp,
  FileText,
  Landmark,
  Mail,
  Scale,
  ScrollText,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSettings } from "@/lib/platform-settings";
import styles from "../legal.module.css";


export function generateMetadata(): Promise<Metadata> { return staticPublicPageMetadata("/terms"); }

export default async function TermsPage() {
  const settings = await getPublicSettings();
  const operatorName = settings.legal_name.trim() || "مراس العلم";
  const sections = [
    { id: "scope", title: "التعريف ونطاق الاتفاق" },
    { id: "eligibility", title: "الأهلية وإنشاء الحساب" },
    { id: "service", title: "طبيعة الخدمة التعليمية" },
    { id: "orders", title: "الطلبات والأسعار والدفع" },
    { id: "access", title: "الصلاحية والاشتراكات" },
    { id: "acceptable-use", title: "الاستخدام المقبول" },
    { id: "content-rights", title: "حقوق المحتوى والملكية الفكرية" },
    { id: "user-content", title: "محتوى المستخدم والملفات" },
    { id: "communications", title: "الإشعارات والتواصل" },
    { id: "availability", title: "التوفر والتعليق وإنهاء الحساب" },
    { id: "third-parties", title: "الخدمات والروابط الخارجية" },
    { id: "refunds", title: "الإلغاء والاسترداد" },
    { id: "responsibility", title: "المسؤولية والحقوق النظامية" },
    { id: "changes", title: "تعديل الشروط" },
    { id: "law", title: "النظام الواجب والتواصل والشكاوى" },
  ];

  const identityRows = [
    { label: settings.legal_name ? "الاسم النظامي" : "الاسم التجاري", value: operatorName },
    { label: "رقم السجل التجاري", value: settings.commercial_registration_number.trim() },
    { label: "رقم توثيق التجارة الإلكترونية", value: settings.ecommerce_authentication_number.trim() },
    { label: "العنوان النظامي", value: settings.legal_address.trim() },
  ].filter((row) => row.value);

  return (
    <main className={styles.page} lang="ar" dir="rtl">
      <SiteHeader />
      <header className={styles.hero}>
        <div className="container">
          <nav className={styles.breadcrumbs} aria-label="مسار التنقل">
            <Link href="/">الرئيسية</Link><ChevronLeft size={13} aria-hidden="true" /><span>الشروط والأحكام</span>
          </nav>
          <div className={styles.heroGrid}>
            <div>
              <span className={styles.eyebrow}><Scale size={15} aria-hidden="true" /> اتفاق استخدام الخدمة</span>
              <h1>الشروط والأحكام</h1>
              <p className={styles.lead}>تنظم هذه الشروط العلاقة بين {operatorName} والمستخدم عند إنشاء الحساب أو تصفح المحتوى أو شراء خدمة تعليمية عبر الموقع أو التطبيقات.</p>
            </div>
            <div className={styles.versionCard} aria-label="بيانات إصدار الوثيقة">
              <CalendarDays aria-hidden="true" />
              <div><small>تاريخ النفاذ</small><strong>{EFFECTIVE_DATE}</strong><small>الإصدار {DOCUMENT_VERSION}</small></div>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        <div className={["container", styles.layout].join(" ")}>
          <article className={styles.article}>
            <div className={styles.notice}>
              <ScrollText aria-hidden="true" />
              <div><strong>قبل استخدام الخدمة</strong>يرجى قراءة هذه الشروط وسياسة الخصوصية وسياسة الاسترداد. إنشاء الحساب أو إتمام الطلب يعني قبول الشروط السارية وقت الاستخدام أو الشراء، ولا ينتقص ذلك من أي حق لا يجوز التنازل عنه نظامًا.</div>
            </div>

            <TermsSections settings={settings} />
          </article>

          <aside className={styles.aside} aria-label="معلومات الوثيقة">
            <section className={styles.toc}>
              <strong className={styles.cardTitle}><FileText size={18} aria-hidden="true" /> في هذه الصفحة</strong>
              <nav aria-label="أقسام الشروط والأحكام">{sections.map((section) => <a href={"#" + section.id} key={section.id}>{section.title}</a>)}</nav>
            </section>

            <section className={styles.identityCard}>
              <strong className={styles.cardTitle}><Building2 size={18} aria-hidden="true" /> بيانات الجهة المشغلة</strong>
              <div className={styles.identityRows}>
                {identityRows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
                {settings.support_email ? <div><span>بريد الدعم والشكاوى</span><a href={"mailto:" + settings.support_email}><Mail size={13} aria-hidden="true" /> {settings.support_email}</a></div> : <div><span>قناة الدعم والشكاوى</span><Link href="/support">فتح نموذج الدعم</Link></div>}
              </div>
            </section>

            <section className={styles.related}>
              <strong className={styles.cardTitle}><Landmark size={18} aria-hidden="true" /> وثائق مرتبطة</strong>
              <Link href="/privacy">سياسة الخصوصية <ChevronLeft size={15} aria-hidden="true" /></Link>
              <Link href="/refund-policy">سياسة الاسترداد <ChevronLeft size={15} aria-hidden="true" /></Link>
              <Link href="/support">الدعم والشكاوى <CircleHelp size={15} aria-hidden="true" /></Link>
            </section>
          </aside>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
