import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FavoritesClient } from "@/components/favorites-client";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { requireUser } from "@/lib/server-auth";

export const metadata: Metadata = { title: "المفضلة", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await requireUser("/favorites");
  const courses = await getCoursesCatalog();
  return <main><SiteHeader appMode userName={user.fullName} /><section className="page-hero"><div className="container"><div className="breadcrumbs"><Link href="/dashboard">لوحتي</Link><ArrowLeft size={13} /><span>المفضلة</span></div><span className="eyebrow"><Heart size={15} /> محفوظاتك التعليمية</span><h1>مواد تستحق الرجوع إليها</h1><p>احفظ المواد التي تهمك لتعود إليها لاحقًا من الويب أو التطبيق.</p></div></section><section className="content-page"><div className="container"><FavoritesClient courses={courses} /></div></section><SiteFooter /></main>;
}
