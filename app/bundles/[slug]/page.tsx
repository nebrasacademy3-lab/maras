import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicInformationPage } from "@/components/public-information-page";
import { CourseBundleOffers } from "@/components/course-bundle-offers";
import { getPublicBundleCatalog } from "@/lib/seo-catalog";
import { bundleSeoDescription } from "@/lib/seo-pages";
import { itemListData, jsonLd, seoSegment } from "@/lib/seo";
import { resolvedPublicPageMetadata } from "@/lib/seo-settings";
import styles from "@/app/seo-public.module.css";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";
async function bundleBySlug(slug: string) {
  const bundle = (await getPublicBundleCatalog()).find((item) => item.slug === slug);
  if (!bundle) notFound();
  return bundle;
}
export async function generateMetadata({ params }: Props) {
  const bundle = await bundleBySlug((await params).slug);
  return resolvedPublicPageMetadata(`/bundles/${seoSegment(bundle.slug)}`, bundle.title, bundleSeoDescription(bundle));
}
export default async function BundlePage({ params }: Props) {
  const bundle = await bundleBySlug((await params).slug);
  const offer = { slug: bundle.slug, title: bundle.title, description: bundle.description, discountType: bundle.discountType, discountValue: bundle.discountValue, courses: bundle.courses, savings: bundle.discount, bundlePrice: bundle.total, regularPrice: bundle.subtotal };
  return <PublicInformationPage path={`/bundles/${seoSegment(bundle.slug)}`} title={bundle.title} intro={bundle.description || "باقة تضم المواد الموضحة أدناه بسعر إجمالي مخفض."}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", ...itemListData(bundle.title, bundle.courses.map((course) => ({ name: course.title, path: `/courses/${seoSegment(course.slug)}` }))) }) }} />
    <section><h2>المواد المشمولة في الباقة</h2><div className={styles.grid}>{bundle.courses.map((course) => <article className={styles.card} key={course.slug}><h3><Link href={`/courses/${seoSegment(course.slug)}`}>{course.title}</Link></h3><p>{course.university} · {course.specialty}</p><p>السعر المنفرد: {course.price.toLocaleString("ar-SA")} ر.س</p><Link href={`/courses/${seoSegment(course.slug)}`}>خطة الدروس ومدة الوصول والمعاينة</Link></article>)}</div></section>
    <CourseBundleOffers bundles={[offer]} currentSlug={bundle.courseSlugs[0]} heading="السعر وإضافة الباقة" />
    <section className={styles.section}><h2>تفاصيل العرض</h2><p>تُضاف جميع مواد الباقة إلى السلة ويظهر الخصم في إجمالي الطلب. راجع صلاحية كل مادة في صفحتها قبل الدفع.</p>{bundle.expiresAt && <p>العرض متاح حتى <time dateTime={bundle.expiresAt}>{new Date(bundle.expiresAt).toLocaleString("ar-SA", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Riyadh" })}</time> بتوقيت السعودية، ما دامت المواد متاحة للاشتراك.</p>}<p><Link href="/bundles">جميع الباقات</Link> · <Link href="/refund-policy">سياسة الاسترداد</Link></p></section>
  </PublicInformationPage>;
}
