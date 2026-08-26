import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CourseCatalog } from "@/components/course-catalog";
import { getCoursesCatalog } from "@/lib/catalog-store";

export const metadata: Metadata = { title: "المواد الجامعية", description: "ابحث في شروحات المواد الجامعية المتوفرة على منصة مراس العلم وشاهد درسًا مجانيًا قبل الاشتراك." };

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const courses = await getCoursesCatalog();
  return <main><SiteHeader /><section className="page-hero"><div className="container"><div className="breadcrumbs"><Link href="/">الرئيسية</Link><ChevronLeft size={13} /><span>المواد</span></div><h1>اختر مادتك وابدأ بالفهم</h1><p>شروحات مرتبطة بالجامعة والتخصص، ومقسمة إلى وحدات ودروس واضحة مع تجربة مجانية قبل الدفع.</p></div></section><section className="content-page"><div className="container"><CourseCatalog courses={courses} /></div></section><SiteFooter /></main>;
}
