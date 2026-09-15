import Link from "next/link";
import { BookOpen, Compass, Layers, ListChecks, ShieldCheck, Sparkles, Target, UsersRound } from "lucide-react";
import { PublicInformationPage } from "@/components/public-information-page";
import { getInformationContent } from "@/lib/information-content";
import { getPublicSettings } from "@/lib/platform-settings";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";
export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/about"); }
export default async function AboutPage() {
  const [{ content }, settings] = await Promise.all([getInformationContent(), getPublicSettings()]);
  const about = content.about; const icons = [Layers, ListChecks, UsersRound, ShieldCheck, Sparkles, BookOpen];
  return <PublicInformationPage path="/about" title={about.title} intro={about.intro}>
    <section className={styles.section}><span className={styles.sectionLabel}>الفهم أولًا</span><h2>دراسة أقل تشتتًا، وخطوة أوضح.</h2><p>اختيار شرح مناسب لا ينتهي بالوصول إلى رابط فيديو. تحتاج إلى معرفة ما ستدرسه، وكيف ستراجعه، وأين تتابع تقدمك، ومن تتواصل معه عند الحاجة. تجمع مراس هذه الخطوات في مساحة تعليمية مساندة مرتبطة بحسابك.</p><p>ابدأ من جامعتك وتخصصك، وقارن توصيف المادة بخطتك الرسمية. لا تدّعي مراس أنها بديل عن الجامعة أو أنها تضمن نتيجة دراسية؛ دورها أن تساند وقتك وجهدك بمحتوى منظم وأدوات واضحة.</p></section>
    <div className={styles.split}><section className={styles.featurePanel}><Target size={30}/><span className={styles.sectionLabel}>رسالتنا</span><h2>أن يصل الشرح إلى احتياجك</h2><p>{about.mission}</p></section><section className={styles.featurePanel}><Compass size={30}/><span className={styles.sectionLabel}>رؤيتنا</span><h2>ثقة تُبنى بالتجربة والوضوح</h2><p>{about.vision}</p></section></div>
    <section><span className={styles.sectionLabel}>لماذا تختار مراس؟</span><h2>ما تحتاجه في تجربة مترابطة</h2><div className={styles.grid}>{about.why.map((item,index) => { const Icon = icons[index % icons.length]; return <article key={index} className={styles.card}><span className={styles.cardIcon}><Icon size={25}/></span><h3>{item.title}</h3><p>{item.body}</p></article>; })}</div></section>
    <section className={styles.trust}><div><span className={styles.sectionLabel}>قبل أن تثق بأي رابط</span><h2>تعامَل من القنوات المنشورة، وتحقّق.</h2><p>وجود الطلبات والدعم داخل حسابك يساعد على متابعة ما اتفقت عليه، بدل التعامل مع حسابات غير معروفة أو جهات تدّعي تمثيل المنصة.</p><Link href="/why-maras">تعرّف على تجربة مراس وضوابط الاستخدام</Link></div><ol><li>ابدأ من نطاق مراس العام وتأكد من اسم الموقع.</li><li>راجع السعر والمحتوى ومدة الوصول قبل الشراء.</li><li>تحقق من بيانات المنشأة وروابط الإثبات المنشورة عند توفرها.</li><li>احتفظ برقم الطلب ولا تشارك كلمة المرور أو رمز MFA.</li></ol></section>
    {(settings.legal_name || settings.legal_address || settings.support_email) && <section className={styles.card}><span className={styles.sectionLabel}>بيانات معلنة</span><h2>التواصل والمنشأة</h2><dl className={styles.facts}>{settings.legal_name && <><dt>اسم المنشأة</dt><dd>{settings.legal_name}</dd></>}{settings.legal_address && <><dt>العنوان</dt><dd>{settings.legal_address}</dd></>}{settings.support_email && <><dt>بريد الدعم</dt><dd><a href={`mailto:${settings.support_email}`}>{settings.support_email}</a></dd></>}</dl><p className={styles.muted}>تُعرض البيانات كما نشرتها إدارة المنصة. لا يُستنتج منها اعتماد أكاديمي غير معلن.</p></section>}
    <section className={styles.section}><span className={styles.sectionLabel}>خطوتك التالية</span><h2>ابدأ بما تحتاجه الآن</h2><div className={styles.actions}><Link className="button button-primary" href="/courses">استكشف المواد</Link><Link className="button button-ghost" href="/faq">مركز الأسئلة الشائعة</Link><Link className="button button-ghost" href="/request-course">طلب توفير مادة</Link></div></section>
  </PublicInformationPage>;
}
