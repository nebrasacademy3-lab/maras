import Link from "next/link";
import { PublicInformationPage } from "@/components/public-information-page";
import { getAiMonthlyPrice, getAiServiceSettings } from "@/lib/ai-platform";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/tools"); }
const services = [
  { id: "chat", title: "محادثة دراسية", copy: "ناقش المفاهيم التي تحتاج إلى فهمها، واطلب أمثلة وخطوات توضيحية للمساعدة في المذاكرة." },
  { id: "summary", title: "تلخيص المحتوى", copy: "حوّل المحتوى والملفات المدعومة إلى ملخصات منظّمة، ثم ارجع للمصدر للتأكد من التفاصيل." },
  { id: "translation", title: "ترجمة المحتوى", copy: "استعن بترجمة النصوص والمحتوى الدراسي، وراجع المصطلحات المتخصصة مع مراجع المقرر." },
  { id: "quiz", title: "اختبارات تدريبية", copy: "أنشئ أسئلة للمراجعة من محتواك، وتدرّب على استرجاع المفاهيم قبل العودة إلى الدروس." },
] as const;
export default async function ToolsPage() {
  const [settings, price] = await Promise.all([getAiServiceSettings(), getAiMonthlyPrice()]);
  return <PublicInformationPage path="/tools" title="أدوات مراس للمذاكرة" intro="مساعدات بالذكاء الاصطناعي للمحادثة والتلخيص والترجمة والتدريب، ضمن مساحة حسابك.">
    <div className={styles.grid}>{services.map((service) => <section key={service.id} className={styles.card}><h2>{service.title}</h2><p>{service.copy}</p><p className={styles.muted}>{settings[service.id].enabled ? "الخدمة مفعّلة في المنصة" : "الخدمة متوقفة حاليًا"}</p><Link href={service.id === "chat" ? "/study-tools" : `/study-tools?service=${service.id}`}>فتح {service.title}</Link></section>)}</div>
    <section className={styles.section}><h2>حدود الاستخدام الحالية</h2><p>تتطلب الأدوات تسجيل الدخول. تختلف الحدود بحسب نوع الوصول، ويظهر المتبقي وحالة الاشتراك داخل حسابك.</p><div className={styles.tableWrap}><table className={styles.table}><caption>عدد الاستخدامات الشهري للخدمات المفعّلة</caption><thead><tr><th scope="col">الخدمة</th><th scope="col">الحساب المجاني</th><th scope="col">وصول المشترك</th></tr></thead><tbody>{services.filter((service) => settings[service.id].enabled).map((service) => <tr key={service.id}><th scope="row">{service.title}</th><td>{settings[service.id].freeMonthlyLimit.toLocaleString("ar-SA")}</td><td>{settings[service.id].subscriberMonthlyLimit.toLocaleString("ar-SA")}</td></tr>)}</tbody></table></div>{!services.some((service) => settings[service.id].enabled) && <p>لا توجد خدمات مفعّلة حاليًا.</p>}</section>
    <section className={styles.card}><h2>اشتراك أدوات المذاكرة</h2><p>السعر الحالي على الويب لوصول أدوات مراس لمدة ٣٠ يومًا:</p><strong className={styles.price}>{price.toLocaleString("ar-SA")} ر.س</strong><p>راجع تفاصيل الوصول والاستحقاقات المتاحة لحسابك قبل الدفع. قد يتوفر وصول ضمن اشتراك مادة أو منحة؛ يعرض حسابك حالتك الفعلية.</p><div className={styles.actions}><Link className="button button-primary" href="/study-tools">الدخول إلى الأدوات</Link><Link className="button button-ghost" href="/study-tools/subscribe">تفاصيل اشتراك حسابي</Link></div></section>
    <section className={styles.section}><h2>طريقة استخدام مفيدة</h2><ol><li>اختر الخدمة المناسبة للمهمة، وأضف المحتوى الذي يحق لك استخدامه.</li><li>حدّد المطلوب بوضوح، مثل تلخيص فكرة أو شرح مصطلح أو إنشاء أسئلة مراجعة.</li><li>راجع النتيجة مع المصدر الأصلي؛ قد يخطئ الذكاء الاصطناعي أو يحذف تفاصيل مهمة.</li><li>استخدم الأدوات لمساندة تعلمك مع مراعاة تعليمات المقرر وحقوق المحتوى.</li></ol><p><Link href="/privacy">سياسة الخصوصية</Link> · <Link href="/content-policy">حقوق المحتوى</Link> · <Link href="/faq">الأسئلة الشائعة</Link></p></section>
  </PublicInformationPage>;
}
