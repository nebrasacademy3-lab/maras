import Link from "next/link";
import { ArrowLeft, BookOpenCheck, GraduationCap, Sparkles } from "lucide-react";
import styles from "./home-learning-path.module.css";
const steps = [
  { href: "/universities", number: "01", label: "اعثر على مساحتك", title: "من جامعتك، نبدأ.", text: "اختر جامعتك وتخصصك، ووصل إلى الشرح الأقرب لخطة دراستك.", action: "اختر جامعتك", icon: GraduationCap },
  { href: "/courses", number: "02", label: "من السؤال إلى الفهم", title: "جرّب. افهم. أكمل.", text: "استكشف تفاصيل المادة، وشاهد الدرس التجريبي المتاح قبل الاشتراك.", action: "استكشف الشروحات", icon: BookOpenCheck },
  { href: "/study-tools", number: "03", label: "مذاكرة على طريقتك", title: "خلّ الفكرة تثبت.", text: "رتّب ملفاتك وراجع مفاهيمك بالتلخيص والترجمة والأسئلة التدريبية.", action: "اكتشف أدوات مراس", icon: Sparkles },
];
export function HomeLearningPath() {
  return <section className={styles.section} aria-labelledby="learning-path-title" data-home-reveal><div className="container"><header className={styles.heading}><span className="eyebrow">كل خطوة تقرّبك</span><h2 id="learning-path-title">ليس مجرد شرح.<br />{" "}<em>مسار أوضح لتعلّمك.</em></h2><p>ابدأ بما تحتاجه الآن، واترك الباقي لخطوتك التالية.</p></header><div className={styles.grid}>{steps.map(({ href, number, label, title, text, action, icon: Icon }) => <article key={number} className={styles.card} data-motion><div className={styles.cardTop}><span className={styles.icon}><Icon size={27} strokeWidth={1.6} /></span><b aria-hidden="true">{number}</b></div><small>{label}</small><h3>{title}</h3><p>{text}</p><Link href={href}>{action}<ArrowLeft size={17} /></Link></article>)}</div><div className={styles.note}><span aria-hidden="true" />جامعة. مادة. لحظة فهم.</div></div></section>;
}
