"use client";

import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type NoticeKind = "success" | "error" | "info" | "warning";
type Notice = { id: number; kind: NoticeKind; title: string; message?: string; duration: number };
type ConfirmOptions = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type NotificationContextValue = {
  notify: (kind: NoticeKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);
let sequence = 0;

const iconFor: Record<NoticeKind, typeof CheckCircle2> = { success: CheckCircle2, error: CircleAlert, info: Info, warning: TriangleAlert };

export function NotificationCenter({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [confirmation, setConfirmation] = useState<(ConfirmOptions & { resolve: (answer: boolean) => void }) | null>(null);
  const notify = useCallback((kind: NoticeKind, title: string, message?: string) => {
    const id = ++sequence;
    setNotices((current) => [...current.slice(-3), { id, kind, title, message, duration: kind === "error" ? 6500 : 4200 }]);
  }, []);
  useEffect(() => {
    const timers = notices.map((notice) => window.setTimeout(() => setNotices((current) => current.filter((item) => item.id !== notice.id)), notice.duration));
    return () => timers.forEach(window.clearTimeout);
  }, [notices]);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmation({ ...options, resolve })), []);
  const value = useMemo(() => ({
    notify,
    success: (title: string, message?: string) => notify("success", title, message),
    error: (title: string, message?: string) => notify("error", title, message),
    info: (title: string, message?: string) => notify("info", title, message),
    warning: (title: string, message?: string) => notify("warning", title, message),
    confirm,
  }), [confirm, notify]);
  return <NotificationContext.Provider value={value}>
    {children}
    <div className="meras-notice-stack" aria-live="polite" aria-atomic="false">
      {notices.map((notice) => { const Icon = iconFor[notice.kind]; return <div key={notice.id} className={`meras-notice meras-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}><span className="meras-notice-icon"><Icon size={19} /></span><span className="meras-notice-copy"><strong>{notice.title}</strong>{notice.message ? <small>{notice.message}</small> : null}</span><button type="button" aria-label="إغلاق الإشعار" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}><X size={17} /></button></div>; })}
    </div>
    {confirmation ? <div className="meras-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { confirmation.resolve(false); setConfirmation(null); } }}>
      <section className={`meras-confirm-dialog${confirmation.danger ? " is-danger" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="meras-confirm-title" aria-describedby="meras-confirm-message">
        <span className="meras-confirm-mark"><TriangleAlert size={24} /></span><h2 id="meras-confirm-title">{confirmation.title}</h2><p id="meras-confirm-message">{confirmation.message}</p>
        <div className="meras-confirm-actions"><button type="button" className="button button-ghost" onClick={() => { confirmation.resolve(false); setConfirmation(null); }}>{confirmation.cancelLabel || "إلغاء"}</button><button type="button" className={`button ${confirmation.danger ? "button-danger" : "button-primary"}`} onClick={() => { confirmation.resolve(true); setConfirmation(null); }}>{confirmation.confirmLabel || "تأكيد"}</button></div>
      </section>
    </div> : null}
  </NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("NotificationCenter is missing");
  return value;
}
