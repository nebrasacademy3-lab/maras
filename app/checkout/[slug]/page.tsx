import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { CheckoutClient } from "@/components/checkout-client";
import { getCourseCatalog } from "@/lib/catalog-store";
import { requirePurchaser } from "@/lib/server-auth";
import { getDb } from "@/db";
import { courseAccess } from "@/db/schema";
import { activeCourseAccessWhere } from "@/lib/course-access";
export const metadata:Metadata={title:"إتمام الاشتراك",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function CheckoutPage({params}:{params:Promise<{slug:string}>}){const course=await getCourseCatalog((await params).slug);if(!course)notFound();if(!course.availableForPurchase)redirect(`/courses/${course.slug}?status=preparing`);const user=await requirePurchaser(`/checkout/${course.slug}`);const [ownedAccess]=await getDb().select({id:courseAccess.id}).from(courseAccess).where(activeCourseAccessWhere(user.email,course.slug)).limit(1);if(ownedAccess)redirect(`/learn/${course.slug}`);const paymentMethods = ["tap", ...(process.env.TAP_TABBY_ENABLED === "true" ? ["tabby"] : []), ...(process.env.TAP_TAMARA_ENABLED === "true" ? ["tamara"] : [])] as Array<"tap"|"tabby"|"tamara">;return <main><SiteHeader appMode userName={user.fullName}/><div className="checkout-page"><div className="container"><div className="breadcrumbs"><Link href="/dashboard">لوحتي</Link><ChevronLeft size={13}/><Link href={`/courses/${course.slug}`}>{course.title}</Link><ChevronLeft size={13}/><span>الدفع</span></div><CheckoutClient course={course} user={{fullName:user.fullName,email:user.email,phone:user.phone||""}} paymentMethods={paymentMethods}/></div></div></main>}
