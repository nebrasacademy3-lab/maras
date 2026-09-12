"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Keep scan errors inside the current screen rather than navigating to a JSON error. */
export function ProtectedFileDownload({ path, name, scanStatus, children, className }: { path: string; name: string; scanStatus?: string | null; children?: ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  async function download() {
    if (abort.current || scanStatus === "quarantined") return;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError("");
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const url = new URL(path, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || url.username || url.password) throw new Error("رابط الملف غير موثوق.");
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
      if (!response.ok) {
        let message = `تعذر التنزيل (HTTP ${response.status}).`;
        try { const data = await response.json() as { error?: unknown }; if (typeof data.error === "string") message = data.error.slice(0, 1000); } catch { /* Keep the HTTP status. */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      if (!mounted.current) return;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = objectUrl;
      anchor.download = name.replace(/[\x00-\x1f/\\]/g, "-").slice(0, 180) || "attachment";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (reason) {
      if (mounted.current) setError(controller.signal.aborted ? "انتهت مهلة التنزيل؛ أعد المحاولة." : reason instanceof Error ? reason.message : "تعذر تنزيل الملف.");
    } finally { clearTimeout(timeout); abort.current = null; if (mounted.current) setBusy(false); }
  }
  return <span className="protected-download"><button type="button" className={className || "button button-soft"} disabled={busy || scanStatus === "quarantined"} onClick={() => void download()} aria-busy={busy}>{busy ? "جارٍ التحقق والتنزيل…" : children || name}</button>{scanStatus === "quarantined" ? <small role="status">محجور لأسباب أمنية</small> : scanStatus === "pending" && !busy ? <small>قيد الفحص — يمكنك التحقق والتنزيل من الزر</small> : null}{error ? <small role="alert" style={{ display: "block", maxWidth: "40rem", whiteSpace: "normal" }}>{error}</small> : null}</span>;
}
