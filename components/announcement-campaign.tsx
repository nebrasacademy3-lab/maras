"use client";

import { X, ArrowLeft, BadgePercent, BookOpen, Megaphone, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeSync } from "@/components/realtime-sync";

type Announcement = { id: number; title: string; body: string; actionUrl: string | null; actionLabel: string | null; presentation: "banner" | "modal" | "all"; template?: string; dismissible: boolean; createdAt: string };
function internalPath(url: string | null) { return url && url.startsWith("/") && !url.startsWith("//") ? url : null; }
function externalUrl(url: string | null) { if (!url) return null; try { return new URL(url).protocol === "https:" ? url : null; } catch { return null; } }
function dismissed(id: number) { try { return localStorage.getItem(`meras-announcement-${id}`) === "1"; } catch { return false; } }
function dismiss(id: number) { try { localStorage.setItem(`meras-announcement-${id}`, "1"); } catch { /* private browsing may disable storage */ } }
function modalSeen(id: number) { try { return sessionStorage.getItem(`meras-announcement-modal-${id}`) === "1"; } catch { return false; } }
function rememberModal(id: number) { try { sessionStorage.setItem(`meras-announcement-modal-${id}`, "1"); } catch { /* private browsing may disable storage */ } }
function TemplateIcon({ template }: { template?: string }) { if (template === "discount") return <BadgePercent size={20}/>; if (template === "new-course") return <BookOpen size={20}/>; if (template === "new-service" || template === "success") return <Sparkles size={20}/>; if (template === "urgent") return <TriangleAlert size={20}/>; return <Megaphone size={20}/>; }

export function AnnouncementCampaign() {
  const [modal, setModal] = useState<Announcement | null>(null); const [banner, setBanner] = useState<Announcement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const load = useCallback((signal?: AbortSignal) => fetch("/api/public/announcements", { cache: "no-store", signal }).then(async (response) => response.ok ? await response.json() as { announcements?: Announcement[] } : null).then((payload) => {
    if (signal?.aborted) return;
    const active = (payload?.announcements || []).filter((item) => !dismissed(item.id));
    const modalCandidate = active.find((item) => (item.presentation === "modal" || item.presentation === "all") && !modalSeen(item.id) && (item.dismissible || Boolean(item.actionUrl))) || null;
    const bannerCandidate = active.find((item) => item.presentation === "banner" || (item.presentation === "all" && modalSeen(item.id)) || (item.presentation === "modal" && !item.dismissible && !item.actionUrl)) || null;
    setModal(modalCandidate);
    setBanner(bannerCandidate?.id === modalCandidate?.id ? null : bannerCandidate);
  }).catch(() => undefined), []);
  const closeModal = useCallback((item: Announcement) => { rememberModal(item.id); setModal(null); if (item.presentation === "all") setBanner(item); else dismiss(item.id); }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useRealtimeSync((payload) => { if (!payload.changed || payload.changed.some((channel) => channel === "announcements" || channel === "settings")) void load(); });
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => modalRef.current?.focus(), 40);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && modal.dismissible) { closeModal(modal); return; }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((node) => !node.hasAttribute("hidden"));
      if (!focusable.length) { event.preventDefault(); modalRef.current.focus(); return; }
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { window.clearTimeout(timer); document.removeEventListener("keydown", keyboard); document.body.style.overflow = overflow; previous?.focus(); };
  }, [modal, closeModal]);
  const closeBanner = (item: Announcement) => { dismiss(item.id); setBanner(null); };
  const action = (item: Announcement, closeBeforeNavigation = false) => { const inside = internalPath(item.actionUrl); const outside = externalUrl(item.actionUrl); const onClick = closeBeforeNavigation ? () => closeModal(item) : undefined; if (inside) return <Link href={inside} className="announcement-action" onClick={onClick}>{item.actionLabel || "اعرف المزيد"}<ArrowLeft size={15}/></Link>; if (outside) return <a href={outside} target="_blank" rel="noopener noreferrer" className="announcement-action" onClick={onClick}>{item.actionLabel || "فتح الرابط"}<ArrowLeft size={15}/></a>; return null; };
  return <>{banner && <aside className={`public-announcement-banner announcement-template-${banner.template || "general"}`} role="status" aria-live="polite"><div className="container"><span className="announcement-mark"><TemplateIcon template={banner.template}/></span><div><strong>{banner.title}</strong><p>{banner.body}</p></div>{action(banner)}{banner.dismissible && <button type="button" className="announcement-banner-close" onClick={() => closeBanner(banner)} aria-label="إخفاء الإعلان"><X size={18}/></button>}</div></aside>}{modal && <div className="announcement-modal-backdrop"><section ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`announcement-${modal.id}`} aria-describedby={`announcement-body-${modal.id}`} className={`announcement-modal announcement-template-${modal.template || "general"}`}><div className="announcement-modal-icon"><TemplateIcon template={modal.template}/></div><div className="announcement-modal-copy"><span>إعلان من مراس</span><h2 id={`announcement-${modal.id}`}>{modal.title}</h2><p id={`announcement-body-${modal.id}`}>{modal.body}</p></div><div className="announcement-modal-actions">{action(modal, true)}{modal.dismissible && <button type="button" className="announcement-dismiss" onClick={() => closeModal(modal)}>لاحقًا</button>}</div>{modal.dismissible && <button type="button" className="announcement-modal-close" onClick={() => closeModal(modal)} aria-label="إغلاق الإعلان"><X size={18}/></button>}</section></div>}</>;
}
