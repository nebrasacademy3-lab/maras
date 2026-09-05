import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, GraduationCap } from "lucide-react";
import { CourseCard } from "@/components/course-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCoursesCatalog, getInstitutionCatalog } from "@/lib/catalog-store";

type Props = { params: Promise<{ slug: string; specialtySlug: string }> };
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const dynamic = "force-dynamic";

async function pageData(params: Props["params"]) {
  const { slug, specialtySlug } = await params;
  const [institution, courses] = await Promise.all([getInstitutionCatalog(slug), getCoursesCatalog()]);
  if (!institution) return null;
  const rows = courses.filter((course) => course.universitySlug === slug && (course.audienceScope === "institution" || course.specialtySlug === specialtySlug));
  const specialtyName = rows[0]?.specialty || specialtySlug;
  return { institution, rows, specialtySlug, specialtyName };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await pageData(params);
  if (!data) return {};
  const title = `${data.specialtyName} في ${data.institution.name}`;
  const description = `مواد وشروحات تخصص ${data.specialtyName} لطلاب ${data.institution.name} على منصة مراس العلم.`;
  const canonical = `/universities/${data.institution.slug}/specialties/${data.specialtySlug}`;
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, images: ["/og.png"] }, twitter: { card: "summary_large_image", title, description, images: ["/og.png"] } };
}

export default async function SpecialtyPage({ params }: Props) {
  const data = await pageData(params);
  if (!data) notFound();
  const pageUrl = `${siteUrl}/universities/${data.institution.slug}/specialties/${data.specialtySlug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: `مواد ${data.specialtyName} في ${data.institution.name}`,
        itemListElement: data.rows.map((course, index) => ({ "@type": "ListItem", position: index + 1, url: `${siteUrl}/courses/${course.slug}`, name: course.title })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "الجامعات", item: `${siteUrl}/universities` },
          { "@type": "ListItem", position: 3, name: data.institution.name, item: `${siteUrl}/universities/${data.institution.slug}` },
          { "@type": "ListItem", position: 4, name: data.specialtyName, item: pageUrl },
        ],
      },
    ],
  };

  return <main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <SiteHeader />
    <section className="content-page"><div className="container">
      <div className="breadcrumbs"><Link href="/">الرئيسية</Link><ChevronLeft size={13} /><Link href="/universities">الجامعات</Link><ChevronLeft size={13} /><Link href={`/universities/${data.institution.slug}`}>{data.institution.name}</Link><ChevronLeft size={13} /><span>{data.specialtyName}</span></div>
      <div className="section-head"><div><span className="section-kicker"><GraduationCap size={14} /> دليل التخصص</span><h1>{data.specialtyName}</h1><p>مواد منشورة لطلاب {data.institution.name}، مع عرض الدرس التجريبي قبل الاشتراك.</p></div></div>
      {data.rows.length ? <div className="courses-grid">{data.rows.map((course) => <CourseCard key={course.slug} course={course} />)}</div> : <div className="empty-state"><h2>لا توجد مواد منشورة حاليًا</h2><p>يمكنك طلب المادة التي تحتاجها وسيصل تحديث إلى حسابك عند توفرها.</p><Link className="button button-primary" href={`/request-course?university=${encodeURIComponent(data.institution.name)}`}>طلب مادة</Link></div>}
    </div></section>
    <SiteFooter />
  </main>;
}
