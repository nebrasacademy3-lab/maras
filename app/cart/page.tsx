import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartClient } from "@/components/cart-client";
import { requireUser } from "@/lib/server-auth";

export const metadata: Metadata = { title: "السلة", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const user = await requireUser("/cart");
  return <main><SiteHeader appMode userName={user.fullName} /><section className="page-hero"><div className="container"><div className="breadcrumbs"><Link href="/dashboard">لوحتي</Link><ArrowLeft size={13} /><span>السلة</span></div><span className="eyebrow"><ShoppingBag size={15} /> شراء منظم</span><h1>سلتك التعليمية</h1><p>اجمع المواد التي تحتاجها، طبّق كود الخصم، ثم ادفع دفعة واحدة عبر Tap.</p></div></section><section className="content-page"><div className="container"><CartClient /></div></section><SiteFooter /></main>;
}
