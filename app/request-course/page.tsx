import type {Metadata} from "next";
import Link from "next/link";
import {ChevronLeft,Sparkles,TrendingUp} from "lucide-react";
import {SiteHeader} from "@/components/site-header";
import {SiteFooter} from "@/components/site-footer";
import {RequestCourseForm} from "@/components/request-course-form";
import {getInstitutionCatalog} from "@/lib/catalog-store";
import {requireUser} from "@/lib/server-auth";

export const metadata:Metadata={title:"اطلب توفير مادة",description:"اطلب من مراس العلم توفير شرح مادة جامعية وارفع السلايدات أو توصيف المقرر.",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";

export default async function RequestCoursePage(){
  const user=await requireUser("/request-course");
  const institution=await getInstitutionCatalog(user.universitySlug||"");
  return <main><SiteHeader appMode userName={user.fullName}/><section className="page-hero request-page-hero"><div className="container"><div className="breadcrumbs"><Link href="/dashboard">لوحتي</Link><ChevronLeft size={13}/><span>طلب مادة</span></div><span className="section-kicker"><Sparkles size={14}/> يصل للمشرف المختص</span><h1>وش المادة اللي تحتاج شرحها؟</h1><p>أرسل الاسم وارفع السلايدات أو توصيف المقرر، ثم تابع الحالة والإشعارات من لوحة الطالب.</p></div></section><section className="content-page request-form-section"><div className="container request-page-grid"><div className="request-form-card"><RequestCourseForm universityName={institution?.name||"جامعتك"} specialty={user.specialty||"تخصصك"} studentName={user.fullName}/></div><aside className="request-insights"><TrendingUp size={28}/><h2>مسار واضح للطلب</h2><p>تُحفظ المرفقات في مساحة خاصة، ويُسند الطلب للمشرف، ثم تتغير حالته حتى يصبح المحتوى متاحًا.</p><div><span><strong>1</strong><small>استلام الطلب</small></span><span><strong>2</strong><small>مراجعة المشرف</small></span><span><strong>3</strong><small>إنتاج المحتوى</small></span><span><strong>4</strong><small>متاح للطلاب</small></span></div></aside></div></section><SiteFooter/></main>;
}
