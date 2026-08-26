import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { UniversityCatalog } from "@/components/university-catalog";
import { getInstitutionsCatalog } from "@/lib/catalog-store";

export const metadata: Metadata = {
  title: "الجامعات والكليات السعودية",
  description: "تصفّح الجامعات والكليات السعودية وابحث عن الشروحات المتوفرة حسب الجهة والتخصص.",
};

export const dynamic = "force-dynamic";

export default async function UniversitiesPage() {
  const institutions = await getInstitutionsCatalog();
  return <main><SiteHeader /><section className="page-hero"><div className="container"><div className="breadcrumbs"><Link href="/">الرئيسية</Link><ChevronLeft size={13} /><span>الجامعات والكليات</span></div><h1>جامعات وكليات المملكة</h1><p>قائمة مرتبة للجهات الجامعية والأهلية والتقنية، مع إمكانية البحث والتصفية والوصول إلى المواد المتوفرة لكل جهة.</p></div></section><section className="content-page"><div className="container"><UniversityCatalog institutions={institutions} /></div></section><SiteFooter /></main>;
}
