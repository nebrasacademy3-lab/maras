import { PrivacySections, LEGAL_EFFECTIVE_DATE as EFFECTIVE_DATE, LEGAL_DOCUMENT_VERSION as DOCUMENT_VERSION } from "@/components/published-legal-content";
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
  ShieldCheck,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSettings } from "@/lib/platform-settings";
import styles from "../legal.module.css";


export function generateMetadata(): Promise<Metadata> { return staticPublicPageMetadata("/privacy"); }

export default async function PrivacyPage() {
  const settings = await getPublicSettings();
  const operatorName = settings.legal_name.trim() || "مراس العلم";
  const sections = [
    { id: "scope", title: "نطاق السياسة وهوية الجهة المشغلة" },
    { id: "collected-data", title: "البيانات التي نجمعها" },
    { id: "purposes", title: "أغراض المعالجة وأساسها" },
    { id: "payments", title: "بيانات الدفع والمعاملات" },
    { id: "technical-data", title: "ملفات الارتباط والبيانات التقنية" },
    { id: "providers", title: "مزودو المعالجة التقنية والنقل الخارجي" },
    { id: "retention", title: "الاحتفاظ بالبيانات وإتلافها" },
    { id: "security", title: "حماية البيانات" },
    { id: "rights", title: "حقوق صاحب البيانات" },
    { id: "minors", title: "القاصرون وناقصو الأهلية" },
    { id: "updates", title: "تحديث السياسة" },
    { id: "complaints", title: "التواصل والشكاوى" },
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
            <Link href="/">الرئيسية</Link><ChevronLeft size={13} aria-hidden="true" /><span>سياسة الخصوصية</span>
          </nav>
          <div className={styles.heroGrid}>
            <div>
              <span className={styles.eyebrow}><ShieldCheck size={15} aria-hidden="true" /> الخصوصية والبيانات</span>
              <h1>سياسة الخصوصية</h1>
              <p className={styles.lead}>توضح هذه السياسة كيف يتعامل {operatorName} مع البيانات الشخصية عند استخدام الموقع أو التطبيقات أو الخدمات التعليمية المرتبطة بهما.</p>
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
              <FileText aria-hidden="true" />
              <div><strong>ملخص واضح</strong>لا نبيع بياناتك الشخصية. نعالج القدر اللازم لتشغيل الحساب وتقديم المحتوى وإتمام الطلبات وحماية المنصة ودعم المستخدم، مع مراعاة الحقوق والالتزامات النظامية ذات الصلة.</div>
            </div>

            <PrivacySections settings={settings} />
          </article>

          <aside className={styles.aside} aria-label="معلومات الوثيقة">
            <section className={styles.toc}>
              <strong className={styles.cardTitle}><FileText size={18} aria-hidden="true" /> في هذه الصفحة</strong>
              <nav aria-label="أقسام سياسة الخصوصية">{sections.map((section) => <a href={"#" + section.id} key={section.id}>{section.title}</a>)}</nav>
            </section>

            <section className={styles.identityCard}>
              <strong className={styles.cardTitle}><Building2 size={18} aria-hidden="true" /> بيانات الجهة المشغلة</strong>
              <div className={styles.identityRows}>
                {identityRows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
                {settings.support_email ? <div><span>بريد الخصوصية والدعم</span><a href={"mailto:" + settings.support_email}><Mail size={13} aria-hidden="true" /> {settings.support_email}</a></div> : <div><span>قناة الخصوصية والدعم</span><Link href="/support">فتح نموذج الدعم</Link></div>}
              </div>
            </section>

            <section className={styles.related}>
              <strong className={styles.cardTitle}><Landmark size={18} aria-hidden="true" /> وثائق مرتبطة</strong>
              <Link href="/terms">الشروط والأحكام <ChevronLeft size={15} aria-hidden="true" /></Link>
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
