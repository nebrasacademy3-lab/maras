import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, GraduationCap } from "lucide-react";
import { CourseCard } from "@/components/course-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCoursesCatalog, getInstitutionCatalog } from "@/lib/catalog-store";
import { coursesForSpecialty, getPublicSpecialtyCatalog } from "@/lib/seo-catalog";
import { breadcrumbData, itemListData, jsonLd, publicPageMetadata, seoSegment } from "@/lib/seo";

type Props = { params: Promise<{ slug: string; specialtySlug: string }> };
export const dynamic = "force-dynamic";

const pageData = cache(async (slug: string, specialtySlug: string) => {
  const [institution, courses, specialties] = await Promise.all([getInstitutionCatalog(slug), getCoursesCatalog(), getPublicSpecialtyCatalog()]);
  const specialty = specialties.find((item) => item.institutionSlug === slug && item.slug === specialtySlug);
  if (!institution || !specialty) return null;
  return { institution, specialty, rows: coursesForSpecialty(courses, specialty), path: `/universities/${seoSegment(slug)}/specialties/${seoSegment(specialtySlug)}` };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, specialtySlug } = await params;
  const data = await pageData(slug, specialtySlug);
  if (!data) notFound();
  return publicPageMetadata(data.path, `${data.specialty.name} في ${data.institution.name}`, `مواد وشروحات تخصص ${data.specialty.name} لطلاب ${data.institution.name} على منصة مراس العلم. ${data.specialty.description}`, { noindex: !data.rows.length });
}

export default async function SpecialtyPage({ params }: Props) {
  const { slug, specialtySlug } = await params;
  const data = await pageData(slug, specialtySlug);
  if (!data) notFound();
  const universityPath = `/universities/${seoSegment(data.institution.slug)}`;
  const structuredData = { "@context": "https://schema.org", "@graph": [
    itemListData(`مواد ${data.specialty.name} في ${data.institution.name}`, data.rows.map((course) => ({ name: course.title, path: `/courses/${seoSegment(course.slug)}` }))),
    breadcrumbData([{ name: "الرئيسية", path: "/" }, { name: "الجامعات", path: "/universities" }, { name: data.institution.name, path: universityPath }, { name: data.specialty.name, path: data.path }]),
  ] };
  return <main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
    <SiteHeader />
    <section className="content-page"><div className="container">
      <div className="breadcrumbs"><Link href="/">الرئيسية</Link><ChevronLeft size={13} /><Link href="/universities">الجامعات</Link><ChevronLeft size={13} /><Link href={universityPath}>{data.institution.name}</Link><ChevronLeft size={13} /><span>{data.specialty.name}</span></div>
      <div className="section-head"><div><span className="section-kicker"><GraduationCap size={14} /> دليل التخصص</span><h1>{data.specialty.name}</h1><p>{data.specialty.description || `مواد منشورة لطلاب ${data.institution.name}، مع معاينات مجانية عند توفرها قبل الاشتراك.`}</p></div></div>
      {data.rows.length ? <div className="courses-grid">{data.rows.map((course) => <CourseCard key={course.slug} course={course} />)}</div> : <div className="empty-state"><h2>لا توجد مواد منشورة حاليًا</h2><p>يمكنك طلب المادة التي تحتاجها وسيصل تحديث إلى حسابك عند توفرها.</p><Link className="button button-primary" href={`/request-course?university=${encodeURIComponent(data.institution.name)}`}>طلب مادة</Link></div>}
    </div></section>
    <SiteFooter />
  </main>;
}
