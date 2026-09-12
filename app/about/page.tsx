import Link from "next/link";
import { PublicInformationPage } from "@/components/public-information-page";
import { getPublicSettings } from "@/lib/platform-settings";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/about"); }
export default async function AboutPage() {
  const settings = await getPublicSettings();
  return <PublicInformationPage path="/about" title="عن مراس العلم" intro="شروحات جامعية ومواد للمذاكرة، مرتبة لتصل إلى ما تحتاجه بحسب جامعتك وتخصصك.">
    <section className={styles.section}><h2>ما الذي تقدمه مراس؟</h2><p>تجمع مراس العلم شروحات المقررات الجامعية في صفحات توضّح موضوع المادة ووحداتها ودروسها والسعر ومدة الوصول. يمكنك استعراض المحتوى المنشور ومشاهدة المعاينات المجانية المتاحة قبل اتخاذ قرار الاشتراك.</p><p>تستطيع متابعة موادك وتقدمك وطلباتك من حساب واحد، والاستعانة بأدوات المذاكرة عند توفرها لحسابك. مراس خدمة تعليمية مساندة؛ راجع توصيف المقرر والخطة الرسمية لدى جامعتك عند اختيار المادة.</p></section>
    <div className={styles.grid}>
      <section className={styles.card}><h2>ابدأ من جامعتك</h2><p>استعرض الجهات والتخصصات والمواد المرتبطة بها، وافتح صفحة المقرر للتأكد من ملاءمته لدراستك.</p><Link href="/universities">دليل الجامعات والكليات</Link></section>
      <section className={styles.card}><h2>تعلّم وتدرّب</h2><p>راجع الدروس وأكمل تقدمك، واستخدم التلخيص والترجمة والاختبارات التدريبية ضمن الخدمات وحدود الاستخدام المتاحة.</p><Link href="/tools">تعرف على أدوات المذاكرة</Link></section>
      <section className={styles.card}><h2>اختيارات واضحة</h2><p>قارن تفاصيل المواد والباقات وتحقق من شروط الوصول وسياسة الاسترداد قبل الشراء.</p><Link href="/bundles">استعرض باقات المواد</Link></section>
    </div>
    {(settings.legal_name || settings.legal_address || settings.support_email) && <section className={styles.section}><h2>بيانات التواصل والمنشأة</h2><dl className={styles.facts}>{settings.legal_name && <><dt>اسم المنشأة</dt><dd>{settings.legal_name}</dd></>}{settings.legal_address && <><dt>العنوان</dt><dd>{settings.legal_address}</dd></>}{settings.support_email && <><dt>الدعم</dt><dd><a href={`mailto:${settings.support_email}`}>{settings.support_email}</a></dd></>}</dl><p><Link href="/contact">وسائل التواصل المنشورة</Link></p></section>}
    <section className={styles.section}><h2>ابدأ بخطوة تناسبك</h2><p>تصفح المادة التي تحتاجها، أو اطلب توفيرها إن لم تجدها. يجيب مركز الأسئلة الشائعة عن الاشتراك والدفع والوصول والدعم.</p><div className={styles.actions}><Link className="button button-primary" href="/courses">استكشف المواد</Link><Link className="button button-ghost" href="/faq">الأسئلة الشائعة</Link><Link className="button button-ghost" href="/request-course">طلب توفير مادة</Link></div></section>
  </PublicInformationPage>;
}
