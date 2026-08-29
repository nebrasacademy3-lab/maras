import type { SessionUser } from "@/lib/auth";
import { and, count, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseRequests, lessonProgress, notificationsDb, orderItems, orders, supervisorAssignments, supportReplies, supportTickets, users } from "@/db/schema";
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
  const courseRows = courses.slice(0, 140).map((course) => `${course.title}|${course.university}|${course.specialty}|${course.price} ر.س|/${`courses/${course.slug}`}`).join("\n");
  let privateContext = "";
  if (user) {
    const db = getDb();
    const [orderRows, accessRows, requestRows, ticketRows, noticeRows, progressRows] = await Promise.all([
      db.select().from(orders).where(eq(orders.customerEmail, user.email)).orderBy(desc(orders.createdAt)).limit(12),
      db.select().from(courseAccess).where(and(eq(courseAccess.userEmail, user.email), isNull(courseAccess.revokedAt))).limit(50),
      db.select().from(courseRequests).where(eq(courseRequests.userId, user.id)).orderBy(desc(courseRequests.createdAt)).limit(12),
      db.select().from(supportTickets).where(eq(supportTickets.userEmail, user.email)).orderBy(desc(supportTickets.createdAt)).limit(12),
      db.select().from(notificationsDb).where(or(eq(notificationsDb.userEmail, user.email), and(isNull(notificationsDb.userEmail), eq(notificationsDb.audience, user.role)))).orderBy(desc(notificationsDb.createdAt)).limit(12),
      db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, user.email)).orderBy(desc(lessonProgress.updatedAt)).limit(100),
    ]);
    const replyRows = ticketRows.length
      ? await db.select().from(supportReplies).where(and(eq(supportReplies.internal, false), inArray(supportReplies.ticketId, ticketRows.map((ticket) => ticket.id)))).orderBy(desc(supportReplies.createdAt)).limit(100)
      : [];
    const orderItemRows = orderRows.length
      ? await db.select({ orderNumber: orderItems.orderNumber, courseSlug: orderItems.courseSlug }).from(orderItems).where(inArray(orderItems.orderNumber, orderRows.map((order) => order.orderNumber)))
      : [];
    const title = (slug: string) => courses.find((course) => course.slug === slug)?.title || slug;
    const orderTitles = (order: (typeof orderRows)[number]) => {
      const slugs = orderItemRows.filter((item) => item.orderNumber === order.orderNumber).map((item) => item.courseSlug);
      return (slugs.length ? slugs : [order.courseSlug]).map(title).join(" + ");
    };
    const tickets = ticketRows.map((ticket) => {
      const replies = replyRows.filter((reply) => reply.ticketId === ticket.id);
      return `${ticket.ticketNumber}:${ticket.title}:${ticket.status}${replies[0] ? `:آخر رد=${replies[0].body.slice(0, 220)}` : ""}`;
    });
    privateContext = `\nبيانات حساب المستخدم الحالي فقط (لا تعرض بريدًا أو رقمًا إلا إذا طلب المستخدم تأكيد بيانات حسابه):
المواد المفعلة=${accessRows.map((row) => `${title(row.courseSlug)}${row.expiresAt ? ` حتى ${row.expiresAt}` : ""}`).join("، ") || "لا توجد"}.
التقدم=${progressRows.length ? progressRows.map((row) => `${title(row.courseSlug)}:${row.completed ? "مكتمل" : `${row.watchedSeconds} ثانية`}`).slice(0, 20).join("، ") : "لا يوجد"}.
الطلبات المالية=${orderRows.map((row) => `${row.orderNumber}:${orderTitles(row)}:${row.status}:${row.total} ${row.currency}`).join("، ") || "لا توجد"}.
طلبات المواد=${requestRows.map((row) => `#${row.id}:${row.courseName}:${row.status}`).join("، ") || "لا توجد"}.
تذاكر الدعم=${tickets.join("، ") || "لا توجد"}.
الإشعارات=${noticeRows.map((row) => `${row.title}:${row.body.slice(0, 180)}`).join("، ") || "لا توجد"}.`;
    if (user.role === "supervisor") {
      const assignments = await db.select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId, user.id), eq(supervisorAssignments.active, true)));
      privateContext += `\nنطاقات المشرف=${assignments.map((row) => `${row.institutionSlug || "كل الجهات"}/${row.specialty || "كل التخصصات"}`).join("، ") || "لا يوجد نطاق مفعّل"}.`;
    }
    if (user.role === "admin") {
      const [[userCount], [orderCount], [paidCount], [requestCount], [ticketCount]] = await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(orders),
        db.select({ value: count() }).from(orders).where(eq(orders.status, "paid")),
        db.select({ value: count() }).from(courseRequests).where(notInArray(courseRequests.status, ["available", "declined"])),
        db.select({ value: count() }).from(supportTickets).where(notInArray(supportTickets.status, ["resolved", "closed"])),
      ]);
      privateContext += `\nملخص الإدارة الحالي: المستخدمون=${Number(userCount?.value || 0)}، الطلبات=${Number(orderCount?.value || 0)}، المدفوع=${Number(paidCount?.value || 0)}، طلبات المواد المفتوحة=${Number(requestCount?.value || 0)}، تذاكر الدعم المفتوحة=${Number(ticketCount?.value || 0)}.`;
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
  دور المشرف: /supervisor لإدارة الطلبات المسندة ونطاق الجامعة/التخصص ورفع الفيديو. دور الإدارة: /admin لإدارة الكتالوج والطلاب والطلبات والدعم والتقييمات والتواصل والإعدادات.${privateContext}
  الجامعات والكليات المنشورة (${institutions.length}): ${institutions.map((item) => item.name).join("، ")}.
  المواد المنشورة (${courses.length}):
  ${courseRows || "لا توجد مواد منشورة حاليًا؛ وجّه الطالب إلى طلب مادة."}${courses.length > 140 ? `\nيوجد ${courses.length - 140} مادة أخرى في الكتالوج؛ استخدم البحث الخادمي عند الحاجة.` : ""}`;
}
