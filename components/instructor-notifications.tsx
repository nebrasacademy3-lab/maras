"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Check, CheckCheck, RefreshCw } from "lucide-react";
import { authRequest } from "@/lib/auth-request";
import { instructorNotificationHref } from "@/lib/instructor-notification-links";
import { useRealtimeSync } from "./realtime-sync";
import styles from "./instructor-notifications.module.css";
type Notice = { id: number; title: string; body: string; actionUrl: string | null; actionLabel: string | null; createdAt: string; readAt: string | null };
export function InstructorNotifications({ userId }: { userId: number }) {
 const router = useRouter();
 const [rows, setRows] = useState<Notice[]>([]), [unread, setUnread] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const alive = useRef(true), mutation = useRef(false), version = useRef(0), readRequest = useRef<AbortController | null>(null), writeRequest = useRef<AbortController | null>(null);
 const emitCount = useCallback((count: number) => window.dispatchEvent(new CustomEvent("meras:notifications-read", { detail: { unread: count } })), []);
 const refresh = useCallback(async () => {
  if (!alive.current || mutation.current) return;
  const sequence = ++version.current; readRequest.current?.abort(); const controller = new AbortController(); readRequest.current = controller;
  try {
   const response = await authRequest("/api/mobile/notifications", { credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { "x-meras-acting-user": String(userId) } });
   const data = await response.json();
   if (!alive.current || controller.signal.aborted || sequence !== version.current) return;
   if (response.status === 401 || response.status === 409 || (response.ok && data.ownerId !== userId)) { setRows([]); setUnread(0); router.refresh(); throw new Error("تغيّرت الجلسة. حدّث الصفحة لمتابعة إشعارات حسابك الحالي."); }
   if (!response.ok || !Array.isArray(data.notifications)) throw new Error(data.error || "تعذر تحميل الإشعارات");
   setRows(data.notifications); setUnread(data.unreadCount); emitCount(data.unreadCount); setError("");
  } catch (reason) { if (alive.current && !controller.signal.aborted && sequence === version.current) setError(reason instanceof Error ? reason.message : "تعذر تحميل الإشعارات"); }
  finally { if (alive.current && !controller.signal.aborted && sequence === version.current) setLoading(false); }
 }, [userId, router, emitCount]);
 useEffect(() => { alive.current = true; const timer = setTimeout(() => void refresh(), 0); return () => { alive.current = false; clearTimeout(timer); readRequest.current?.abort(); writeRequest.current?.abort(); }; }, [refresh]);
 useRealtimeSync(payload => { if (!payload.changed || payload.changed.some(channel => ["account", "notifications"].includes(channel))) void refresh(); });
 async function mark(id: number | null) {
  if (mutation.current) return;
  mutation.current = true; ++version.current; readRequest.current?.abort(); const controller = new AbortController(); writeRequest.current = controller; setBusy(true); setError("");
  let saved = false;
  try {
   const response = await authRequest("/api/mobile/notifications", { method: "PATCH", credentials: "same-origin", signal: controller.signal, headers: { "content-type": "application/json", "x-meras-acting-user": String(userId) }, body: JSON.stringify(id === null ? { all: true } : { id }) });
   const data = await response.json();
   if (!alive.current || controller.signal.aborted) return;
   if (response.status === 401 || response.status === 409) { setRows([]); setUnread(0); router.refresh(); }
   if (!response.ok) throw new Error(data.error || "تعذر حفظ حالة القراءة");
   saved = true; const ids = new Set<number>(data.markedIds || []); setRows(current => current.map(item => ids.has(item.id) ? { ...item, readAt: data.readAt } : item)); setUnread(data.unreadCount); emitCount(data.unreadCount);
  } catch (reason) { if (alive.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر حفظ حالة القراءة"); }
  finally { mutation.current = false; if (alive.current) { setBusy(false); if (saved) void refresh(); } }
 }
 return <section className={styles.workspace} aria-labelledby="instructor-notices-title">
  <Link href="/instructor" className={styles.back}>العودة إلى مساحة الشارح</Link>
  <header className={styles.heading}><span className={styles.symbol}><Bell size={28} /></span><div><p>فريق مراس العلم</p><h1 id="instructor-notices-title">إشعاراتك</h1><span>تابع طلب الانضمام والعقود والمواد وملاحظات الإدارة من مكان واحد.</span></div></header>
  <div className={styles.toolbar}><span aria-live="polite">{loading ? "جارٍ تحميل الإشعارات…" : unread ? `${unread} إشعار غير مقروء` : "اطلعت على كل الإشعارات"}</span><div><button type="button" className="button button-ghost" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} />تحديث</button><button type="button" className="button button-soft" disabled={loading || busy || !unread} onClick={() => void mark(null)}><CheckCheck size={17} />قراءة الكل</button></div></div>
  {error && <p className={styles.error} role="alert">{error}</p>}
  {!loading && !error && !rows.length && <div className={styles.empty}><Bell size={40} /><h2>ستصلك التحديثات هنا</h2><p>عندما تراجع الإدارة طلبك أو ترسل عقدًا أو مادة، يظهر إشعارها في هذه المساحة.</p><Link className="button button-primary" href="/instructor">فتح مساحة الشارح</Link></div>}
  <div className={styles.list} aria-busy={loading || busy}>{rows.map(item => { const href = instructorNotificationHref(item.actionUrl), date = new Date(item.createdAt); return <article key={item.id} className={`${styles.notice} ${!item.readAt ? styles.unread : ""}`}><div className={styles.noticeHeading}><h2>{item.title}</h2>{!item.readAt && <span className={styles.badge}>جديد</span>}</div><p>{item.body}</p><footer>{Number.isFinite(date.getTime()) && <time dateTime={item.createdAt}>{date.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}</time>}<div>{!item.readAt && <button type="button" disabled={busy} onClick={() => void mark(item.id)}><Check size={16} />تمت القراءة</button>}{href && <Link href={href} prefetch={false} onClick={() => { if (!item.readAt) void mark(item.id); }}>{item.actionLabel || "فتح التفاصيل"}<ArrowLeft size={15} /></Link>}</div></footer></article>; })}</div>
  {rows.length >= 500 && <p className={styles.hint}>تُعرض أحدث 500 رسالة متاحة. زر «قراءة الكل» يشمل كل رسائلك المتاحة.</p>}
 </section>;
}
