"use client";
import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { boundedDownloadBytes, fetchStudyPdf, PdfDownloadError } from "@/lib/study-pdf-download";
import styles from "./study-tools.module.css";

export function StudyArtifactDownload({ id }: { id: number }) { return <PdfDownloadControl key={id} id={id}/>; }
function PdfDownloadControl({ id }: { id: number }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [id]);
  async function download() {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage(""); let accountId: number | null = null;
    async function assertIdentity(signal: AbortSignal) {
      const response = await fetch("/api/profile", { cache: "no-store", credentials: "same-origin", redirect: "error", signal });
      if (response.status !== 200) { await response.body?.cancel(); throw new PdfDownloadError("PDF_SESSION_CHANGED", "انتهت الجلسة. سجّل الدخول مجددًا."); }
      const payload = JSON.parse(new TextDecoder().decode(await boundedDownloadBytes(response, 64 * 1024, signal))) as { user?: { id?: unknown } };
      const current = payload.user?.id;
      if (typeof current !== "number" || !Number.isSafeInteger(current) || current < 1 || (accountId !== null && current !== accountId)) throw new PdfDownloadError("PDF_SESSION_CHANGED", "تغيّر الحساب. أعد فتح النتيجة من الحساب الصحيح.");
      accountId = current;
    }
    try {
      const bytes = await fetchStudyPdf(id, { request: (path, init) => fetch(path, { ...init, credentials: "same-origin" }), assertIdentity, signal: controller.signal, onPending: () => setMessage("يجري تجهيز PDF من النص المحفوظ دون توليد جديد…") });
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }));
      const link = document.createElement("a"); link.href = url; link.download = `مراس-العلم-${id}.pdf`; link.rel = "noopener";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("تم تجهيز ملف PDF للتنزيل.");
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "تعذر تنزيل PDF."); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  return <div><button type="button" className={styles.primary} disabled={busy} aria-busy={busy} onClick={() => void download()}>{busy ? <LoaderCircle size={18} className={styles.spin}/> : <Download size={18}/>} {busy ? "تجهيز PDF…" : "تنزيل PDF"}</button>{message && <p role="status" className={styles.hint}>{message}</p>}<a className={styles.hint} href={`/api/ai/artifacts/${id}/download`}>نسخة Word السابقة</a></div>;
}
