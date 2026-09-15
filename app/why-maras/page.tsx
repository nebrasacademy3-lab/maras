import Link from "next/link";
import { PublicInformationPage } from "@/components/public-information-page";
import { getInformationContent } from "@/lib/information-content";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";
export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/why-maras"); }
export default async function WhyMaras() {
  const { content } = await getInformationContent();
  return <PublicInformationPage path="/why-maras" title="لماذا تختار مراس؟" intro="ليست مجرد روابط للدروس؛ تجربة تربط قرارك قبل الاشتراك بتعلّمك ومراجعتك ومتابعتك بعده."><section className={styles.section}><span className={styles.sectionLabel}>الوضوح يصنع الفرق</span><h2>اعرف ما تختاره، وأين تتابعه.</h2><p>عند اختيار خدمة تعليمية، ابحث عن تفاصيل قابلة للمراجعة: محتوى واضح، مدة وصول معلنة، وسيلة متابعة للطلبات، وقنوات تواصل معروفة. لا تعتمد على الوعود العامة أو على شخص يطلب بيانات دخولك.</p></section><div className={styles.timeline}>{content.about.why.map((item,i) => <article className={styles.step} key={i}><div><h2>{item.title}</h2><p>{item.body}</p></div></article>)}</div><section className={styles.trust}><div><span className={styles.sectionLabel}>ثقة دون مبالغة</span><h2>ما الذي لا نَعِد به؟</h2><p>لا يوجد نظام خالٍ من المخاطر، ولا أداة ذكاء اصطناعي معصومة من الخطأ. ولا نَعِد بدرجة دراسية أو اعتماد غير موثّق.</p></div><div><h3>وما الذي يمكنك مراجعته؟</h3><p>صفحة المادة، تجربة الشرح المتاحة، سياسة الاسترداد، إعدادات حماية حسابك، وسجل طلباتك وتذاكرك.</p><div className={styles.actions}><Link className="button button-primary" href="/courses">راجع المواد بنفسك</Link><Link className="button button-ghost" href="/faq">اقرأ الإجابات</Link></div></div></section></PublicInformationPage>;
}
