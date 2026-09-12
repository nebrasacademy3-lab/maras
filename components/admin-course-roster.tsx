"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { AdminMfaNotice, isAdminStepUpResponse, ADMIN_STEP_UP_MESSAGE } from "@/components/admin-mfa-notice";
import styles from "@/components/student-360.module.css";

type Row = { id: number; userEmail: string; status: string; source: string; startsAt?: string; expiresAt?: string | null; createdAt?: string; notifiedAt?: string | null; convertedAt?: string | null; orderNumber?: string | null; updatedAt: string; student: { id: number; fullName: string; email: string; phone: string | null; status: string } | null };
type Data = { course: { slug: string; title: string; university: string; specialty: string; lessons: number; price: number }; rows: Row[]; totals: Record<string, number>; pagination: { page: number; pageSize: number; total: number } };
const labels: Record<string, string> = { all: "كل الحالات", active: "نشط", suspended: "متوقف مؤقتًا", revoked: "ملغي", expired: "منتهي", scheduled: "مجدول", notified: "أُبلغ بالتوفر", converted: "حصل على الوصول", cancelled: "ألغى التنبيه" };
const date = (value?: string | null) => value ? new Date(value).toLocaleString("ar-SA") : "—";
export function AdminCourseRoster({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState("subscriptions"); const [status, setStatus] = useState("all"); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [action, setAction] = useState<{ row: Row; operation: string; key: string } | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ kind, status, q, page: String(page) });
      const response = await fetch(`/api/admin/courses/${encodeURIComponent(slug)}?${query}`, { cache: "no-store", signal });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تحميل الملف"); setData(result);
    } catch (caught) { if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "تعذر تحميل الملف"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [slug, kind, status, q, page]);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 250); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!action) return; const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/console", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateAccess", id: action.row.id, operation: action.operation, operationKey: action.key, reason: form.get("reason"), days: Number(form.get("days") || 30), expectedUpdatedAt: action.row.updatedAt }) });
      if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الإجراء"); setAction(null); setMessage("تم تحديث الاشتراك وإضافة الإجراء إلى سجل الطالب"); await load();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "تعذر تنفيذ الإجراء"); } finally { setBusy(false); }
  }
  return <main className={styles.page} dir="rtl"><div className={styles.shell}><AdminCenterNav compact />
    <section className={styles.hero}><div className={styles.identity}><h1>{data?.course.title || "ملف المادة"}</h1><p>{data?.course.university} · {data?.course.specialty}</p></div><button className={styles.retry} disabled={loading} onClick={() => void load()}>تحديث</button></section>
    <nav className={styles.quickLinks}><Link href={`/admin?view=courses&q=${encodeURIComponent(slug)}`}>المحتوى والسعر وحالة النشر</Link><Link href={`/admin/course-resources?course=${encodeURIComponent(slug)}`}>ملفات المادة</Link><Link href={`/courses/${encodeURIComponent(slug)}`}>معاينة صفحة الطالب</Link><Link href="/admin/operations">حالة إرسال التنبيهات</Link></nav>
    {data && <section className={styles.metrics}>{[["subscriptions", "كل سجلات الوصول"], ["active", "مشتركون نشطون"], ["waiting", "فعلوا تنبيه التوفر"], ["notified", "أُبلغوا بالتوفر"]].map(([key, title]) => <article className={styles.metric} key={key}><span>{title}<strong>{(data.totals[key] || 0).toLocaleString("ar-SA")}</strong></span></article>)}</section>}
    <section className={styles.panel}><div className={styles.formGrid}><label>القائمة<select value={kind} onChange={(event) => { setKind(event.target.value); setStatus("all"); setPage(1); }}><option value="subscriptions">المشتركون والوصول</option><option value="waitlist">تنبيهات التوفر والانتظار</option></select></label><label>الحالة<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>{(kind === "waitlist" ? ["all", "active", "notified", "converted", "cancelled"] : ["all", "active", "suspended", "revoked", "expired", "scheduled"]).map((key) => <option value={key} key={key}>{labels[key]}</option>)}</select></label><label>بحث في جميع السجلات<input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="الاسم أو البريد أو الجوال أو الطلب" /></label></div>
    {error && <p role="alert">{error}</p>}{message && (message === ADMIN_STEP_UP_MESSAGE ? <AdminMfaNotice /> : <p role="status">{message}</p>)}
    <div className={styles.tableWrap} aria-busy={loading}><table className={styles.table}><thead><tr><th>الطالب</th><th>الحالة</th><th>التواريخ</th><th>المصدر والطلب</th><th>التحكم</th></tr></thead><tbody>{data?.rows.map((row) => <tr key={row.id}><td><Link href={`/admin/students/${encodeURIComponent(row.userEmail)}`}>{row.student?.fullName || row.userEmail}</Link><small><bdi>{row.userEmail}</bdi></small><small>{row.student?.phone}</small></td><td>{labels[row.status] || row.status}</td><td>{kind === "subscriptions" ? <><small>البداية: {date(row.startsAt)}</small><small>النهاية: {row.expiresAt ? date(row.expiresAt) : "دائم"}</small></> : <><small>طلب التنبيه: {date(row.createdAt)}</small><small>أُبلغ: {date(row.notifiedAt)}</small><small>اشترك: {date(row.convertedAt)}</small></>}</td><td>{row.source}{row.orderNumber && <small><Link href={`/admin/finance?search=${encodeURIComponent(row.orderNumber)}`}>{row.orderNumber}</Link></small>}</td><td><div className={styles.cardActions}><Link href={`/admin/students/${encodeURIComponent(row.userEmail)}#${kind === "subscriptions" ? "subscriptions" : "interest"}`}>ملف الطالب ٣٦٠</Link>{kind === "subscriptions" && row.status !== "revoked" && (row.status === "suspended" ? ["resume", "revoke"] : ["pause", ...(row.expiresAt ? ["extend"] : []), "revoke"]).map((operation) => <button type="button" key={operation} onClick={() => { setMessage(""); setAction({ row, operation, key: crypto.randomUUID() }); }}>{({ pause: "إيقاف", resume: "استئناف", extend: "تمديد", revoke: "إلغاء الوصول" } as Record<string, string>)[operation]}</button>)}</div></td></tr>)}</tbody></table></div>
    {!loading && !data?.rows.length && <p className={styles.empty}>لا توجد سجلات مطابقة.</p>}
    {data && <nav className={styles.pagination} aria-label="صفحات السجلات"><button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>السابق</button><span>صفحة {page.toLocaleString("ar-SA")} من {Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize)).toLocaleString("ar-SA")} · {data.pagination.total.toLocaleString("ar-SA")} سجل</span><button disabled={loading || page * data.pagination.pageSize >= data.pagination.total} onClick={() => setPage(page + 1)}>التالي</button></nav>}
    </section>
    {action && <section className={styles.panel} role="region" aria-label="تعديل الاشتراك"><h2>تعديل اشتراك {action.row.student?.fullName || action.row.userEmail}</h2><form onSubmit={submit} className={styles.formGrid}><label>سبب الإجراء<textarea name="reason" required minLength={3} maxLength={500} /></label>{action.operation === "extend" && <label>عدد الأيام<input type="number" name="days" min={1} max={3650} defaultValue={30} required /></label>}<div className={styles.cardActions}><button disabled={busy} type="submit">تنفيذ الإجراء</button><button type="button" disabled={busy} onClick={() => setAction(null)}>إلغاء</button></div></form></section>}
  </div></main>;
}
