import { notificationRecipientWhere } from "@/lib/notification-visibility";
import { effectiveAccessRows } from "@/lib/course-access";
import { dashboardCourseLearning, dashboardRecommendationMatch } from "@/lib/dashboard-learning";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { SiteHeader } from "@/components/site-header";
import { StudentDashboard, type DashboardCourse, type DashboardNotice, type DashboardOrder, type DashboardRequest, type DashboardRecommendation } from "@/components/student-dashboard";
import { getDb } from "@/db";
import { courseAccess, courseRequests, lessonProgress, notificationReads, notificationsDb, orders, refundRequests, supportReplies, supportTickets } from "@/db/schema";
import { getCoursesCatalog, getInstitutionsCatalog, getRecommendedCourses } from "@/lib/catalog-store";
import { requireUser } from "@/lib/server-auth";

export const metadata: Metadata = { title:"لوحة الطالب",robots:{index:false,follow:false} };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }:{ searchParams:Promise<{view?:string;payment?:string;order?:string;error?:string}> }) {
  const user = await requireUser("/dashboard");
  if (user.role === "admin" || user.role === "supervisor") redirect("/admin");
  if (!user.onboardingCompleted) redirect("/onboarding");
  const db = getDb();
  const now = new Date().toISOString();
  const visibleNotifications=and(notificationRecipientWhere(user),or(eq(notificationsDb.presentation,"inbox"),eq(notificationsDb.presentation,"all")),or(isNull(notificationsDb.startsAt),lte(notificationsDb.startsAt,now)),or(isNull(notificationsDb.expiresAt),gt(notificationsDb.expiresAt,now)));
  const [accessRows, progressRows, orderRows, requestRows, noticeRows, ticketRows, catalogCourses, institutions, recommendedRows] = await Promise.all([
    db.select().from(courseAccess).where(eq(courseAccess.userId, user.id)).then(rows => effectiveAccessRows(rows)),
    db.select().from(lessonProgress).where(eq(lessonProgress.userId, user.id)),
    db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt)).limit(50),
    db.select().from(courseRequests).where(eq(courseRequests.userId,user.id)).orderBy(desc(courseRequests.createdAt)).limit(50),
    db.select({notification:notificationsDb,readAt:notificationReads.readAt}).from(notificationsDb).leftJoin(notificationReads,and(eq(notificationReads.notificationId,notificationsDb.id),eq(notificationReads.userId,user.id))).where(visibleNotifications).orderBy(desc(notificationsDb.createdAt)).limit(50),
    db.select().from(supportTickets).where(eq(supportTickets.userId, user.id)).orderBy(desc(supportTickets.createdAt)).limit(50),
    getCoursesCatalog(),
    getInstitutionsCatalog(),
    getRecommendedCourses(user.universitySlug||"",user.specialty||""),
  ]);
  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const replyRows = ticketIds.length ? await db.select().from(supportReplies).where(and(eq(supportReplies.internal, false), inArray(supportReplies.ticketId, ticketIds))).orderBy(desc(supportReplies.createdAt)).limit(300) : [];
  const courseMap=new Map(catalogCourses.map((course)=>[course.slug,course]));
  const allCourses:DashboardCourse[] = accessRows.filter((access) => !access.revokedAt).flatMap((access) => {
    const course=courseMap.get(access.courseSlug); if(!course)return [];
    return [{slug:course.slug,title:course.title,university:course.university,color:course.color,icon:course.icon,...dashboardCourseLearning(course,progressRows,access,now)}];
  });
  const owned = allCourses.filter((course) => course.accessState === "active");
  const expired = allCourses.filter((course) => course.accessState !== "active");
  const refundRows=orderRows.length?await db.select({orderNumber:refundRequests.orderNumber,status:refundRequests.status,createdAt:refundRequests.createdAt}).from(refundRequests).where(inArray(refundRequests.orderNumber,orderRows.map((row)=>row.orderNumber))).orderBy(desc(refundRequests.createdAt)):[];
  const refundByOrder=new Map<string,string>();for(const row of refundRows)if(!refundByOrder.has(row.orderNumber))refundByOrder.set(row.orderNumber,row.status);
  const dashboardOrders:DashboardOrder[]=orderRows.map((row)=>({orderNumber:row.orderNumber,courseTitle:courseMap.get(row.courseSlug)?.title||row.courseSlug,total:row.total,currency:row.currency,status:row.status,createdAt:row.createdAt,refundStatus:refundByOrder.get(row.orderNumber)||null}));
  const dashboardRequests:DashboardRequest[]=requestRows.map((row)=>({id:row.id,courseName:row.courseName,status:row.status,attachmentsCount:row.attachmentsCount,createdAt:row.createdAt,preparedCourseSlug:row.preparedCourseSlug||null,preparedCourseTitle:row.preparedCourseSlug?courseMap.get(row.preparedCourseSlug)?.title||null:null,notes:row.notes||""}));
  const notices:DashboardNotice[]=noticeRows.map(({notification:row,readAt})=>({id:row.id,title:row.title,body:row.body,actionUrl:row.actionUrl,actionLabel:row.actionLabel,presentation:row.presentation,template:row.template,createdAt:row.createdAt,read:Boolean(readAt)}));
  const recommended:DashboardRecommendation[]=recommendedRows.map((course)=>({slug:course.slug,title:course.title,university:course.university,specialty:course.audienceScope==="institution"?"جميع تخصصات الجامعة":course.specialty,price:course.price,color:course.color,icon:course.icon,match:dashboardRecommendationMatch(course,user.universitySlug)}));
  const tickets=ticketRows.map((ticket)=>({...ticket,replies:replyRows.filter((reply)=>reply.ticketId===ticket.id).map((reply)=>({id:reply.id,body:reply.body,createdAt:reply.createdAt}))}));
  const params=await searchParams;
  const returnOrder=params.payment==="return"&&typeof params.order==="string"&&/^[A-Za-z0-9._:-]{3,100}$/.test(params.order)?params.order:"";
  const view=returnOrder?"orders":params.view||"overview";
  const notice=params.error==="forbidden"?"لا تملك صلاحية الوصول إلى الصفحة المطلوبة، فأعدناك إلى لوحتك.":"";
  return <main><SiteHeader appMode userName={user.fullName}/><StudentDashboard initialView={view} returnOrder={returnOrder} notice={notice} user={{id:user.id,fullName:user.fullName,email:user.email,emailVerified:user.emailVerified,phone:user.phone||"",universitySlug:user.universitySlug||"",specialty:user.specialty||"",academicLevel:user.academicLevel||""}} owned={owned} expired={expired} orders={dashboardOrders} requests={dashboardRequests} notices={notices} tickets={tickets} institutions={institutions} recommended={recommended}/></main>;
}
