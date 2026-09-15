import Link from "next/link";
import { PublicInformationPage } from "@/components/public-information-page";
import { PublicFaq } from "@/components/public-faq";
import { getInformationContent } from "@/lib/information-content";
import { jsonLd, seoUrl } from "@/lib/seo";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";
export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/faq"); }
export default async function FaqPage() {
  const { content } = await getInformationContent();
  const structuredData = { "@context": "https://schema.org", "@type": "FAQPage", "@id": seoUrl("/faq#questions"), url: seoUrl("/faq"), inLanguage: "ar-SA", mainEntity: content.faq.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) };
  return <PublicInformationPage path="/faq" title="الأسئلة الشائعة" intro="من اختيار مادتك إلى حماية حسابك: إجابات مرتّبة لتعرف خطوتك التالية، دون حيرة."><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}/><PublicFaq questions={content.faq}/><section className={styles.trust}><div><span className={styles.sectionLabel}>سؤالك خاص بحسابك؟</span><h2>متابعة تحفظ التفاصيل</h2><p>قدّم رقم الطلب واسم المادة ووصف المشكلة. لا تشارك كلمة المرور أو رموز التحقق.</p></div><div className={styles.actions}><Link className="button button-primary" href="/support">افتح تذكرة دعم</Link><Link className="button button-ghost" href="/contact">قنوات التواصل</Link><Link className="button button-ghost" href="/refund-policy">سياسة الاسترداد</Link></div></section></PublicInformationPage>;
}
