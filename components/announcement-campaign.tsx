"use client";

import { X, ArrowLeft, BadgePercent, BookOpen, Megaphone, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRealtimeSync } from "@/components/realtime-sync";

type Announcement = { id: number; title: string; body: string; actionUrl: string | null; actionLabel: string | null; presentation: "banner" | "modal" | "all"; template?: string; dismissible: boolean; createdAt: string };
function internalPath(url: string | null) { return url && url.startsWith("/") && !url.startsWith("//") ? url : null; }
function externalUrl(url: string | null) { if (!url) return null; try { return new URL(url).protocol === "https:" ? url : null; } catch { return null; } }
function dismissed(id: number) { try { return localStorage.getItem(`meras-announcement-${id}`) === "1"; } catch { return false; } }
function dismiss(id: number) { try { localStorage.setItem(`meras-announcement-${id}`, "1"); } catch { /* private browsing may disable storage */ } }
function TemplateIcon({ template }: { template?: string }) { if (template === "discount") return <BadgePercent size={20}/>; if (template === "new-course") return <BookOpen size={20}/>; if (template === "new-service" || template === "success") return <Sparkles size={20}/>; if (template === "urgent") return <TriangleAlert size={20}/>; return <Megaphone size={20}/>; }

export function AnnouncementCampaign() {
  const [rows, setRows] = useState<Announcement[]>([]); const [modal, setModal] = useState<Announcement | null>(null); const [banner, setBanner] = useState<Announcement | null>(null);
  const load = useCallback((signal?: AbortSignal) => fetch("/api/public/announcements", { cache: "no-store", signal }).then(async (response) => response.ok ? await response.json() as { announcements?: Announcement[] } : null).then((payload) => { if (signal?.aborted) return; const active = (payload?.announcements || []).filter((item) => !dismissed(item.id)); setRows(active); setBanner(active.find((item) => item.presentation === "banner" || item.presentation === "all") || null); setModal(active.find((item) => item.presentation === "modal" || item.presentation === "all") || null); }).catch(() => undefined), []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useRealtimeSync((payload) => { if (!payload.changed || payload.changed.some((channel) => channel === "announcements" || channel === "settings")) void load(); });
  const close = (item: Announcement) => { dismiss(item.id); setRows((current) => current.filter((row) => row.id !== item.id)); if (banner?.id === item.id) setBanner(null); if (modal?.id === item.id) setModal(null); };
  const action = (item: Announcement) => { const inside = internalPath(item.actionUrl); const outside = externalUrl(item.actionUrl); if (inside) return <Link href={inside} className="announcement-action">{item.actionLabel || "اعرف المزيد"}<ArrowLeft size={15}/></Link>; if (outside) return <a href={outside} target="_blank" rel="noopener noreferrer" className="announcement-action">{item.actionLabel || "فتح الرابط"}<ArrowLeft size={15}/></a>; return null; };
  return <>{banner && <aside className={`public-announcement-banner announcement-template-${banner.template || "general"}`} role="status"><div className="container"><span className="announcement-mark"><TemplateIcon template={banner.template}/></span><div><strong>{banner.title}</strong><p>{banner.body}</p></div>{action(banner)}{banner.dismissible && <button type="button" onClick={() => close(banner)} aria-label="إخفاء الإعلان"><X size={18}/></button>}</div></aside>}{modal && <div className="announcement-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={`announcement-${modal.id}`}><section className={`announcement-modal announcement-template-${modal.template || "general"}`}><div className="announcement-modal-icon"><TemplateIcon template={modal.template}/></div><div className="announcement-modal-copy"><span>إعلان من مراس</span><h2 id={`announcement-${modal.id}`}>{modal.title}</h2><p>{modal.body}</p></div><div className="announcement-modal-actions">{action(modal)}{modal.dismissible && <button type="button" className="announcement-dismiss" onClick={() => close(modal)}>لاحقًا</button>}</div>{modal.dismissible && <button type="button" className="announcement-modal-close" onClick={() => close(modal)} aria-label="إغلاق الإعلان"><X size={18}/></button>}</section></div>}{rows.length > 0 && !banner && !modal ? null : null}</>;
}
