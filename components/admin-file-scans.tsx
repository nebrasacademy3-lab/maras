"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { AdminMfaNotice, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { useRealtimeSync } from "@/components/realtime-sync";
import styles from "./admin-file-scans.module.css";
type FileRow = { id: number; originalName: string; sizeBytes: number; status: string; provider: string | null; attempts: number; nextAttemptAt: string | null; error: string | null; reason: string | null };
type Data = { configured: boolean; groups: Array<{ source: string; counts: Array<{ status: string; total: number }>; rows: FileRow[] }> };
const names: Record<string, string> = { request: "مرفقات طلبات المواد", support: "مرفقات الدعم", resource: "ملفات المواد", ai: "ملفات أدوات مراس" };
const errors: Record<string, string> = { scanner_not_configured: "اضبط عنوان خدمة الفحص وسر الاتصال في الخادم", scanner_timeout: "انتهت مهلة الفحص؛ ستتم إعادة المحاولة", scanner_unavailable: "خدمة الفحص غير متاحة حاليًا", stored_object_missing: "الملف غير موجود في التخزين", stored_size_mismatch: "حجم الملف لا يطابق سجل الرفع", file_exceeds_scan_limit: "الملف أكبر من حد الفحص (100 ميجابايت)", scanner_digest_mismatch: "نتيجة الفحص لا تخص نفس المحتوى", scanner_indeterminate: "رد خدمة الفحص غير حاسم", scanner_invalid_response: "رد خدمة الفحص غير صالح" };
export function AdminFileScans() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/files/scan", { cache: "no-store", credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تحميل الملفات");
      setData(result); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تحميل الملفات"); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useRealtimeSync(payload => { if (payload.changed?.includes("admin")) void load(); });
  async function act(payload: Record<string, unknown>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); setNotice(""); setStepUp(false);
    try {
      const response = await fetch("/api/admin/files/scan", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (isAdminStepUpResponse(response)) { setStepUp(true); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تشغيل الفحص");
      setNotice(result.queued ? "أُعيد الملف لطابور الفحص الآمن." : !result.summary.configured ? "خدمة الفحص تحتاج إلى ضبط عنوانها وسر الاتصال." : result.summary.busy ? "عامل الفحص يعمل الآن؛ ستظهر النتائج عند اكتماله." : "اكتمل فحص " + result.summary.scanned + " ملف.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تشغيل الفحص"); }
    finally { running.current = false; setBusy(false); }
  }
  return <main className={styles.page} dir="rtl"><AdminCenterNav compact /><header><h1>فحص المرفقات</h1><p>تُتاح الملفات بعد فحص محرك الحماية ومطابقة بصمة المحتوى. يعاد فحص الملفات المعلقة تلقائيًا.</p><button disabled={busy || !data?.configured} onClick={() => void act({ action: "run" })}>{busy ? "جارٍ الفحص…" : "فحص الملف التالي"}</button> <button disabled={busy} onClick={() => void load()}>تحديث</button></header>
    {stepUp && <AdminMfaNotice />}{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    {data && !data.configured && <p role="alert" className={styles.error}>خدمة الفحص غير مهيأة. اضبط MALWARE_SCAN_URL وMALWARE_SCAN_TOKEN في بيئة الخادم. ستبقى المرفقات محمية إلى أن يعمل الفحص.</p>}
    {!data && !error && <p>جارٍ تحميل حالة المرفقات…</p>}
    {data?.groups.map(group => <section key={group.source}><h2>{names[group.source]}</h2><p>{group.counts.map(item => (item.status === "clean" ? "سليم" : item.status === "pending" ? "بانتظار الفحص" : "محجور") + ": " + item.total).join(" · ") || "لا توجد ملفات"}</p><div className={styles.table}><table><thead><tr><th>الملف</th><th>الحالة</th><th>محاولات</th><th>التفاصيل</th><th>إجراء</th></tr></thead><tbody>{group.rows.map(row => <tr key={row.id}><td>{row.originalName}<small>{(row.sizeBytes / 1024 / 1024).toFixed(1)} م.ب</small></td><td>{row.status === "pending" ? "بانتظار الفحص" : "محجور"}</td><td>{row.attempts}</td><td>{row.reason || (row.error ? errors[row.error] || "تعذر الاتصال بالمحرك؛ ستتم إعادة المحاولة" : "في الطابور")}{row.nextAttemptAt && <small>المحاولة التالية: {new Date(row.nextAttemptAt).toLocaleString("ar-SA")}</small>}</td><td>{row.status === "pending" && <button disabled={busy} onClick={() => void act({ action: "retry", source: group.source, id: row.id })}>إعادة المحاولة</button>}</td></tr>)}</tbody></table></div>{!group.rows.length && <p>لا توجد ملفات معلقة أو محجورة.</p>}{group.rows.length === 50 && <p>تظهر أقدم 50 نتيجة في هذا القسم؛ تشمل الأعداد جميع الملفات.</p>}</section>)}
  </main>;
}
