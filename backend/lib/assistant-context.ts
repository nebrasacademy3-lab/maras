import type { SessionUser } from "@/lib/auth";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseRequests, lessonProgress, notificationsDb, orders, supervisorAssignments, supportReplies, supportTickets, users } from "@/db/schema";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import type { PublicSettings } from "@/lib/platform-settings";
import { whatsappHref } from "@/lib/platform-settings";

export async function buildAssistantContext(user: SessionUser | null, settings: PublicSettings) {
  const [institutions, courses] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog()]);
  const role = user?.role || "زائر";
  const institution = institutions.find((item) => item.slug === user?.universitySlug);
  const social = [
    settings.whatsapp_number ? `واتساب=${whatsappHref(settings)}` : "",
    settings.social_x ? `X=${settings.social_x}` : "",
    settings.social_instagram ? `Instagram=${settings.social_instagram}` : "",
    settings.social_tiktok ? `TikTok=${settings.social_tiktok}` : "",
    settings.social_youtube ? `YouTube=${settings.social_youtube}` : "",
    settings.social_telegram ? `Telegram=${settings.social_telegram}` : "",
    settings.social_linkedin ? `LinkedIn=${settings.social_linkedin}` : "",
  ].filter(Boolean).join("، ") || "لا توجد روابط اجتماعية منشورة حاليًا";
  const courseRows = courses.map((course) => `${course.title}|${course.university}|${course.specialty}|${course.price} ر.س|/${`courses/${course.slug}`}`).join("\n");
  let privateContext = "";
  if (user) {
    const db = getDb();
    const [orderRows, accessRows, requestRows, ticketRows, replyRows, noticeRows, progressRows] = await Promise.all([
      db.select().from(orders).where(eq(orders.customerEmail, user.email)).orderBy(desc(orders.createdAt)).limit(12),
      db.select().from(courseAccess).where(and(eq(courseAccess.userEmail, user.email), isNull(courseAccess.revokedAt))).limit(50),
      db.select().from(courseRequests).where(eq(courseRequests.userId, user.id)).orderBy(desc(courseRequests.createdAt)).limit(12),
      db.select().from(supportTickets).where(eq(supportTickets.userEmail, user.email)).orderBy(desc(supportTickets.createdAt)).limit(12),
      db.select().from(supportReplies).where(eq(supportReplies.internal, false)).orderBy(desc(supportReplies.createdAt)).limit(100),
      db.select().from(notificationsDb).where(or(eq(notificationsDb.userEmail, user.email), and(isNull(notificationsDb.userEmail), eq(notificationsDb.audience, user.role)))).orderBy(desc(notificationsDb.createdAt)).limit(12),
      db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, user.email)).orderBy(desc(lessonProgress.updatedAt)).limit(100),
    ]);
    const title = (slug: string) => courses.find((course) => course.slug === slug)?.title || slug;
    const tickets = ticketRows.map((ticket) => {
      const replies = replyRows.filter((reply) => reply.ticketId === ticket.id);
      return `${ticket.ticketNumber}:${ticket.title}:${ticket.status}${replies[0] ? `:آخر رد=${replies[0].body.slice(0, 220)}` : ""}`;
    });
    privateContext = `\nبيانات حساب المستخدم الحالي فقط (لا تعرض بريدًا أو رقمًا إلا إذا طلب المستخدم تأكيد بيانات حسابه):
المواد المفعلة=${accessRows.map((row) => `${title(row.courseSlug)}${row.expiresAt ? ` حتى ${row.expiresAt}` : ""}`).join("، ") || "لا توجد"}.
التقدم=${progressRows.length ? progressRows.map((row) => `${title(row.courseSlug)}:${row.completed ? "مكتمل" : `${row.watchedSeconds} ثانية`}`).slice(0, 20).join("، ") : "لا يوجد"}.
الطلبات المالية=${orderRows.map((row) => `${row.orderNumber}:${title(row.courseSlug)}:${row.status}:${row.total} ${row.currency}`).join("، ") || "لا توجد"}.
طلبات المواد=${requestRows.map((row) => `#${row.id}:${row.courseName}:${row.status}`).join("، ") || "لا توجد"}.
تذاكر الدعم=${tickets.join("، ") || "لا توجد"}.
الإشعارات=${noticeRows.map((row) => `${row.title}:${row.body.slice(0, 180)}`).join("، ") || "لا توجد"}.`;
    if (user.role === "supervisor") {
      const assignments = await db.select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId, user.id), eq(supervisorAssignments.active, true)));
      privateContext += `\nنطاقات المشرف=${assignments.map((row) => `${row.institutionSlug || "كل الجهات"}/${row.specialty || "كل التخصصات"}`).join("، ") || "لا يوجد نطاق مفعّل"}.`;
    }
    if (user.role === "admin") {
      const [allUsers, allOrders, allRequests, allTickets] = await Promise.all([
        db.select({ id: users.id }).from(users), db.select({ status: orders.status, total: orders.total }).from(orders),
        db.select({ status: courseRequests.status }).from(courseRequests), db.select({ status: supportTickets.status }).from(supportTickets),
      ]);
      privateContext += `\nملخص الإدارة الحالي: المستخدمون=${allUsers.length}، الطلبات=${allOrders.length}، المدفوع=${allOrders.filter((row) => row.status === "paid").length}، طلبات المواد المفتوحة=${allRequests.filter((row) => !["available","declined"].includes(row.status)).length}، تذاكر الدعم المفتوحة=${allTickets.filter((row) => !["resolved","closed"].includes(row.status)).length}.`;
    }
  }
  return `هوية المستخدم: الدور=${role}${user ? `، الاسم=${user.fullName}، الجامعة=${institution?.name || user.universitySlug || "غير محددة"}، التخصص=${user.specialty || "غير محدد"}، الملف=${user.profileCompleted ? "مكتمل" : "غير مكتمل"}` : "، غير مسجل الدخول"}.
المسارات: التسجيل=/register، الدخول=/login، استعادة كلمة المرور=/forgot-password، لوحة الطالب=/dashboard، موادي=/dashboard?view=courses، الحساب=/dashboard?view=account، الطلبات=/dashboard?view=orders، الإشعارات=/dashboard?view=notifications، الجامعات=/universities، المواد=/courses، طلب مادة=/request-course، الدعم=/support، التواصل=/contact، السياسات=/terms و/privacy و/refund-policy و/content-policy.
التسجيل: الاسم والبريد والجوال السعودي وكلمة مرور قوية ثم الجامعة وتخصص مرتبط بها، وبعدها جولة البداية. الحساب المكتمل مطلوب للشراء وطلب المادة.
طلب المادة: من /request-course، مع الاسم/الرمز والملاحظات وحتى 5 ملفات PDF أو PPT/PPTX أو DOC/DOCX أو PNG/JPG، 15MB لكل ملف. يصل الطلب للمشرف بحسب الجامعة والتخصص وتظهر حالته للطالب.
الدفع: Tap من الخادم؛ لا تُمنح الصلاحية إلا بعد تأكيد CAPTURED من الخادم. لا تطلب بيانات البطاقة في الدعم.
الفيديو: مشغل خاص، روابط مؤقتة مرتبطة بالحساب، صلاحية وصول يعاد التحقق منها، Range، علامة مائية، لا زر تنزيل. لا يمكن ضمان منع تسجيل الشاشة 100%.
الدعم: البريد=${settings.support_email}، الساعات=${settings.support_hours}. الروابط=${social}.
دور الطالب: يرى مواد جامعته وتخصصه كتوصيات، ويستطيع تصفح وشراء مواد الجهات والتخصصات الأخرى من الفهرس.
دور المشرف: /supervisor لإدارة الطلبات المسندة ونطاق الجامعة/التخصص ورفع الفيديو. دور الإدارة: /admin لإدارة الكتالوج والطلاب والطلبات والدعم والتقييمات والتواصل والإعدادات.
الجامعات والكليات المنشورة (${institutions.length}): ${institutions.map((item) => item.name).join("، ")}.
المواد المنشورة (${courses.length}):
${courseRows || "لا توجد مواد منشورة حاليًا؛ وجّه الطالب إلى طلب مادة."}${privateContext}`;
}
