import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, BookOpen, Check, CircleHelp, Compass, GraduationCap, Headphones, MessageCircle, Play, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { breadcrumbData, jsonLd, publicInformationSchema } from "@/lib/seo";
import styles from "@/app/seo-public.module.css";

const links = [
  { path: "/about", title: "عن مراس", icon: Compass },
  { path: "/why-maras", title: "لماذا مراس؟", icon: ShieldCheck },
  { path: "/how-it-works", title: "رحلة التعلم", icon: BookOpen },
  { path: "/faq", title: "الأسئلة الشائعة", icon: CircleHelp },
  { path: "/contact", title: "تواصل معنا", icon: MessageCircle },
  { path: "/join-instructors", title: "انضم كشارح", icon: UsersRound },
];
const audiences = {
  student: {
    kicker: "مساحة للفهم، ومسار للتقدّم",
    pillars: ["شرح منظّم", "مراجعة أذكى", "متابعة من حسابك"],
    heading: "كل خطوة، أقرب للفهم.", label: "خطوتك الأولى",
    lesson: "شرح يناسب مادتك", description: "شاهد المعاينة المتاحة قبل الاشتراك",
    steps: ["اكتشف", "افهم", "راجع"], footer: "دروسك وملفاتك، في مكان واحد",
    note: "المعرفة تبدأ بخطوة", noteDetail: "وأنت تختار من أين تبدأ",
  },
  instructor: {
    kicker: "فريق مراس للشرح والتعليم",
    pillars: ["خبرة تستحق المشاركة", "محتوى تصنعه بإتقان", "اتفاق واضح"],
    heading: "علمك، يصل إلى غيرك.", label: "مساحة الشارح",
    lesson: "من معرفتك، إلى درس واضح", description: "خطّط للمادة، وسجّل الشرح، وأرسل للمراجعة",
    steps: ["قدّم", "اشرح", "اترك أثرًا"], footer: "موادك وعقدك، في مساحة تخصّك",
    note: "المعرفة تبدأ بخطوة", noteDetail: "وأنت تختار من أين تبدأ",
  },
  contact: {
    kicker: "قنوات مراس الرسمية",
    pillars: ["إجابات واضحة", "قنوات معروفة", "متابعة من حسابك"],
    heading: "نسمعك، ونساعدك.", label: "ابدأ بسؤالك",
    lesson: "المساعدة في مكانها", description: "اختر القناة المناسبة، وتابع معنا",
    steps: ["اسأل", "تواصل", "تابع"], footer: "تذاكرك وردودنا، من حسابك",
    note: "سؤالك له مكان", noteDetail: "ونحن هنا لنساعدك",
  },
};

export function PublicInformationPage({ path, title, intro, children, audience = "student" }: { path: string; title: string; intro: string; children: ReactNode; audience?: keyof typeof audiences }) {
  const copy = audiences[audience];
  const HeroIcon = audience === "contact" ? Headphones : GraduationCap;
  const LessonIcon = audience === "contact" ? MessageCircle : Play;
  return <main className={styles.page}><SiteHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", ...breadcrumbData([{ name: "الرئيسية", path: "/" }, { name: title, path }]) }) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(publicInformationSchema(path, title, intro)) }} />
    <header className={styles.hero}>
      <div className={styles.heroTexture} aria-hidden="true" />
      <div className={`container ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <nav className={styles.breadcrumbs} aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><ArrowLeft size={14} aria-hidden="true" /><span>{title}</span></nav>
          <span className={styles.kicker}><span className={styles.kickerDot} aria-hidden="true" /> {copy.kicker}</span>
          <h1>{title}</h1><p>{intro}</p>
          <a href="#information-content" className={styles.explore}>اكتشف التفاصيل <span><ArrowDown size={18} aria-hidden="true" /></span></a>
          <div className={styles.heroPillars}><span><BookOpen size={16} aria-hidden="true" /> {copy.pillars[0]}</span><span><Sparkles size={16} aria-hidden="true" /> {copy.pillars[1]}</span><span><ShieldCheck size={16} aria-hidden="true" /> {copy.pillars[2]}</span></div>
        </div>
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.orbit} />
          <div className={styles.learningCanvas}>
            <div className={styles.canvasHeading}><span className={styles.canvasMark}><HeroIcon size={24} /></span><div><small>مراس العلم</small><strong>{copy.heading}</strong></div><span className={styles.canvasDots}>···</span></div>
            <div className={styles.canvasLesson}><span className={styles.canvasPlay}><LessonIcon size={23} fill={audience === "contact" ? "none" : "currentColor"} /></span><div><small>{copy.label}</small><strong>{copy.lesson}</strong><span>{copy.description}</span></div></div>
            <div className={styles.canvasJourney}><span><i><Check size={13} /></i> {copy.steps[0]}</span><b /><span><i>٢</i> {copy.steps[1]}</span><b /><span><i>٣</i> {copy.steps[2]}</span></div>
            <div className={styles.canvasFooter}><BookOpen size={16} /><span>{copy.footer}</span><ArrowLeft size={16} /></div>
          </div>
          <div className={styles.visualNote}><span><Sparkles size={19} /></span><div><strong>{copy.note}</strong><small>{copy.noteDetail}</small></div></div>
          <div className={styles.spark}>✦</div><div className={styles.smallSpark}>✦</div>
        </div>
      </div>
    </header>
    <div className={`container ${styles.navWrap}`}><nav className={styles.pageNav} aria-label="استكشف مراس">{links.map(item => { const Icon = item.icon; return <Link key={item.path} href={item.path} aria-current={path === item.path ? "page" : undefined}><Icon size={19} aria-hidden="true" /><span>{item.title}</span><ArrowLeft className={styles.navArrow} size={16} aria-hidden="true" /></Link>; })}</nav></div>
    <section data-home-reveal aria-label="تفاصيل مراس"><div id="information-content" className={`container ${styles.body}`}>{children}</div></section><SiteFooter />
  </main>;
}
