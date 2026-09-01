"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BookOpenCheck,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  FileClock,
  GraduationCap,
  Headphones,
  Laptop,
  Mail,
  MapPin,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import styles from "@/components/student-360.module.css";

type Student = {
  id: number;
  email: string;
  phone: string | null;
  fullName: string;
  role: string;
  status: string;
  universitySlug: string | null;
  specialty: string | null;
  academicLevel: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Subscription = {
  id: number;
  courseSlug: string;
  source: string;
  orderNumber: string | null;
  startsAt: string;
  expiresAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  updatedAt: string;
};

type AccessEvent = {
  id: number;
  accessId: number | null;
  courseSlug: string;
  action: string;
  actorEmail: string;
  reason: string | null;
  orderNumber: string | null;
  createdAt: string;
};

type Progress = {
  id: number;
  courseSlug: string;
  lessonId: string;
  watchedSeconds: number;
  completed: boolean;
  updatedAt: string;
};

type OrderItem = {
  id: number;
  courseSlug: string;
  unitPrice: number;
  discount: number;
  total: number;
  accessDurationDays: number | null;
  createdAt: string;
};

type Invoice = {
  invoiceNumber: string;
  total: number;
  taxAmount: number;
  currency: string;
  issuedAt: string;
  pdfObjectKey: string | null;
};

type Order = {
  id: number;
  orderNumber: string;
  subtotal: number;
  discount: number;
  couponCode: string | null;
  total: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  tapChargeId: string | null;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
  items: OrderItem[];
  invoice: Invoice | null;
};

type CourseRequest = {
  id: number;
  university: string;
  specialty: string;
  courseName: string;
  name: string;
  phone: string;
  notes: string | null;
  courseUrl: string | null;
  notify: boolean;
  status: string;
  assignedSupervisorId: number | null;
  preparedCourseSlug: string | null;
  attachmentsCount: number;
  createdAt: string;
  updatedAt: string;
};

type SupportReply = {
  id: number;
  authorEmail: string;
  authorRole: string;
  body: string;
  internal: boolean;
  createdAt: string;
};

type SupportTicket = {
  id: number;
  ticketNumber: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  contactChannel: string | null;
  status: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  replies: SupportReply[];
};

type Notification = {
  id: number;
  title: string;
  body: string;
  actionUrl: string | null;
  actionLabel: string | null;
  presentation: string;
  template: string;
  pushEnabled: boolean;
  pushStatus: string | null;
  pushAttempts: number;
  pushDeliveredAt: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  dismissible: boolean;
  readAt: string | null;
  createdAt: string;
};

type Session = {
  id: number;
  deviceId: string | null;
  deviceLabel: string;
  platform: string;
  ipAddress: string | null;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

type Student360Response = {
  ok: boolean;
  error?: string;
  student: Student;
  summary: {
    activeSubscriptions: number;
    completedLessons: number;
    watchedSeconds: number;
    paidOrders: number;
    paidValue: number;
    openTickets: number;
    unreadNotifications: number;
  };
  catalog: {
    institution: { slug: string; name: string } | null;
    courses: Array<{ slug: string; title: string; university: string; universitySlug: string; specialty: string }>;
  };
  subscriptions: Subscription[];
  accessEvents: AccessEvent[];
  progress: Progress[];
  orders: Order[];
  requests: CourseRequest[];
  support: SupportTicket[];
  notifications: Notification[];
  sessions: Session[];
};

const labels: Record<string, string> = {
  active: "نشط",
  disabled: "متوقف",
  suspended: "موقوف",
  revoked: "ملغي",
  expired: "منتهي",
  scheduled: "مجدول",
  paid: "مدفوع",
  pending: "معلّق",
  initiated: "بدأ الدفع",
  verification_pending: "قيد التحقق من الدفع",
  payment_review: "قيد مراجعة الدفع",
  failed: "فشل",
  refunded: "مسترد",
  partially_refunded: "مسترد جزئيًا",
  cancelled: "ملغي",
  voided: "ملغى من بوابة الدفع",
  new: "جديد",
  assigned: "مسند",
  reviewing: "قيد المراجعة",
  planned: "مخطط",
  producing: "قيد الإنتاج",
  available: "متاح",
  declined: "متعذر",
  open: "مفتوح",
  waiting: "بانتظار الطالب",
  resolved: "محلول",
  closed: "مغلق",
  grant: "منح وصول",
  pause: "إيقاف الوصول",
  resume: "استئناف الوصول",
  extend: "تمديد الوصول",
  revoke: "إلغاء الوصول",
  purchase: "شراء",
  admin: "إدارة",
  campaign: "حملة",
  inbox: "مركز الإشعارات",
  banner: "شريط إعلاني",
  modal: "نافذة منبثقة",
  all: "كل مواضع العرض",
  delivered: "تم التسليم",
  queued: "في الطابور",
  sent: "تم الإرسال",
  web: "ويب",
  mobile: "تطبيق",
};

function label(value: string | null | undefined) {
  if (!value) return "—";
  return labels[value] || value.replaceAll("_", " ");
}

function safeDate(value: string | null | undefined, withTime = true) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(parsed);
}

function money(value: number, currency = "SAR") {
  const amount = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(value || 0);
  return `${amount} ${currency.toUpperCase() === "SAR" ? "ر.س" : currency}`;
}

function duration(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours.toLocaleString("ar-SA")} س ${minutes.toLocaleString("ar-SA")} د`;
  return `${minutes.toLocaleString("ar-SA")} د`;
}

function tone(value: string) {
  if (["active", "paid", "resolved", "closed", "available", "delivered", "sent"].includes(value)) return "success";
  if (["failed", "revoked", "cancelled", "voided", "declined"].includes(value)) return "danger";
  return "warning";
}

function subscriptionState(subscription: Subscription) {
  if (subscription.revokedAt) return "revoked";
  if (subscription.suspendedAt) return "suspended";
  if (Date.parse(subscription.startsAt) > Date.now()) return "scheduled";
  if (subscription.expiresAt && Date.parse(subscription.expiresAt) <= Date.now()) return "expired";
  return "active";
}

function sessionState(session: Session) {
  if (session.revokedAt) return "revoked";
  if (Date.parse(session.expiresAt) <= Date.now()) return "expired";
  return "active";
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

function PanelHead({ icon: Icon, title, copy, count }: { icon: React.ElementType; title: string; copy: string; count?: number }) {
  return <header className={styles.panelHead}><span className={styles.panelTitle}><i><Icon size={18} /></i><span><h2>{title}</h2><p>{copy}</p></span></span>{typeof count === "number" && <span className={styles.count}>{count.toLocaleString("ar-SA")}</span>}</header>;
}

export function Student360({ email }: { email: string }) {
  const [data, setData] = useState<Student360Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/students/${encodeURIComponent(email)}`, { cache: "no-store", credentials: "same-origin" });
      const result = await response.json() as Student360Response;
      if (!response.ok) throw new Error(result.error || "تعذر تحميل ملف الطالب");
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل ملف الطالب");
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading && !data) return <main className={styles.page} dir="rtl"><div className={styles.loading}><span><i className={styles.spinner} /><p>جارٍ جمع ملف الطالب من جميع أجزاء المنصة…</p></span></div></main>;
  if (error && !data) return <main className={styles.page} dir="rtl"><div className={styles.loading}><section className={styles.error}><h1>تعذر فتح ملف الطالب</h1><p>{error}</p><button className={styles.retry} onClick={() => void load()}><RefreshCw size={15} /> إعادة المحاولة</button></section></div></main>;
  if (!data) return null;

  const courseName = (slug: string) => data.catalog.courses.find((course) => course.slug === slug)?.title || slug;
  const groupedProgress = Array.from(data.progress.reduce((groups, row) => {
    const current = groups.get(row.courseSlug) || { courseSlug: row.courseSlug, lessons: 0, completed: 0, watchedSeconds: 0, updatedAt: row.updatedAt };
    current.lessons += 1;
    current.completed += row.completed ? 1 : 0;
    current.watchedSeconds += Math.max(0, row.watchedSeconds);
    if (Date.parse(row.updatedAt) > Date.parse(current.updatedAt)) current.updatedAt = row.updatedAt;
    groups.set(row.courseSlug, current);
    return groups;
  }, new Map<string, { courseSlug: string; lessons: number; completed: number; watchedSeconds: number; updatedAt: string }>()).values());
  const initials = data.student.fullName.trim().slice(0, 2) || "ط";
  const university = data.catalog.institution?.name || data.student.universitySlug || "غير محددة";

  return <main className={styles.page} dir="rtl">
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <span className={styles.breadcrumb}>الإدارة <ChevronLeft size={12} /> الطلاب <ChevronLeft size={12} /> ملف 360</span>
        <Link className={styles.back} href="/admin"><ChevronLeft size={15} /> العودة إلى لوحة الإدارة</Link>
      </div>

      <section className={styles.hero}>
        <span className={styles.avatar}>{initials}</span>
        <div className={styles.identity}>
          <div className={styles.identityTop}><h1>{data.student.fullName}</h1><span className={styles.badge} data-tone={tone(data.student.status)}>{label(data.student.status)}</span></div>
          <p><Mail size={13} /><bdi>{data.student.email}</bdi><span>•</span><MapPin size={13} />{university}<span>•</span><GraduationCap size={13} />{data.student.specialty || "التخصص غير محدد"}</p>
        </div>
        <div className={styles.heroMeta}><span>آخر دخول<strong>{safeDate(data.student.lastLoginAt)}</strong></span><span>رقم الطالب<strong>#{data.student.id.toLocaleString("ar-SA")}</strong></span></div>
      </section>

      <section className={styles.metrics} aria-label="ملخص الطالب">
        {[
          { icon: ShieldCheck, label: "اشتراكات نشطة", value: data.summary.activeSubscriptions.toLocaleString("ar-SA") },
          { icon: BookOpenCheck, label: "دروس مكتملة", value: data.summary.completedLessons.toLocaleString("ar-SA") },
          { icon: Clock3, label: "وقت المشاهدة", value: duration(data.summary.watchedSeconds) },
          { icon: ReceiptText, label: "طلبات مدفوعة", value: data.summary.paidOrders.toLocaleString("ar-SA") },
          { icon: CircleDollarSign, label: "قيمة الطلبات المدفوعة", value: money(data.summary.paidValue) },
          { icon: Headphones, label: "دعم مفتوح / إشعارات", value: `${data.summary.openTickets.toLocaleString("ar-SA")} / ${data.summary.unreadNotifications.toLocaleString("ar-SA")}` },
        ].map(({ icon: Icon, label: metricLabel, value }) => <article className={styles.metric} key={metricLabel}><i><Icon size={17} /></i><span>{metricLabel}<strong>{value}</strong></span></article>)}
      </section>

      <nav className={styles.nav} aria-label="أقسام ملف الطالب">
        {[["profile", "الملخص"], ["subscriptions", "الاشتراكات"], ["progress", "التقدم"], ["orders", "الطلبات والفواتير"], ["requests", "طلبات المواد"], ["support", "الدعم"], ["notifications", "الإشعارات"], ["sessions", "الجلسات"]].map(([id, text]) => <a href={`#${id}`} key={id}>{text}</a>)}
      </nav>

      <div className={styles.grid}>
        <section className={styles.panel} id="profile">
          <PanelHead icon={UserRound} title="بيانات الطالب" copy="الهوية والحالة الدراسية والتحقق من الحساب" />
          <div className={styles.profileGrid}>
            {[
              ["البريد الإلكتروني", data.student.email, true],
              ["رقم الجوال", data.student.phone || "غير مضاف", true],
              ["الجامعة", university],
              ["التخصص", data.student.specialty || "غير محدد"],
              ["المستوى الأكاديمي", data.student.academicLevel || "غير محدد"],
              ["توثيق البريد", data.student.emailVerifiedAt ? `موثق · ${safeDate(data.student.emailVerifiedAt, false)}` : "غير موثق"],
              ["توثيق الجوال", data.student.phoneVerifiedAt ? `موثق · ${safeDate(data.student.phoneVerifiedAt, false)}` : "غير موثق"],
              ["تاريخ إنشاء الحساب", safeDate(data.student.createdAt)],
            ].map(([itemLabel, value, ltr]) => <div className={styles.profileItem} key={String(itemLabel)}><span>{itemLabel}</span>{ltr ? <bdi className={styles.ltr}>{value}</bdi> : <strong>{value}</strong>}</div>)}
          </div>
        </section>

        <section className={styles.panel} id="subscriptions">
          <PanelHead icon={ShieldCheck} title="الاشتراكات والوصول" copy="حالة كل مادة وسجل الإجراءات الإدارية والشرائية" count={data.subscriptions.length} />
          {data.subscriptions.length ? <div className={styles.cardGrid}>{data.subscriptions.map((subscription) => {
            const state = subscriptionState(subscription);
            const events = data.accessEvents.filter((event) => event.accessId === subscription.id || (!event.accessId && event.courseSlug === subscription.courseSlug)).slice(0, 20);
            return <article className={styles.card} key={subscription.id}>
              <div className={styles.cardHead}><span><h3>{courseName(subscription.courseSlug)}</h3><p><bdi className={styles.ltr}>{subscription.courseSlug}</bdi></p></span><span className={styles.badge} data-tone={tone(state)}>{label(state)}</span></div>
              <div className={styles.facts}>
                <span className={styles.fact}><span>مصدر الوصول</span><strong>{label(subscription.source)}</strong></span>
                <span className={styles.fact}><span>بدأ في</span><strong>{safeDate(subscription.startsAt, false)}</strong></span>
                <span className={styles.fact}><span>ينتهي في</span><strong>{subscription.expiresAt ? safeDate(subscription.expiresAt, false) : "دون انتهاء"}</strong></span>
                <span className={styles.fact}><span>الطلب</span><strong><bdi className={styles.ltr}>{subscription.orderNumber || "—"}</bdi></strong></span>
              </div>
              {(subscription.suspensionReason || subscription.revocationReason) && <p className={styles.reason}>{subscription.revocationReason || subscription.suspensionReason}</p>}
              <details className={styles.details}><summary>سجل الوصول ({events.length.toLocaleString("ar-SA")})</summary>{events.length ? <div className={styles.timeline}>{events.map((event) => <span className={styles.timelineItem} key={event.id}><strong>{label(event.action)}</strong><small>{safeDate(event.createdAt)} · {event.actorEmail}</small>{event.reason && <small>{event.reason}</small>}</span>)}</div> : <p>لا توجد أحداث إضافية.</p>}</details>
            </article>;
          })}</div> : <Empty>لا توجد اشتراكات أو صلاحيات وصول لهذا الطالب.</Empty>}
        </section>

        <section className={`${styles.panel} ${styles.half}`} id="progress">
          <PanelHead icon={BookOpenCheck} title="التقدم الدراسي" copy="التقدم في الدروس التي بدأها الطالب" count={data.progress.length} />
          {groupedProgress.length ? <div className={styles.progressList}>{groupedProgress.map((row) => {
            const percent = row.lessons ? Math.round((row.completed / row.lessons) * 100) : 0;
            return <article className={styles.progressRow} key={row.courseSlug}><span><strong>{courseName(row.courseSlug)}</strong><small>{row.completed.toLocaleString("ar-SA")} مكتمل من {row.lessons.toLocaleString("ar-SA")} بدأها · {duration(row.watchedSeconds)}</small></span><span className={styles.track} aria-label={`نسبة الإنجاز ${percent}%`}><i style={{ width: `${percent}%` }} /></span><b>{percent.toLocaleString("ar-SA")}%</b></article>;
          })}</div> : <Empty>لم يبدأ الطالب أي درس بعد.</Empty>}
        </section>

        <section className={`${styles.panel} ${styles.half}`} id="requests">
          <PanelHead icon={FileClock} title="طلبات المواد" copy="كل طلبات تجهيز المواد وحالتها" count={data.requests.length} />
          {data.requests.length ? <div className={styles.list}>{data.requests.map((request) => <article className={styles.listItem} key={request.id}><span><strong>{request.courseName}</strong><small>{request.university} · {request.specialty} · {safeDate(request.createdAt)}</small></span><span className={styles.badge} data-tone={tone(request.status)}>{label(request.status)}</span>{request.notes && <p>{request.notes}</p>}<p>{request.attachmentsCount.toLocaleString("ar-SA")} مرفق{request.preparedCourseSlug ? ` · جُهزت كمادة ${courseName(request.preparedCourseSlug)}` : ""}{request.notify ? " · الإشعار عند الجاهزية مفعّل" : ""}</p></article>)}</div> : <Empty>لا توجد طلبات مواد.</Empty>}
        </section>

        <section className={styles.panel} id="orders">
          <PanelHead icon={ReceiptText} title="الطلبات والفواتير" copy="العناصر والمبالغ وحالة الدفع والفاتورة المرتبطة" count={data.orders.length} />
          {data.orders.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الطلب</th><th>العناصر</th><th>المبلغ</th><th>الدفع</th><th>الحالة</th><th>التاريخ والفاتورة</th></tr></thead><tbody>{data.orders.map((order) => <tr key={order.orderNumber}>
            <td><strong><bdi className={styles.ltr}>{order.orderNumber}</bdi></strong>{order.couponCode && <small>كوبون: <bdi className={styles.ltr}>{order.couponCode}</bdi></small>}</td>
            <td><span className={styles.itemList}>{order.items.length ? order.items.map((item) => <span key={item.id}><strong>{courseName(item.courseSlug)}</strong><small>{money(item.total, order.currency)}{item.accessDurationDays ? ` · ${item.accessDurationDays.toLocaleString("ar-SA")} يوم وصول` : ""}</small></span>) : <span>لا توجد عناصر محفوظة</span>}</span></td>
            <td><span className={styles.money}>{money(order.total, order.currency)}</span><small>خصم {money(order.discount, order.currency)}</small></td>
            <td>{label(order.paymentMethod)}{order.tapChargeId && <small><bdi className={styles.ltr}>{order.tapChargeId}</bdi></small>}</td>
            <td><span className={styles.badge} data-tone={tone(order.status)}>{label(order.status)}</span></td>
            <td>{safeDate(order.paidAt || order.createdAt)}<details className={`${styles.details} ${styles.orderDetails}`}><summary>{order.invoice ? "تفاصيل الفاتورة" : "لا توجد فاتورة"}</summary>{order.invoice && <div className={styles.invoice}><span>رقم الفاتورة<b><bdi className={styles.ltr}>{order.invoice.invoiceNumber}</bdi></b></span><span>الإجمالي<b>{money(order.invoice.total, order.invoice.currency)}</b></span><span>الضريبة<b>{money(order.invoice.taxAmount, order.invoice.currency)}</b></span><span>تاريخ الإصدار<b>{safeDate(order.invoice.issuedAt, false)}</b></span></div>}</details></td>
          </tr>)}</tbody></table></div> : <Empty>لا توجد طلبات أو فواتير مرتبطة بهذا الطالب.</Empty>}
        </section>

        <section className={`${styles.panel} ${styles.half}`} id="support">
          <PanelHead icon={Headphones} title="الدعم" copy="التذاكر والمحادثات وحالة المعالجة" count={data.support.length} />
          {data.support.length ? <div className={styles.list}>{data.support.map((ticket) => <article className={styles.listItem} key={ticket.id}><span><strong>{ticket.title}</strong><small><bdi className={styles.ltr}>{ticket.ticketNumber}</bdi> · {label(ticket.category)} · {safeDate(ticket.createdAt)}</small></span><span className={styles.badge} data-tone={tone(ticket.status)}>{label(ticket.status)}</span><p>{ticket.message}</p>{ticket.replies.length > 0 && <details className={styles.details}><summary>{ticket.replies.length.toLocaleString("ar-SA")} ردود</summary>{ticket.replies.map((reply) => <div className={styles.reply} key={reply.id}><strong>{reply.authorRole === "student" ? "الطالب" : "فريق مراس"}{reply.internal ? " · ملاحظة داخلية" : ""}</strong><p>{reply.body}</p><small>{safeDate(reply.createdAt)}</small></div>)}</details>}</article>)}</div> : <Empty>لا توجد تذاكر دعم.</Empty>}
        </section>

        <section className={`${styles.panel} ${styles.half}`} id="notifications">
          <PanelHead icon={Bell} title="الإشعارات" copy="حالة القراءة والإرسال الفوري وموضع العرض" count={data.notifications.length} />
          {data.notifications.length ? <div className={styles.list}>{data.notifications.map((notice) => <article className={`${styles.listItem} ${!notice.readAt ? styles.notificationUnread : ""}`} key={notice.id}><span><strong>{notice.title}</strong><small>{safeDate(notice.createdAt)} · {label(notice.presentation)}</small></span><span className={styles.badge} data-tone={notice.readAt ? "success" : "warning"}>{notice.readAt ? "مقروء" : "غير مقروء"}</span><p>{notice.body}</p><p>{notice.pushEnabled ? `إشعار فوري: ${label(notice.pushStatus)} · ${notice.pushAttempts.toLocaleString("ar-SA")} محاولة` : "إشعار داخل المنصة فقط"}{notice.actionLabel ? ` · الإجراء: ${notice.actionLabel}` : ""}</p></article>)}</div> : <Empty>لا توجد إشعارات مخصصة لهذا الطالب.</Empty>}
        </section>

        <section className={styles.panel} id="sessions">
          <PanelHead icon={Laptop} title="الجلسات والأجهزة" copy="الأجهزة التي دخل منها الطالب وحالتها وآخر نشاط" count={data.sessions.length} />
          {data.sessions.length ? <div className={styles.list}>{data.sessions.map((session) => {
            const state = sessionState(session);
            const Icon = session.platform === "mobile" ? Smartphone : Laptop;
            return <article className={styles.listItem} key={session.id}><i className={styles.sessionIcon}><Icon size={16} /></i><span><strong>{session.deviceLabel}</strong><small>{label(session.platform)} · آخر نشاط {safeDate(session.lastSeenAt)}</small></span><span className={styles.badge} data-tone={tone(state)}>{label(state)}</span><p>{session.ipAddress ? <>عنوان الشبكة: <bdi className={styles.ltr}>{session.ipAddress}</bdi> · </> : null}تنتهي الجلسة: {safeDate(session.expiresAt)}{session.revokedAt ? ` · أُلغيت ${safeDate(session.revokedAt)}` : ""}</p></article>;
          })}</div> : <Empty>لا توجد جلسات مسجلة.</Empty>}
        </section>
      </div>
    </div>
  </main>;
}
