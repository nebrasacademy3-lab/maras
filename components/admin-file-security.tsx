"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { fileScanErrorLabel, fileScanKindLabels } from "@/lib/file-scan-labels";
import styles from "./admin-file-security.module.css";

type Queue = { kind: string; counts: Record<string, number>; files: { id: number; originalName: string; scanStatus: string; scanError: string | null; attempts: number; nextAttemptAt: string | null }[] };
type ScanReport = { scanner: { provider: string; configured: boolean; reachable: boolean | null }; scheduler: { enabled: boolean; lastRunAt: string | null }; queues: Queue[] };
export function AdminFileSecurity() {
  const [data, setData] = useState<ScanReport | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const loading = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const read = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const controller = new AbortController(); requests.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/admin/files/scan", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const payload = await response.json() as ScanReport & { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر قراءة حالة المرفقات.");
      if (mounted.current) { setData(payload); setError(""); }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "تعذر قراءة حالة المرفقات."); }
    finally { clearTimeout(timeout); requests.current.delete(controller); loading.current = false; }
  }, []);
  useEffect(() => {
    mounted.current = true; void read();
    const active = requests.current;
    const timer = setInterval(() => { if (!document.hidden) void read(); }, 15_000);
    return () => { mounted.current = false; clearInterval(timer); active.forEach(controller => controller.abort()); };
  }, [read]);
  async function resume() {
    if (busy) return; setBusy(true); setMessage("");
    const controller = new AbortController(); requests.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch("/api/admin/files/scan", { method: "POST", credentials: "same-origin", signal: controller.signal });
      const payload = await response.json() as { error?: string; summary?: { clean: number; quarantined: number; pending: number; failed: number } };
      if (!response.ok || !payload.summary) throw new Error(payload.error || "تعذر تشغيل دفعة الفحص.");
      if (mounted.current) setMessage(`نتيجة الدفعة: ${payload.summary.clean} اجتازت الفحص، ${payload.summary.quarantined} محجورة، ${payload.summary.pending} معلقة، ${payload.summary.failed} تعذر تحديثها. تستكمل الدفعات تلقائيًا.`);
      await read();
    } catch (reason) { if (mounted.current) setMessage(reason instanceof Error ? reason.message : "تعذر تشغيل الفحص."); }
    finally { clearTimeout(timeout); requests.current.delete(controller); if (mounted.current) setBusy(false); }
  }
  const count = (status: string) => data?.queues.reduce((total, queue) => total + (queue.counts[status] || 0), 0) || 0;
  return <main dir="rtl" className={styles.page}>
    <AdminCenterNav />
    <header><p>حماية الملفات والمتابعة التشغيلية</p><h1>أمان المرفقات</h1><p>طلبات المواد والدعم وملفات التعلم وأدوات مراس، تحت سياسة فحص واحدة. لا يُتاح ملف قبل صدور نتيجة ناجحة محفوظة.</p></header>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    <section className={styles.metrics}>{[["اجتازت الفحص", count("clean")], ["تنتظر الفحص", count("pending")], ["محجورة أمنيًا", count("quarantined")]].map(([label, value]) => <article key={String(label)}><strong>{value}</strong><span>{label}</span></article>)}</section>
    <section className={styles.panel}><h2>حالة الخدمة</h2>{data ? <>
      <p>المحرك: <b>{data.scanner.provider === "clamd" ? "ClamAV" : data.scanner.provider === "remote" ? "خدمة فحص HTTP" : "غير مهيأ"}</b>. الاتصال: {data.scanner.reachable === true ? "يرد على فحص الاتصال" : data.scanner.reachable === false ? "غير متاح حاليًا" : "لا يوجد اختبار اتصال مباشر؛ تتأكد الجاهزية بفحص ملف فعلي"}.</p>
      <p>المعالجة التلقائية: {data.scheduler.enabled ? "مفعلة" : "معطلة — يلزم عامل خارجي أو إعادة التفعيل"}.{data.scheduler.lastRunAt ? ` آخر دورة على هذه النسخة: ${new Date(data.scheduler.lastRunAt).toLocaleString("ar-SA")}.` : " لم تُسجّل دورة على هذه النسخة بعد."}</p>
      {(!data.scanner.configured || data.scanner.reachable === false) && <p className={styles.notice}>في صورة Docker المرفقة يبدأ المحرك تلقائيًا، لكنه يحتاج تنزيل تعريفات الفيروسات ومساحة ذاكرة كافية. راجع سجلات التشغيل، أو اربط محركًا خارجيًا خاصًا عبر CLAMD_HOST أو MALWARE_SCAN_URL. راجع دليل FILE_SCANNING_AR.md.</p>}
    </> : <p>جارٍ قراءة حالة الخدمة…</p>}<div className={styles.actions}><button type="button" disabled={busy || !data?.scanner.configured} onClick={() => void resume()}>{busy ? "جارٍ فحص الدفعة…" : "استئناف فحص المرفقات المعلقة"}</button><button type="button" onClick={() => void read()}>تحديث الحالة</button></div>{message && <p role="status" className={styles.notice}>{message}</p>}</section>
    {data?.queues.map(queue => <section className={styles.panel} key={queue.kind}><h2>{fileScanKindLabels[queue.kind]}</h2><p>معلقة: {queue.counts.pending || 0} · محجورة: {queue.counts.quarantined || 0}. تظهر أحدث 30 حالة غير مكتملة.</p>{queue.files.length ? <div className={styles.files}>{queue.files.map(file => <article key={file.id}><div><strong>{file.originalName}</strong><small>#{file.id} · عدد المحاولات: {file.attempts}</small></div><span>{file.scanStatus === "quarantined" ? "محجور — لا يسمح بتنزيله" : fileScanErrorLabel(file.scanError)}</span>{file.nextAttemptAt && <small>المحاولة التالية: {new Date(file.nextAttemptAt).toLocaleString("ar-SA")}</small>}</article>)}</div> : <p>لا توجد ملفات معلقة أو محجورة في هذا القسم.</p>}</section>)}
  </main>;
}
