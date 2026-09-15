import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, CircleHelp, Compass, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { breadcrumbData, jsonLd } from "@/lib/seo";
import styles from "@/app/seo-public.module.css";
const links = [{ path: "/about", title: "عن مراس", icon: Compass }, { path: "/why-maras", title: "لماذا مراس؟", icon: ShieldCheck }, { path: "/how-it-works", title: "رحلة التعلم", icon: BookOpen }, { path: "/faq", title: "الأسئلة الشائعة", icon: CircleHelp }];
export function PublicInformationPage({ path, title, intro, children }: { path: string; title: string; intro: string; children: ReactNode }) {
  return <main className={styles.page}><SiteHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", ...breadcrumbData([{ name: "الرئيسية", path: "/" }, { name: title, path }]) }) }} />
    <header className={styles.hero}><div className={`container ${styles.heroGrid}`}>
      <div><nav className={styles.breadcrumbs} aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><ArrowLeft size={14} aria-hidden="true"/><span>{title}</span></nav><span className={styles.kicker}><Sparkles size={16} aria-hidden="true"/> معرفة أوضح. تجربة أقرب.</span><h1>{title}</h1><p>{intro}</p><a href="#information-content" className={styles.explore}>اكتشف التفاصيل <ArrowLeft size={17}/></a></div>
      <div className={styles.visual} aria-hidden="true"><div className={styles.orbit}/><div className={styles.visualMain}><BookOpen size={36}/><strong>مراس العلم</strong><span>شرح · مراجعة · متابعة</span></div><div className={styles.visualNote}><ShieldCheck size={22}/><span>حسابك، دروسك، وخطوتك التالية</span></div><div className={styles.spark}>✦</div></div>
    </div></header>
    <div className={`container ${styles.navWrap}`}><nav className={styles.pageNav} aria-label="استكشف مراس">{links.map(item => { const Icon = item.icon; return <Link key={item.path} href={item.path} aria-current={path === item.path ? "page" : undefined}><Icon size={19}/><span>{item.title}</span></Link>; })}</nav></div>
    <div id="information-content" className={`container ${styles.body}`}>{children}</div><SiteFooter />
  </main>;
}
