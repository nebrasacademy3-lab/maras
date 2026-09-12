"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { AdminMfaNotice, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { useRealtimeSync } from "@/components/realtime-sync";
import { fileScanErrorMessage, fileScanSummaryMessage } from "@/lib/file-scan-messages";
import styles from "./admin-file-scans.module.css";
type FileRow = { id: number; originalName: string; sizeBytes: number; status: string; provider: string | null; attempts: number; nextAttemptAt: string | null; error: string | null; reason: string | null };
type Connection = { ok: boolean; code: string | null; checkedAt: string };
type Data = { configured: boolean; configurationError?: string | null; groups: Array<{ source: string; counts: Array<{ status: string; total: number }>; rows: FileRow[] }> };
const names: Record<string, string> = { request: "مرفقات طلبات المواد", support: "مرفقات الدعم", resource: "ملفات المواد", ai: "ملفات أدوات مراس" };
export function AdminFileScans() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
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
    running.current = true; setBusy(true); setError(""); setNotice(null); setStepUp(false);
    try {
      const response = await fetch("/api/admin/files/scan", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (isAdminStepUpResponse(response)) { setStepUp(true); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تشغيل الفحص");
      await load();
      if (result.connection) {
        setConnection(result.connection);
        setNotice({ failed: !result.connection.ok, message: result.connection.ok ? "نجح الاتصال والفحص التجريبي الفعلي بمحرك ClamAV." : fileScanErrorMessage(result.connection.code) });
      } else if (result.summary) setNotice(fileScanSummaryMessage(result.summary));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تشغيل الفحص"); }
    finally { running.current = false; setBusy(false); }
  }
  return <main className={styles.page} dir="rtl">
    <AdminCenterNav compact />
    <header><h1>فحص المرفقات</h1><p>تفحص الخدمة محتوى الملف وتطابق بصمته قبل إتاحة تنزيله. إعادة المحاولة تفحص الملف المحدد، وتبقيه محميًا إذا فشل الفحص.</p>
      <div className={styles.actions}><button disabled={busy} onClick={() => void act({ action: "check" })}>اختبار الاتصال بخدمة الفحص</button><button disabled={busy || !data?.configured} onClick={() => void act({ action: "run" })}>{busy ? "جارٍ التنفيذ…" : "فحص الملف التالي"}</button><button disabled={busy} onClick={() => void load()}>تحديث</button></div>
      {connection && <p>آخر اختبار اتصال: {new Date(connection.checkedAt).toLocaleString("ar-SA")} — {connection.ok ? "نجح الفحص التجريبي" : "لم ينجح الاتصال أو الفحص"}</p>}
    </header>
    {stepUp && <AdminMfaNotice />}{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role={notice.failed ? "alert" : "status"} className={notice.failed ? styles.error : styles.success}>{notice.message}</p>}
    {data && !data.configured && <p role="alert" className={styles.error}>{fileScanErrorMessage(data.configurationError || "scanner_not_configured")}</p>}
    {data?.configured && !connection && <p>عنوان الخدمة ورمز الاتصال مدخلان. استخدم «اختبار الاتصال» للتأكد من أن خدمة الفحص تعمل فعليًا.</p>}
    {!data && !error && <p>جارٍ تحميل حالة المرفقات…</p>}
    {data?.groups.map(group => <section key={group.source}><h2>{names[group.source]}</h2><p>{group.counts.map(item => (item.status === "clean" ? "سليم" : item.status === "pending" ? "بانتظار الفحص" : "محجور") + ": " + item.total).join(" · ") || "لا توجد ملفات"}</p>
      <div className={styles.table}><table><thead><tr><th>الملف</th><th>الحالة</th><th>محاولات</th><th>التفاصيل</th><th>إجراء</th></tr></thead><tbody>{group.rows.map(row => <tr key={row.id}>
        <td>{row.originalName}<small>{(row.sizeBytes / 1024 / 1024).toFixed(1)} م.ب</small></td><td>{row.status === "pending" ? row.error ? "تعذر الفحص" : "بانتظار الفحص" : "محجور"}</td><td>{row.attempts}</td>
        <td>{row.reason || fileScanErrorMessage(row.error)}{row.error && <small>رمز الخطأ: <bdi>{row.error}</bdi></small>}{row.nextAttemptAt && <small>المحاولة الآلية التالية: {new Date(row.nextAttemptAt).toLocaleString("ar-SA")}</small>}</td>
        <td>{row.status === "pending" && <button disabled={busy || !data?.configured} onClick={() => void act({ action: "retry", source: group.source, id: row.id })}>فحص هذا الملف مجددًا</button>}</td>
      </tr>)}</tbody></table></div>{!group.rows.length && <p>لا توجد ملفات معلقة أو محجورة.</p>}{group.rows.length === 50 && <p>تظهر أقدم 50 نتيجة في هذا القسم؛ تشمل الأعداد جميع الملفات.</p>}
    </section>)}
  </main>;
}
