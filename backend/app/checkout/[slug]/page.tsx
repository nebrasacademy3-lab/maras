import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CreditCard, ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { CheckoutClient } from "@/components/checkout-client";
import { getCourseCatalog } from "@/lib/catalog-store";
import { requireUser } from "@/lib/server-auth";
import { getPublicSettings, settingEnabled } from "@/lib/platform-settings";

export const metadata: Metadata = { title: "إتمام الاشتراك", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const course = await getCourseCatalog((await params).slug);
  if (!course) notFound();
  const [user, settings] = await Promise.all([requireUser(`/checkout/${course.slug}`), getPublicSettings()]);
  const paymentsEnabled = settingEnabled(settings.payments_enabled);
  return <main><SiteHeader appMode userName={user.fullName}/><div className="checkout-page"><div className="container"><div className="breadcrumbs"><Link href="/dashboard">لوحتي</Link><ChevronLeft size={13}/><Link href={`/courses/${course.slug}`}>{course.title}</Link><ChevronLeft size={13}/><span>الدفع</span></div>{paymentsEnabled ? <CheckoutClient course={course} user={{ fullName: user.fullName, email: user.email, phone: user.phone || "" }} /> : <section className="dashboard-panel dashboard-empty-state"><i><CreditCard size={31}/></i><h2>الاشتراكات الجديدة متوقفة مؤقتًا</h2><p>أوقفت إدارة المنصة بدء عمليات الدفع الجديدة حاليًا. ستبقى موادك المفعلة وحسابك وتقدمك كما هي.</p><div><Link href={`/courses/${course.slug}`} className="button button-primary">العودة للمادة <ArrowLeft size={16}/></Link><Link href="/dashboard" className="button button-soft">الذهاب إلى لوحتي</Link></div></section>}</div></div></main>;
}
