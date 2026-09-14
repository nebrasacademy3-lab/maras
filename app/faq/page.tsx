import Link from "next/link";
import { PublicInformationPage } from "@/components/public-information-page";
import { PUBLIC_FAQ } from "@/lib/seo-content";
import { jsonLd, seoUrl } from "@/lib/seo";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/faq"); }
export default function FaqPage() {
  const structuredData = { "@context": "https://schema.org", "@type": "FAQPage", "@id": seoUrl("/faq#questions"), url: seoUrl("/faq"), inLanguage: "ar-SA", mainEntity: PUBLIC_FAQ.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) };
  return <PublicInformationPage path="/faq" title="الأسئلة الشائعة" intro="معلومات تساعدك على اختيار المادة، فهم الاشتراك، الوصول إلى الخدمات، ومعرفة ما الذي يمكن أن تفعله في منصة مراس.">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
    <section className={styles.card}>
      <div className={styles.faqIntro}><div><span className={styles.eyebrow}>قبل أن تبدأ</span><h2>كل التفاصيل المهمة في مكان واحد</h2><p>راجع الإجابات قبل الاشتراك، وإذا لم تجد ما تحتاجه انتقل مباشرة إلى الدعم أو أرسل طلب توفير مادة.</p></div><strong className={styles.questionCount}>{PUBLIC_FAQ.length.toLocaleString("ar-SA")} سؤالًا وإجابة</strong></div>
      <div className={styles.actions}><Link className="button button-primary" href="/courses">استكشف المواد</Link><Link className="button button-ghost" href="/contact">تحدث مع الدعم</Link></div>
    </section>
    <section className={styles.section}>
      <div className={styles.featureGrid}>
        <article className={styles.featureCard}><h3>الشراء والوصول</h3><p>تعرف على وقت التفعيل، مدة الوصول، وكيفية التحقق من صلاحية المادة داخل حسابك.</p></article>
        <article className={styles.featureCard}><h3>الأدوات المساندة</h3><p>استكشف ما تقدمه أدوات المذاكرة من تلخيص، ترجمة، وأدوات اختبار لتقوية الفهم.</p></article>
        <article className={styles.featureCard}><h3>الدعم</h3><p>تعرّف على كيفية التواصل مع فريق الدعم وصياغة طلب استرداد أو طلب مادة جديدة بشكل صحيح.</p></article>
      </div>
    </section>
    <section aria-label="الأسئلة والإجابات"><h2>إجابات مرتبة لرحلتك</h2>{PUBLIC_FAQ.map((item, index) => <details className={styles.faq} key={item.question} open={index === 0}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>
    <nav className={styles.actions} aria-label="تفاصيل ومساعدة"><Link className="button button-primary" href="/contact">تواصل معنا</Link><Link className="button button-ghost" href="/refund-policy">سياسة الاسترداد</Link><Link className="button button-ghost" href="/tools">أدوات مراس</Link><Link className="button button-ghost" href="/how-it-works">كيف تعمل مراس؟</Link></nav>
  </PublicInformationPage>;
}
