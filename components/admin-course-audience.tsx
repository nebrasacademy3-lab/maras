"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, BookOpen, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { ACCESS_STATES, WAITLIST_STATES, type CourseAudienceData } from "@/lib/course-audience-contract";
import styles from "@/components/admin-course-audience.module.css";

const labels: Record<string, string> = { active: "نشط", suspended: "موقوف مؤقتًا", scheduled: "لم يبدأ", expired: "منتهي", revoked: "ملغي", notified: "أُضيف له تنبيه", converted: "اشترك في المادة", cancelled: "ألغى التنبيه", published: "منشورة", hidden: "مخفية", draft: "مسودة", auto: "تلقائي: عند جاهزية أول درس", open: "مفتوح: حتى مع استمرار تجهيز الدروس", closed: "مغلق: استقبال طلبات التنبيه", purchase: "شراء", admin_payment: "دفع يدوي", admin_complimentary: "منحة إدارية", course_page: "صفحة المادة", mobile: "التطبيق" };
const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export function AdminCourseAudience({ slug }: { slug: string }) {
  const [data, setData] = useState<CourseAudienceData | null>(null);
  const [kind, setKind] = useState("subscriptions");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [mode, setMode] = useState("auto");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++sequence.current;
    const query = new URLSearchParams({ kind, status, q: appliedSearch, page: String(page) });
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/courses/${encodeURIComponent(slug)}/audience?${query}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const result = await response.json() as CourseAudienceData;
        if (!response.ok) throw new Error(result.error || "تعذر تحميل المادة");
        if (sequence.current === current) { setData(result); setMode(result.course.enrollmentMode); }
      } catch (caught) { if (!controller.signal.aborted && sequence.current === current) setError(caught instanceof Error ? caught.message : "تعذر التحميل"); }
      finally { if (sequence.current === current && !controller.signal.aborted) setLoading(false); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [slug, kind, status, appliedSearch, page, revision]);

  const act = async (action: "setEnrollment" | "dispatchLaunch") => {
    if (!data || busy) return;
    if (reason.trim().length < 3) { setFeedback("اكتب سبب الإجراء قبل التنفيذ."); return; }
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`/api/admin/courses/${encodeURIComponent(slug)}/audience`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, enrollmentMode: mode, expectedUpdatedAt: data.course.updatedAt, reason }) });
      const result = await response.json() as { error?: string; message?: string };
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الإجراء");
      setFeedback(result.message || "تم تنفيذ الإجراء"); setReason(""); refresh();
    } catch (caught) { setFeedback(caught instanceof Error ? caught.message : "تعذر تنفيذ الإجراء"); }
    finally { setBusy(false); }
  };

  return <main className={styles.page} dir="rtl"><div className={styles.shell}>
    <AdminCenterNav compact />
    <header className={styles.hero}><span className={styles.heroIcon}><BookOpen size={28} /></span><div><Link href="/admin?view=courses">الإدارة / المواد</Link><h1>{data?.course.title || "المشتركون وتنبيهات المادة"}</h1><p>{data ? `${data.course.university} · ${data.course.specialty}` : "عرض وإدارة جمهور المادة من مصدر البيانات نفسه للويب والتطبيقات"}</p></div><button onClick={refresh} disabled={loading || busy}><RefreshCw size={17} /> تحديث</button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {feedback && (isAdminStepUpMessage(feedback) ? <AdminMfaNotice /> : <p className={styles.notice} role="status">{feedback}</p>)}
    {data && <><section className={styles.metrics} aria-label="إحصاءات المادة">
      {[{ icon: Users, title: "جميع سجلات الاشتراك", value: data.summary.subscriptions }, { icon: ShieldCheck, title: "وصول نشط الآن", value: data.summary.active }, { icon: BellRing, title: "ينتظرون فتح الاشتراك", value: data.summary.waiting }, { icon: BellRing, title: "أُضيف لهم تنبيه", value: data.summary.notified }, { icon: BookOpen, title: "انتقلوا من الانتظار للاشتراك", value: data.summary.converted }].map(({ icon: Icon, title, value }) => <article key={title}><Icon size={20} /><span>{title}</span><strong>{value.toLocaleString("ar-SA")}</strong></article>)}
    </section>
    <section className={styles.control}><div><h2>التحكم بفتح الاشتراك</h2><p>المادة {labels[data.course.status] || data.course.status} · {data.course.availableForPurchase ? "يمكن الاشتراك الآن" : "الاشتراك غير متاح"} · {data.course.readyLessons} دروس جاهزة.</p><p>فتح الاشتراك لا ينشر مادة مخفية، ولا يمنح الطلاب وصولًا مجانيًا. إشعار المنصة يُحفظ أولًا؛ وصول إشعار الجهاز يتطلب إذن الطالب وجهازًا مسجلًا.</p></div><div className={styles.controlForm}><label>حالة الاشتراك<select value={mode} disabled={!data.course.managed || busy} onChange={event => setMode(event.target.value)}>{["auto", "open", "closed"].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label><label>سبب الإجراء<input maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="مثال: فتح تسجيل الدفعة الجديدة" /></label><div className={styles.buttons}><button disabled={busy || !data.course.managed} onClick={() => void act("setEnrollment")}>حفظ حالة الاشتراك</button><button disabled={busy || !data.course.availableForPurchase} onClick={() => void act("dispatchLaunch")}><BellRing size={16} /> معالجة تنبيهات هذه المادة</button><Link href={`/courses/${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer">معاينة صفحة الطالب</Link></div>{!data.course.managed && <p>حوّل المادة لإدارة حية من تعديل المادة في قائمة المواد أولًا.</p>}</div></section>
    <section className={styles.panel} aria-busy={loading}>
      <div className={styles.tabs} role="tablist" aria-label="نوع السجلات">{[["subscriptions", "المشتركون"], ["waitlist", "قائمة التنبيهات"]].map(([value, title]) => <button role="tab" aria-selected={kind === value} key={value} onClick={() => { setKind(value); setStatus("all"); setPage(1); }}>{title}</button>)}</div>
      <form className={styles.filters} onSubmit={event => { event.preventDefault(); setAppliedSearch(search); setPage(1); }}><label><Search size={16} /><input aria-label="البحث بالاسم أو البريد أو الجوال" value={search} onChange={event => setSearch(event.target.value)} placeholder="الاسم، البريد، رقم الجوال" /></label><select aria-label="تصفية حسب الحالة" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">جميع الحالات</option>{(kind === "waitlist" ? WAITLIST_STATES : ACCESS_STATES).map(value => <option value={value} key={value}>{value === "active" && kind === "waitlist" ? "ينتظر التنبيه" : labels[value]}</option>)}</select><button type="submit">بحث</button><span>{data.pagination.total.toLocaleString("ar-SA")} نتيجة مطابقة</span></form>
      <div className={styles.tableWrap}><table><thead><tr><th>الطالب</th><th>الحالة</th><th>{kind === "waitlist" ? "سجل التنبيه" : "الصلاحية والمصدر"}</th><th>التحكم</th></tr></thead><tbody>{!loading && data.items.map(row => <tr key={`${kind}:${row.id}`}><td><strong>{row.fullName || "حساب غير موجود"}</strong><bdi>{row.userEmail}</bdi>{row.phone && <bdi>{row.phone}</bdi>}</td><td><span className={styles.badge} data-active={row.status === "active"}>{row.status === "active" && kind === "waitlist" ? "بانتظار الإتاحة" : labels[row.status] || row.status}</span></td><td>{kind === "waitlist" ? <><span>فعّل التنبيه: {date(row.createdAt)}</span><small>أُبلغ: {date(row.notifiedAt)}</small><small>اشترك: {date(row.convertedAt)}</small></> : <><span>{labels[row.source] || row.source}</span><small>البداية: {date(row.startsAt)}</small><small>الانتهاء: {row.expiresAt ? date(row.expiresAt) : "دون انتهاء"}</small>{row.orderNumber && <bdi>{row.orderNumber}</bdi>}</>}</td><td>{row.userId ? <Link className={styles.profileLink} href={`/admin/students/${encodeURIComponent(row.userEmail)}#${kind === "waitlist" ? "interest" : "subscriptions"}`}>ملف الطالب والتحكم <ChevronLeft size={15} /></Link> : "—"}</td></tr>)}</tbody></table>{loading ? <p className={styles.empty} role="status">جارٍ تحديث البيانات…</p> : !data.items.length ? <p className={styles.empty}>لا توجد نتائج مطابقة للبحث والحالة المحددة.</p> : null}</div>
      <footer className={styles.pagination}><button disabled={loading || data.pagination.page <= 1} onClick={() => setPage(data.pagination.page - 1)}><ChevronRight size={16} /> السابق</button><span>صفحة {data.pagination.page} من {data.pagination.totalPages}</span><button disabled={loading || data.pagination.page >= data.pagination.totalPages} onClick={() => setPage(data.pagination.page + 1)}>التالي <ChevronLeft size={16} /></button><small>الإجماليات من كامل السجلات، وليست عدد الصفوف الظاهرة.</small></footer>
    </section></>}
    {!data && loading && <p className={styles.empty} role="status">جارٍ تحميل بيانات المادة…</p>}
  </div></main>;
}
