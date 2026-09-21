import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, BookOpen, Check, CircleHelp, Compass, GraduationCap, Play, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { breadcrumbData, jsonLd, publicInformationSchema } from "@/lib/seo";
import styles from "@/app/seo-public.module.css";

const links = [
  { path: "/about", title: "عن مراس", icon: Compass },
  { path: "/why-maras", title: "لماذا مراس؟", icon: ShieldCheck },
  { path: "/how-it-works", title: "رحلة التعلم", icon: BookOpen },
  { path: "/faq", title: "الأسئلة الشائعة", icon: CircleHelp },
];

export function PublicInformationPage({ path, title, intro, children, audience = "student" }: { path: string; title: string; intro: string; children: ReactNode; audience?: "student" | "instructor" }) {
  const instructor = audience === "instructor";
  return <main className={styles.page}><SiteHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", ...breadcrumbData([{ name: "الرئيسية", path: "/" }, { name: title, path }]) }) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(publicInformationSchema(path, title, intro)) }} />
    <header className={styles.hero}>
      <div className={styles.heroTexture} aria-hidden="true" />
      <div className={`container ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <nav className={styles.breadcrumbs} aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><ArrowLeft size={14} aria-hidden="true" /><span>{title}</span></nav>
          <span className={styles.kicker}><span className={styles.kickerDot} aria-hidden="true" /> {instructor ? "فريق مراس للشرح والتعليم" : "مساحة للفهم، ومسار للتقدّم"}</span>
          <h1>{title}</h1><p>{intro}</p>
          <a href="#information-content" className={styles.explore}>اكتشف التفاصيل <span><ArrowDown size={18} aria-hidden="true" /></span></a>
          <div className={styles.heroPillars}><span><BookOpen size={16} aria-hidden="true" /> {instructor ? "خبرة تستحق المشاركة" : "شرح منظّم"}</span><span><Sparkles size={16} aria-hidden="true" /> {instructor ? "محتوى تصنعه بإتقان" : "مراجعة أذكى"}</span><span><ShieldCheck size={16} aria-hidden="true" /> {instructor ? "اتفاق واضح" : "متابعة من حسابك"}</span></div>
        </div>
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.orbit} />
          <div className={styles.learningCanvas}>
            <div className={styles.canvasHeading}><span className={styles.canvasMark}><GraduationCap size={24} /></span><div><small>مراس العلم</small><strong>{instructor ? "علمك، يصل إلى غيرك." : "كل خطوة، أقرب للفهم."}</strong></div><span className={styles.canvasDots}>···</span></div>
            <div className={styles.canvasLesson}><span className={styles.canvasPlay}><Play size={23} fill="currentColor" /></span><div><small>{instructor ? "مساحة الشارح" : "خطوتك الأولى"}</small><strong>{instructor ? "من معرفتك، إلى درس واضح" : "شرح يناسب مادتك"}</strong><span>{instructor ? "خطّط للمادة، وسجّل الشرح، وأرسل للمراجعة" : "شاهد المعاينة المتاحة قبل الاشتراك"}</span></div></div>
            <div className={styles.canvasJourney}><span><i><Check size={13} /></i> {instructor ? "قدّم" : "اكتشف"}</span><b /><span><i>٢</i> {instructor ? "اشرح" : "افهم"}</span><b /><span><i>٣</i> {instructor ? "اترك أثرًا" : "راجع"}</span></div>
            <div className={styles.canvasFooter}><BookOpen size={16} /><span>{instructor ? "موادك وعقدك، في مساحة تخصّك" : "دروسك وملفاتك، في مكان واحد"}</span><ArrowLeft size={16} /></div>
          </div>
          <div className={styles.visualNote}><span><Sparkles size={19} /></span><div><strong>المعرفة تبدأ بخطوة</strong><small>وأنت تختار من أين تبدأ</small></div></div>
          <div className={styles.spark}>✦</div><div className={styles.smallSpark}>✦</div>
        </div>
      </div>
    </header>
    <div className={`container ${styles.navWrap}`}><nav className={styles.pageNav} aria-label="استكشف مراس">{links.map(item => { const Icon = item.icon; return <Link key={item.path} href={item.path} aria-current={path === item.path ? "page" : undefined}><Icon size={19} aria-hidden="true" /><span>{item.title}</span><ArrowLeft className={styles.navArrow} size={16} aria-hidden="true" /></Link>; })}</nav></div>
    <section data-home-reveal aria-label="تفاصيل مراس"><div id="information-content" className={`container ${styles.body}`}>{children}</div></section><SiteFooter />
  </main>;
}
