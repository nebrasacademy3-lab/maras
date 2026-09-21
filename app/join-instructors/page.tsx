import Link from "next/link";
import { ArrowLeft, BookOpen, Check, Clock3, FileCheck2, GraduationCap, Mic2, ShieldCheck, Sparkles } from "lucide-react";
import { PublicInformationPage } from "@/components/public-information-page";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "./instructors.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/join-instructors"); }

const steps = [
  { title: "عرّفنا بك", body: "أنشئ حساب شارح، وأكّد بريدك، وأكمل بياناتك وتخصصك والمواد التي تستطيع شرحها." },
  { title: "أضف ما يدعم خبرتك", body: "استكمل متطلبات التحقق التي تظهر في ملفك، وأرفق سيرتك الذاتية وشهاداتك المتاحة، ثم أرسل الطلب للمراجعة." },
  { title: "راجع عرض العمل", body: "تراجع الإدارة طلبك وتطلب أي استكمال. عند الموافقة، يصلك عقد العمل لتراجع الأجر والفترة التجريبية والبنود قبل توقيعه." },
  { title: "ابدأ شرح مادتك", body: "بعد استكمال الموافقات والعقد، تُسند إليك المادة وملفاتها. تنظم الوحدات والدروس وترفع الشرح، ثم ترسله للمراجعة قبل النشر." },
];

export default function JoinInstructorsPage() {
  return <PublicInformationPage path="/join-instructors" title="شارك علمك. واصنع أثرًا." intro="انضم إلى فريق مراس كشارح، وحوّل معرفتك إلى دروس تساعد الطالب على الفهم. نبحث عن وضوح الفكرة، وإتقان الشرح، والالتزام بجودة المحتوى." audience="instructor">
    <section className={styles.introduction} data-motion="reveal" aria-labelledby="join-title">
      <div><span className={styles.eyebrow}>التعليم يبدأ بمن يشرح بإخلاص</span><h2 id="join-title">لديك القدرة على تبسيط المعلومة؟<br /><span>هنا تبدأ خطوتك.</span></h2><p>سواء كنت طالبًا جامعيًا متمكنًا، أو خريجًا، أو صاحب خبرة في تخصصك، أخبرنا عمّا تعرفه وكيف تستطيع شرحه. تقييم الطلب يعتمد على ملاءمة خبرتك، وجودة الشرح، واحتياج المنصة.</p><div className={styles.actions}><Link href="/instructor/register" className="button button-primary">قدّم طلب الانضمام <ArrowLeft size={18} /></Link><Link href="/login?return_to=%2Finstructor" className="button button-ghost">لدي حساب شارح</Link></div><p className={styles.note}>تقديم الطلب لا يعني القبول أو بدء علاقة العمل. تبدأ المهام بعد الموافقة واستكمال عقد العمل.</p></div>
      <aside className={styles.profileCard}><div className={styles.profileIcon}><GraduationCap size={34} /></div><span className={styles.eyebrow}>ما نبحث عنه</span><h3>معرفة قوية.<br />وشرح يصل.</h3><ul><li><Check size={17} /> فهم متين للمادة ومصطلحاتها</li><li><Check size={17} /> شرح واضح وأمثلة مترابطة</li><li><Check size={17} /> تسجيل بصوت وصورة واضحين</li><li><Check size={17} /> محتوى أصلي والتزام بالمواعيد</li></ul></aside>
    </section>

    <section className={styles.section} aria-labelledby="work-models"><div className={styles.sectionHead}><span className={styles.eyebrow}>نظام يناسب المهمة المتفق عليها</span><h2 id="work-models">طريقتان لاحتساب المقابل</h2><p>اختر تفضيلك في الطلب، وتحدد الإدارة النموذج والأجر وآلية الاعتماد والصرف في عرض العمل والعقد.</p></div><div className={styles.modelGrid}>
      <article className={styles.modelCard} data-motion="reveal"><span className={styles.modelIcon}><Clock3 size={25} /></span><small>النظام الأول</small><h3>حسب ساعات الشرح</h3><p>يُحدد سعر الساعة مسبقًا، مع توضيح طريقة احتساب ساعات الشرح المقبولة واعتمادها، وما تشمله المهمة من إعداد أو مراجعة.</p><div><Check size={16} /><span>الأجر والساعات المعتمدة موضحان في العقد</span></div></article>
      <article className={styles.modelCard} data-motion="reveal"><span className={styles.modelIcon}><BookOpen size={25} /></span><small>النظام الثاني</small><h3>حسب المادة المكتملة</h3><p>يُحدد مقابل المادة ونطاق وحداتها ودروسها ومواعيد التسليم ومعايير إكمالها، مع توضيح التعديلات المطلوبة وآلية اعتماد العمل.</p><div><Check size={16} /><span>نطاق واضح وتسليم يخضع للمراجعة</span></div></article>
    </div></section>

    <section className={styles.section} aria-labelledby="application-journey"><div className={styles.sectionHead}><span className={styles.eyebrow}>من التعارف إلى أول درس</span><h2 id="application-journey">رحلتك مع فريق مراس</h2></div><ol className={styles.journey}>{steps.map((step, index) => <li key={step.title} data-motion="reveal"><span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol></section>

    <section className={styles.expectations} data-motion="reveal" aria-labelledby="expectations-title"><div><span className={styles.eyebrow}>اتفاق نبدأ به بوضوح</span><h2 id="expectations-title">جودة تحترم الطالب،<br />وحقوق تحترم الجميع.</h2><p>قبل قبول العرض، راجع جميع بنود العقد بالعربية والإنجليزية، بما فيها الفترة التجريبية، والمقابل المالي، ومواعيد التسليم، وحقوق المحتوى.</p></div><div className={styles.expectationList}><article><FileCheck2 size={23} /><div><h3>محتوى تملكه أو تملك حق استخدامه</h3><p>قدّم شرحك الأصلي، وأفصح عن مصادر المواد والمراجع. يحدد العقد ضوابط استخدام المحتوى وإعادة نشره ومسؤوليات كل طرف.</p></div></article><article><Mic2 size={23} /><div><h3>مراجعة قبل النشر</h3><p>تراجع الإدارة جودة الدروس ومطابقتها للمادة، وقد تطلب تحسينات قبل اعتماد الشرح وإتاحته للطلاب.</p></div></article><article><ShieldCheck size={23} /><div><h3>ملف شخصي محمي</h3><p>تُستخدم مستنداتك لمراجعة طلبك والتحقق، مع إظهار إشعار الخصوصية والغرض ومدة الاحتفاظ عند الرفع. لا تُعرض وثائقك في الصفحات العامة.</p></div></article></div></section>

    <section className={styles.section} aria-labelledby="instructor-faq"><div className={styles.sectionHead}><span className={styles.eyebrow}>قبل أن تبدأ</span><h2 id="instructor-faq">أسئلة تهمك</h2></div><div className={styles.faq}>
      <details><summary>هل يلزم أن أكون خريجًا أو أستاذًا جامعيًا؟</summary><p>يمكنك توضيح مؤهلك الحالي حتى لو كنت طالبًا. تنظر الإدارة في تمكنك من المادة وقدرتك على الشرح والأدلة التي تدعم خبرتك، ويظل قبول الطلب خاضعًا للمراجعة.</p></details>
      <details><summary>هل يمكن اختيار المواد أو تحديد سعر الشرح؟</summary><p>اذكر المواد التي تتقنها ونظام العمل الذي تفضله. تُسند المواد وفق حاجة المنصة، وتحدد الإدارة السعر والشروط في العقد المعروض عليك؛ لا يبدأ العمل قبل الاتفاق.</p></details>
      <details><summary>ما المطلوب للتحقق من الهوية؟</summary><p>تظهر متطلبات التحقق وإشعار الخصوصية في ملف التقديم. عند إتاحة رفع وثائق الهوية، تشمل هوية واضحة من الوجهين أو جواز سفر وصورة تلتقطها بالكاميرا. لا ترسل وثائقك عبر البريد أو قنوات غير مخصصة، ويمكنك إضافة السيرة الذاتية والشهادات من ملفك.</p></details>
      <details><summary>هل تضمن المنصة قبول طلبي أو عددًا معينًا من الساعات؟</summary><p>لا. تُراجع الطلبات حسب التخصص والجودة والاحتياج. تفاصيل العمل والساعات أو المواد وأجرها تكون في العقد، ولا تُعد المعلومات العامة هنا وعدًا بالتوظيف أو الدخل.</p></details>
    </div></section>

    <section className={styles.finalCta} data-motion="reveal"><Sparkles size={28} /><h2>قد تكون فكرتك سببًا في فهم طالب.</h2><p>عرّفنا بخبرتك، ودعنا نبدأ من المادة التي تتقنها.</p><Link href="/instructor/register" className="button button-primary">ابدأ طلبك الآن <ArrowLeft size={18} /></Link><Link className={styles.contactLink} href="/contact">لديك استفسار؟ تواصل مع الفريق</Link></section>
  </PublicInformationPage>;
}
