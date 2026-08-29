import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { LearningRoom } from "@/components/learning-room";
import { getDb } from "@/db";
import { courseAccess } from "@/db/schema";
import { getCourseCatalog } from "@/lib/catalog-store";
import { requireUser } from "@/lib/server-auth";
export const metadata: Metadata={title:"مشغل الدروس",robots:{index:false,follow:false}};
export const dynamic = "force-dynamic";
export default async function LearnPage({params}:{params:Promise<{slug:string}>}){
  const slug=(await params).slug;const course=await getCourseCatalog(slug);if(!course)notFound();
  const user=await requireUser(`/learn/${slug}`);const now=new Date().toISOString();
  const [access]=await getDb().select({id:courseAccess.id}).from(courseAccess).where(and(eq(courseAccess.userEmail,user.email),eq(courseAccess.courseSlug,slug),isNull(courseAccess.revokedAt),or(isNull(courseAccess.expiresAt),gt(courseAccess.expiresAt,now)))).limit(1);
  if(!access)redirect(`/courses/${slug}?access=required`);
  return <LearningRoom course={course} studentLabel={`${user.fullName} · M-${String(user.id).padStart(5,"0")}`}/>;
}
