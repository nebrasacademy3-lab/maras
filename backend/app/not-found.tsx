import Link from "next/link";
import { ArrowLeft, Compass, SearchX } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function NotFound() { return <main><SiteHeader /><section className="empty-page"><div><span><SearchX size={38} /></span><small dir="ltr">404</small><h1>الصفحة غير موجودة</h1><p>قد يكون الرابط تغيّر أو أن المحتوى لم يعد متاحًا. ابدأ من المواد أو الجامعات.</p><div><Link href="/courses" className="button button-primary">استكشف المواد <Compass size={17} /></Link><Link href="/" className="button button-soft">العودة للرئيسية <ArrowLeft size={17} /></Link></div></div></section><SiteFooter /></main>; }
