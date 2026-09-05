import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CourseCatalog } from "@/components/course-catalog";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { catalogHasFilters, publicPageMetadata, type SeoSearchParams } from "@/lib/seo";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SeoSearchParams> }): Promise<Metadata> {
  return publicPageMetadata("/courses", "شروحات المواد الجامعية", "تصفح المواد الجامعية في مراس العلم حسب الجامعة والتخصص، واستعرض خطة الدروس والأسعار والمعاينات المجانية المتاحة قبل الاشتراك.", { noindex: catalogHasFilters(await searchParams) });
}

export const revalidate = 60;

export default async function CoursesPage() {
  const [courses, institutions] = await Promise.all([getCoursesCatalog(), getInstitutionsCatalog()]);
  return <main><SiteHeader /><section className="page-hero"><div className="container"><div className="breadcrumbs"><Link href="/">الرئيسية</Link><ChevronLeft size={13} /><span>المواد</span></div><h1>اختر مادتك وابدأ بالفهم</h1><p>شروحات مرتبطة بالجامعة والتخصص، ومقسمة إلى وحدات ودروس واضحة مع تجربة مجانية قبل الدفع.</p></div></section><section className="content-page"><div className="container"><CourseCatalog courses={courses} institutions={institutions} /></div></section><SiteFooter /></main>;
}
