import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { SiteHeader } from "@/components/site-header";
import { StudentDashboard, type DashboardCourse, type DashboardNotice, type DashboardOrder, type DashboardRequest, type DashboardRecommendation } from "@/components/student-dashboard";
import { getDb } from "@/db";
import { courseAccess, courseRequests, lessonProgress, notificationReads, notificationsDb, orders, supportReplies, supportTickets } from "@/db/schema";
import { getCoursesCatalog, getInstitutionsCatalog, getRecommendedCourses } from "@/lib/catalog-store";
import { requireUser } from "@/lib/server-auth";

export const metadata: Metadata = { title:"لوحة الطالب",robots:{index:false,follow:false} };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }:{ searchParams:Promise<{view?:string}> }) {
  const user = await requireUser("/dashboard");
  if (!user.onboardingCompleted) redirect("/onboarding");
  const db = getDb();
  const now = new Date().toISOString();
  const visibleNotifications=and(or(eq(notificationsDb.userEmail,user.email),and(isNull(notificationsDb.userEmail),or(eq(notificationsDb.audience,user.role),eq(notificationsDb.audience,"public")))),or(eq(notificationsDb.presentation,"inbox"),eq(notificationsDb.presentation,"all")),or(isNull(notificationsDb.startsAt),lte(notificationsDb.startsAt,now)),or(isNull(notificationsDb.expiresAt),gt(notificationsDb.expiresAt,now)));
  const [accessRows, progressRows, orderRows, requestRows, noticeRows, ticketRows, replyRows, catalogCourses, institutions, recommendedRows] = await Promise.all([
    db.select().from(courseAccess).where(eq(courseAccess.userEmail, user.email)),
    db.select().from(lessonProgress).where(eq(lessonProgress.userEmail,user.email)),
    db.select().from(orders).where(eq(orders.customerEmail,user.email)).orderBy(desc(orders.createdAt)).limit(50),
    db.select().from(courseRequests).where(eq(courseRequests.userId,user.id)).orderBy(desc(courseRequests.createdAt)).limit(50),
    db.select({notification:notificationsDb,readAt:notificationReads.readAt}).from(notificationsDb).leftJoin(notificationReads,and(eq(notificationReads.notificationId,notificationsDb.id),eq(notificationReads.userId,user.id))).where(visibleNotifications).orderBy(desc(notificationsDb.createdAt)).limit(50),
    db.select().from(supportTickets).where(eq(supportTickets.userEmail,user.email)).orderBy(desc(supportTickets.createdAt)).limit(50),
    db.select().from(supportReplies).where(eq(supportReplies.internal,false)).orderBy(desc(supportReplies.createdAt)).limit(300),
    getCoursesCatalog(),
    getInstitutionsCatalog(),
    getRecommendedCourses(user.universitySlug||"",user.specialty||""),
  ]);
  const courseMap=new Map(catalogCourses.map((course)=>[course.slug,course]));
  const allCourses:DashboardCourse[] = accessRows.filter((access) => !access.revokedAt).flatMap((access) => {
    const course=courseMap.get(access.courseSlug); if(!course)return [];
    const lessons=course.units.flatMap((unit)=>unit.lessons).filter((lesson)=>lesson.ready); const lessonIds=new Set(lessons.map((lesson)=>lesson.id)); const progress=progressRows.filter((row)=>row.courseSlug===course.slug&&lessonIds.has(row.lessonId)); const completed=progress.filter((row)=>row.completed).length;
    const percent=lessons.length?Math.round(completed/lessons.length*100):0; const currentProgress=[...progress].sort((a,b)=>b.watchedSeconds-a.watchedSeconds)[0]; const current=lessons.find((lesson)=>lesson.id===currentProgress?.lessonId)?.title||lessons[0]?.title||"ستظهر الدروس المتاحة هنا";
    const accessState = access.suspendedAt ? "suspended" as const : access.expiresAt && Date.parse(access.expiresAt) <= Date.parse(now) ? "expired" as const : "active" as const;
    return [{slug:course.slug,title:course.title,university:course.university,color:course.color,icon:course.icon,progress:percent,current,remaining:access.expiresAt?`حتى ${new Date(access.expiresAt).toLocaleDateString("ar-SA")}`:course.access,accessState,expiresAt:access.expiresAt}];
  });
  const owned = allCourses.filter((course) => course.accessState === "active");
  const expired = allCourses.filter((course) => course.accessState !== "active");
  const dashboardOrders:DashboardOrder[]=orderRows.map((row)=>({orderNumber:row.orderNumber,courseTitle:courseMap.get(row.courseSlug)?.title||row.courseSlug,total:row.total,currency:row.currency,status:row.status,createdAt:row.createdAt}));
  const dashboardRequests:DashboardRequest[]=requestRows.map((row)=>({id:row.id,courseName:row.courseName,status:row.status,attachmentsCount:row.attachmentsCount,createdAt:row.createdAt}));
  const notices:DashboardNotice[]=noticeRows.map(({notification:row,readAt})=>({id:row.id,title:row.title,body:row.body,actionUrl:row.actionUrl,actionLabel:row.actionLabel,presentation:row.presentation,template:row.template,createdAt:row.createdAt,read:Boolean(readAt)}));
  const recommended:DashboardRecommendation[]=recommendedRows.map((course)=>({slug:course.slug,title:course.title,university:course.university,specialty:course.specialty,price:course.price,color:course.color,icon:course.icon,match:course.universitySlug===user.universitySlug&&course.specialty===user.specialty?"تخصصك":course.universitySlug===user.universitySlug?"جامعتك":"تخصص مشابه"}));
  const tickets=ticketRows.map((ticket)=>({...ticket,replies:replyRows.filter((reply)=>reply.ticketId===ticket.id).map((reply)=>({id:reply.id,body:reply.body,createdAt:reply.createdAt}))}));
  const view=(await searchParams).view||"overview";
  return <main><SiteHeader appMode userName={user.fullName}/><StudentDashboard initialView={view} user={{id:user.id,fullName:user.fullName,email:user.email,phone:user.phone||"",universitySlug:user.universitySlug||"",specialty:user.specialty||""}} owned={owned} expired={expired} orders={dashboardOrders} requests={dashboardRequests} notices={notices} tickets={tickets} institutions={institutions} recommended={recommended}/></main>;
}
