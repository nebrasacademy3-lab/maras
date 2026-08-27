"use client";

import { X, ArrowLeft, Megaphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Announcement = { id: number; title: string; body: string; actionUrl: string | null; actionLabel: string | null; presentation: "banner" | "modal" | "all"; dismissible: boolean; createdAt: string };

function safePath(url: string | null) { return url && url.startsWith("/") && !url.startsWith("//") ? url : null; }
function dismissed(id: number) { try { return sessionStorage.getItem(`meras-announcement-${id}`) === "1"; } catch { return false; } }
function dismiss(id: number) { try { sessionStorage.setItem(`meras-announcement-${id}`, "1"); } catch { /* private browsing may disable storage */ } }

export function AnnouncementCampaign() {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [modal, setModal] = useState<Announcement | null>(null);
  const [banner, setBanner] = useState<Announcement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/announcements", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { announcements?: Announcement[] } : null)
      .then((payload) => {
        if (controller.signal.aborted) return;
        const active = (payload?.announcements || []).filter((item) => !dismissed(item.id));
        setRows(active);
        setBanner(active.find((item) => item.presentation === "banner" || item.presentation === "all") || null);
        setModal(active.find((item) => item.presentation === "modal" || item.presentation === "all") || null);
      }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  const close = (item: Announcement) => { dismiss(item.id); setRows((current) => current.filter((row) => row.id !== item.id)); if (banner?.id === item.id) setBanner(null); if (modal?.id === item.id) setModal(null); };
  const action = (item: Announcement) => { const href = safePath(item.actionUrl); return href ? <Link href={href} className="announcement-action">{item.actionLabel || "اعرف المزيد"}<ArrowLeft size={15} /></Link> : null; };
  return <>{banner && <aside className="public-announcement-banner" role="status"><div className="container"><span className="announcement-mark"><Megaphone size={16} /></span><div><strong>{banner.title}</strong><p>{banner.body}</p></div>{action(banner)}{banner.dismissible && <button type="button" onClick={() => close(banner)} aria-label="إخفاء الإعلان"><X size={18} /></button>}</div></aside>}{modal && <div className="announcement-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={`announcement-${modal.id}`}><section className="announcement-modal"><div className="announcement-modal-icon"><Megaphone size={24} /></div><div className="announcement-modal-copy"><span>إعلان من مراس</span><h2 id={`announcement-${modal.id}`}>{modal.title}</h2><p>{modal.body}</p></div><div className="announcement-modal-actions">{action(modal)}{modal.dismissible && <button type="button" className="announcement-dismiss" onClick={() => close(modal)}>لاحقًا</button>}</div>{modal.dismissible && <button type="button" className="announcement-modal-close" onClick={() => close(modal)} aria-label="إغلاق الإعلان"><X size={18} /></button>}</section></div>}{rows.length > 0 && !banner && !modal ? null : null}</>;
}
