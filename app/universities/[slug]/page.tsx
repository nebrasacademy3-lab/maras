import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BellRing, BookOpen, CheckCircle2, ChevronLeft, ExternalLink, GraduationCap, MapPin } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { UniversityLogo } from "@/components/university-logo";
import { CourseCard } from "@/components/course-card";
import { InstitutionPrograms } from "@/components/institution-programs";
import { institutions } from "@/lib/data";
import { getCoursesCatalog, getInstitutionCatalog, getProgramsCatalog } from "@/lib/catalog-store";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export function generateStaticParams() { return institutions.map((item) => ({ slug: item.slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const institution = await getInstitutionCatalog((await params).slug);
  if (!institution) return {};
  const description = `الشروحات والمواد المتوفرة لطلاب ${institution.name} على منصة مراس العلم.`;
  const canonical = `/universities/${institution.slug}`;
  return { title: institution.name, description, alternates: { canonical }, openGraph: { title: institution.name, description, url: canonical, images: [{ url: "/og.png", width: 1728, height: 910, alt: `مواد ${institution.name} في مراس العلم` }] }, twitter: { card: "summary_large_image", title: institution.name, description, images: ["/og.png"] } };
}

export default async function UniversityPage({ params }: Props) {
  const institution = await getInstitutionCatalog((await params).slug);
  if (!institution) notFound();
  const courses = await getCoursesCatalog();
  const institutionCourses = courses.filter((course) => course.universitySlug === institution.slug);
  const catalog = await getProgramsCatalog(institution.slug);
  return <main><SiteHeader />
    <section className="university-detail-hero"><div className="container"><div className="breadcrumbs"><Link href="/">الرئيسية</Link><ChevronLeft size={13} /><Link href="/universities">الجامعات</Link><ChevronLeft size={13} /><span>{institution.name}</span></div><div className="university-identity"><UniversityLogo institution={institution} size="lg" /><div><span className={`type-pill type-${institution.type}`}>{institution.type}</span><h1>{institution.name}</h1><p>{institution.nameEn}</p><div><span><MapPin size={14} /> {institution.region}</span><span><GraduationCap size={14} /> {catalog.programs.length} برنامجًا</span><span><BookOpen size={14} /> {institutionCourses.length ? `${institutionCourses.length} مواد متاحة` : "مواد قادمة"}</span></div></div></div></div></section>
    <section className="content-page"><div className="container">
      <div className="university-tools"><div><span className="section-kicker">الدليل الأكاديمي</span><h2>التخصصات والمواد</h2><p>قائمة خاصة بهذه الجهة وليست تدويرًا عشوائيًا من فهرس عام.</p></div><a className="catalog-source" href={catalog.sourceUrl} target="_blank" rel="noreferrer"><CheckCircle2 size={16} /><span><strong>{catalog.liveVerified ? "مطابق للمصدر الرسمي الآن" : "المصدر الرسمي للجهة"}</strong><small>راجع أحدث شروط القبول والخطط</small></span><ExternalLink size={15} /></a></div>
      <InstitutionPrograms programs={catalog.programs} institutionName={institution.name} />
      <div className="section-head university-courses-head"><div><span className="section-kicker">شرح جامعتك</span><h2>المواد المتوفرة الآن</h2><p>شاهد الدرس التجريبي وتأكد أن الشرح يناسبك قبل الاشتراك.</p></div></div>
      {institutionCourses.length ? <div className="courses-grid">{institutionCourses.map((course) => <CourseCard key={course.slug} course={course} />)}</div> : <div className="university-coming-soon"><div><BellRing size={29} /></div><h3>شروحات {institution.name} قادمة قريبًا</h3><p>سجّل المادة التي تحتاجها وسنخبرك تلقائيًا عندما يبدأ تجهيزها أو تصبح متاحة.</p><Link href={`/request-course?university=${encodeURIComponent(institution.name)}`} className="button button-primary">اطلب توفير مادة <ArrowLeft size={16} /></Link></div>}
    </div></section><SiteFooter /></main>;
}
