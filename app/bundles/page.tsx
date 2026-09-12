import Link from "next/link";
import { PublicInformationPage } from "@/components/public-information-page";
import { getPublicBundleCatalog } from "@/lib/seo-catalog";
import { itemListData, jsonLd, seoSegment } from "@/lib/seo";
import { staticPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";

export const dynamic = "force-dynamic";
export function generateMetadata() { return staticPublicPageMetadata("/bundles"); }
export default async function BundlesPage() {
  const bundles = await getPublicBundleCatalog();
  return <PublicInformationPage path="/bundles" title="باقات المواد الجامعية" intro="مواد محددة في باقة واحدة، مع عرض السعر الإجمالي والتوفير وتفاصيل كل مادة قبل الشراء.">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", ...itemListData("باقات المواد المتاحة", bundles.map((bundle) => ({ name: bundle.title, path: `/bundles/${seoSegment(bundle.slug)}` }))) }) }} />
    {bundles.length ? <div className={styles.grid}>{bundles.map((bundle) => <article className={styles.card} key={bundle.slug}><h2><Link href={`/bundles/${seoSegment(bundle.slug)}`}>{bundle.title}</Link></h2><p>{bundle.description}</p><ul>{bundle.courses.map((course) => <li key={course.slug}><Link href={`/courses/${seoSegment(course.slug)}`}>{course.title}</Link></li>)}</ul><p><del>{bundle.subtotal.toLocaleString("ar-SA")} ر.س</del><strong className={styles.price}>{bundle.total.toLocaleString("ar-SA")} ر.س</strong>وفّر {bundle.discount.toLocaleString("ar-SA")} ر.س</p><Link className="button button-primary" href={`/bundles/${seoSegment(bundle.slug)}`}>تفاصيل الباقة</Link></article>)}</div> : <section className={styles.card}><h2>لا توجد باقات متاحة حاليًا</h2><p>تظهر هنا الباقات المنشورة أثناء فترة توفرها وعندما تكون موادها جاهزة للاشتراك. يمكنك استعراض المواد بشكل منفصل الآن.</p><Link className="button button-primary" href="/courses">تصفح المواد</Link></section>}
    <section className={styles.section}><h2>قبل اختيار الباقة</h2><p>افتح صفحات المواد للتأكد من الجامعة والتخصص والمحتوى ومدة الوصول. السعر المعروض يخص المواد المحددة في الباقة، ويُراجع إجمالي الطلب في السلة قبل الدفع. تتغير العروض بحسب وقت التوفر والأسعار الحالية.</p><p><Link href="/refund-policy">سياسة الاسترداد</Link> · <Link href="/faq">الأسئلة الشائعة</Link></p></section>
  </PublicInformationPage>;
}
