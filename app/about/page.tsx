import Link from "next/link";
import { PublicInformationPage } from "@/components/public-information-page";
import { getPublicSettings } from "@/lib/platform-settings";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/about"); }
export default async function AboutPage() {
  const settings = await getPublicSettings();
  return <PublicInformationPage path="/about" title="عن مراس العلم" intro="منصة تعليمية سعودية تجمع المواد الجامعية، الدروس، الأدوات المساندة، والاعتمادات المتاحة في بيئة موثوقة وواضحة." >
    <section className={styles.section}>
      <div className={styles.statsRow}>
        <div className={styles.statCard}><span className={styles.statValue}>+400</span><span className={styles.statLabel}>مادة في مسارها</span></div>
        <div className={styles.statCard}><span className={styles.statValue}>24/7</span><span className={styles.statLabel}>دعم ومتابعة</span></div>
        <div className={styles.statCard}><span className={styles.statValue}>100%</span><span className={styles.statLabel}>شفافية في الوصول</span></div>
      </div>
      <h2>ما الذي تقدمه مراس؟</h2>
      <p>تجمع مراس العلم شروحات المقررات الجامعية في تجربة منظمة: جامعة/تخصص/مادة/وحدة/درس، مع تفاصيل واضحة عن السعر، مدة الوصول، والمعاينة قبل الشراء. هدفنا أن تبقى رحلة التعلم مريحة، موثوقة، وموجهة بما يتناسب مع طبيعة كل طالب.</p>
      <p>من خلال الحساب الواحد يمكنك متابعة المواد، مراجعة التقدم، وفتح أدوات المذاكرة والملفات المساندة عند توفرها. نؤكد أن كل اختيار للمواد يجب أن يراعى الخطة الرسمية للجامعة والتخصص، وأن المعلومات في مراس تمكّن الطالب من المقارنة واتخاذ القرار بثقة.</p>
    </section>

    <div className={styles.grid}>
      <section className={styles.card}><h2>ابدأ من جامعتك</h2><p>استعرض الجامعات، التخصصات، والمواد المرتبطة بها لتجد المسار المناسب لك دون تعقيد. كل صفحة مادة توضح أهدافها وحددات المحتوى وربطه بمتطلبات الدراسة.</p><Link href="/universities">دليل الجامعات والكليات</Link></section>
      <section className={styles.card}><h2>تعلّم وتدرّب</h2><p>تابع الدروس، راجع الملفات المساندة، واستفد من التلخيص والترجمة والاختبارات التدريبية داخل أدوات المذاكرة بأمان ووضوح.</p><Link href="/tools">تعرف على أدوات المذاكرة</Link></section>
      <section className={styles.card}><h2>اختيارات واضحة</h2><p>قارن تفاصيل المواد والباقات، وتأكد من شروط الوصول والاسترداد والمدة قبل الدفع. القرار عندك، لكن المعلومات في متناول يدك.</p><Link href="/bundles">استعرض باقات المواد</Link></section>
    </div>

    <section className={styles.section}>
      <h2>لماذا تختار مراس؟</h2>
      <ul className={styles.checkList}>
        <li>تنظيم واضح بحسب الجامعة والتخصص والمادة</li>
        <li>واجهة مبسطة تركز على سرعة الوصول إلى المحتوى</li>
        <li>تجربة موحدة على الويب والتطبيق</li>
        <li>أدوات تعليمية تساعدك على فهم المحتوى وليس مجرد مشاهدته</li>
        <li>بيئة مستقرة وأكثر أمانًا مقارنة بالعروض غير الرسمية</li>
      </ul>
    </section>

    <section className={styles.section}>
      <h2>بيئة واحدة بدل خطوات مشتتة</h2>
      <div className={styles.featureGrid}>
        <article className={styles.featureCard}><h3>من المصدر إلى الدرس</h3><p>تصل إلى المادة من كتالوج منظم، ثم تتابع الوحدات والدروس والملفات من داخل حسابك دون الاعتماد على روابط مجهولة.</p></article>
        <article className={styles.featureCard}><h3>من الاشتراك إلى الدعم</h3><p>تظهر حالة الطلب والوصول والدعم في مسارات واضحة، لتعرف أين وصلت معاملتك وما الخطوة التالية.</p></article>
        <article className={styles.featureCard}><h3>من المشاهدة إلى الفهم</h3><p>تساعدك أدوات المذاكرة والاختبارات التدريبية على مراجعة المحتوى، مع التأكيد على الرجوع للمصدر الأصلي.</p></article>
      </div>
    </section>

    <section className={styles.section}>
      <h2>كيف تقدم مراس تجربة آمنة وموثوقة؟</h2>
      <div className={styles.featureGrid}>
        <article className={styles.featureCard}><h3>الوصول المنظم</h3><p>يتم التحكم في صلاحية المواد والملفات داخل النظام بحيث يظل الوصول منضبطًا وفق اشتراك الطالب.</p></article>
        <article className={styles.featureCard}><h3>دعم موثوق</h3><p>يوفر النظام مسارات واضحة للدعم، التتبع، وحل الطلبات مع إظهار الحالة بدقة في الحساب.</p></article>
        <article className={styles.featureCard}><h3>محتوى واضح</h3><p>تُعرض المعلومات الأساسية في صفحات المواد بوضوح: الوحدات، الدروس، الأسعار، والمدة، بما يقلل الالتباس.</p></article>
      </div>
    </section>

    {(settings.legal_name || settings.legal_address || settings.support_email) && <section className={styles.section}><h2>بيانات التواصل والمنشأة</h2><dl className={styles.facts}>{settings.legal_name && <><dt>اسم المنشأة</dt><dd>{settings.legal_name}</dd></>}{settings.legal_address && <><dt>العنوان</dt><dd>{settings.legal_address}</dd></>}{settings.support_email && <><dt>الدعم</dt><dd><a href={`mailto:${settings.support_email}`}>{settings.support_email}</a></dd></>}</dl><p><Link href="/contact">وسائل التواصل المنشورة</Link></p></section>}
    <section className={styles.section}><h2>ابدأ بخطوة تناسبك</h2><p>تصفح المادة التي تحتاجها، أو اطلب توفيرها إن لم تجدها. يجيب مركز الأسئلة الشائعة عن الاشتراك والدفع والوصول والدعم، مع كل التفاصيل المهمة قبل اتخاذ القرار.</p><div className={styles.actions}><Link className="button button-primary" href="/courses">استكشف المواد</Link><Link className="button button-ghost" href="/faq">الأسئلة الشائعة</Link><Link className="button button-ghost" href="/request-course">طلب توفير مادة</Link></div></section>
  </PublicInformationPage>;
}
