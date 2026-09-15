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
  return <PublicInformationPage path="/faq" title="الأسئلة الشائعة" intro="معلومات تساعدك على اختيار المادة وفهم الاشتراك وأدوات المذاكرة والوصول إلى الدعم.">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
    <section aria-label="الأسئلة والإجابات">{PUBLIC_FAQ.map((item, index) => <details className={styles.faq} key={item.question} open={index === 0}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>
    <nav className={styles.actions} aria-label="تفاصيل ومساعدة"><Link className="button button-primary" href="/contact">تواصل معنا</Link><Link className="button button-ghost" href="/refund-policy">سياسة الاسترداد</Link><Link className="button button-ghost" href="/tools">أدوات مراس</Link><Link className="button button-ghost" href="/how-it-works">كيف تعمل مراس؟</Link></nav>
  </PublicInformationPage>;
}
