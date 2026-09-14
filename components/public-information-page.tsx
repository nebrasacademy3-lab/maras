import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { breadcrumbData, jsonLd } from "@/lib/seo";
import styles from "@/app/seo-public.module.css";

export function PublicInformationPage({ path, title, intro, children }: { path: string; title: string; intro: string; children: ReactNode }) {
  return <main><SiteHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", ...breadcrumbData([{ name: "الرئيسية", path: "/" }, { name: title, path }]) }) }} />
    <section className={`page-hero ${styles.hero}`}><div className="container">
      <nav className="breadcrumbs" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link><span aria-hidden="true">/</span><span>{title}</span></nav>
      <div className={styles.heroContent}><div><span className={styles.eyebrow}>مراس العلم · معرفة أوضح وقرار أفضل</span><h1>{title}</h1><p>{intro}</p></div><div className={styles.heroBadge} aria-hidden="true"><span>م</span><small>تعلم<br />منظم</small></div></div>
      <div className={styles.trustStrip} aria-label="مزايا مراس الأساسية"><span>محتوى مرتب حسب جامعتك</span><span>تفاصيل واضحة قبل الاشتراك</span><span>تجربة ويب وتطبيق متكاملة</span></div>
    </div></section>
    <div className={`container ${styles.body}`}>{children}</div><SiteFooter />
  </main>;
}
