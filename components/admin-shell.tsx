"use client";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronLeft, CircleDollarSign, ExternalLink, GraduationCap, House, LogOut, Menu, MessagesSquare, RefreshCw, Search, Settings2, ShieldCheck, UsersRound, X } from "lucide-react";
import { ADMIN_SELF_SECURITY, activeAdminDestination, visibleAdminNavigation, searchAdminNavigation } from "@/lib/admin-navigation";
import { useAdminAccess } from "@/components/admin-access";
import { BrandLockup } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-provider";
import { signOutWeb } from "@/components/web-logout";
import styles from "./admin-shell.module.css";

const groupIcons = { home: House, education: BookOpen, students: GraduationCap, finance: CircleDollarSign, communication: MessagesSquare, website: ExternalLink, security: UsersRound, operations: Settings2 };

export function AdminShell({ children, name }: { children: ReactNode; name: string }) {
  const { permissions, owner } = useAdminAccess();
  const pathname = usePathname() || "/admin", params = useSearchParams(), router = useRouter();
  const view = params.get("view"), active = activeAdminDestination(pathname, view), groups = visibleAdminNavigation(permissions, owner);
  const [query, setQuery] = useState(""), [mobileOpen, setMobileOpen] = useState(false), [collapsed, setCollapsed] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const results = query.trim() ? searchAdminNavigation(groups, query) : [];
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (mobileOpen && !element.open) element.showModal();
    else if (!mobileOpen && element.open) element.close();
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);
  useEffect(() => { const timer = setTimeout(() => setMobileOpen(false), 0); return () => clearTimeout(timer); }, [pathname, view]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1051px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  // Permission-sensitive pages are rendered on demand; menu links never prefetch.
  const nav = <>
    <div className={styles.search}>
      <Search size={17} aria-hidden="true" />
      <input aria-label="البحث في أقسام الإدارة المسموحة" placeholder="ابحث عن قسم أو مهمة…" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} />
      {query && <button type="button" aria-label="مسح البحث في الأقسام" onClick={event => { setQuery(""); event.currentTarget.parentElement?.querySelector("input")?.focus(); }}><X size={16} aria-hidden="true" /></button>}
    </div>
    {query.trim() && <p className={styles.searchCount} role="status">{results.length} من الأقسام المتاحة لك</p>}
    <nav aria-label="أقسام الإدارة الموحدة" className={styles.nav}>
      {query.trim() ? results.map(item => <Link prefetch={false} key={item.id} href={item.href} aria-current={active?.item.id === item.id ? "page" : undefined} onClick={() => setMobileOpen(false)}><span>{item.title}<small>{item.groupTitle}</small></span><ChevronLeft size={15} aria-hidden="true" /></Link>) : groups.map(group => {
        const Icon = groupIcons[group.id as keyof typeof groupIcons] || Settings2;
        return <details className={styles.group} key={`${group.id}:${active?.group?.id === group.id}`} open={active?.group?.id === group.id || group.id === "home"}>
          <summary><span><Icon size={18} aria-hidden="true" />{group.title}</span><ChevronDown size={15} aria-hidden="true" /></summary>
          {group.items.map(item => <Link prefetch={false} key={item.id} href={item.href} aria-current={active?.item.id === item.id ? "page" : undefined} onClick={() => setMobileOpen(false)}><span>{item.title}</span><ChevronLeft size={14} aria-hidden="true" /></Link>)}
        </details>;
      })}
      {query.trim() && !results.length && <div className={styles.empty}><Search size={24} aria-hidden="true" /><strong>لا توجد مهمة مطابقة</strong><span>جرّب اسم قسم أو امسح البحث لعرض الأقسام المتاحة لك.</span></div>}
    </nav>
    <div className={styles.footer}>
      <div className={styles.account}><span className={styles.avatar} aria-hidden="true">{name.trim().slice(0, 1) || "م"}</span><span><strong>{name}</strong><small>{owner ? "المدير الأعلى" : "مشرف بصلاحيات محددة"}</small></span></div>
      <Link prefetch={false} href={ADMIN_SELF_SECURITY.href} aria-current={active?.item.id === ADMIN_SELF_SECURITY.id ? "page" : undefined} onClick={() => setMobileOpen(false)}><ShieldCheck size={18} aria-hidden="true" />{ADMIN_SELF_SECURITY.title}</Link>
      <Link prefetch={false} href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />عرض الموقع<span className={styles.linkHint}>نافذة جديدة</span></Link>
      <button type="button" onClick={() => void signOutWeb("/")}><LogOut size={16} aria-hidden="true" />تسجيل الخروج</button>
    </div>
  </>;
  return <div className={`${styles.shell} ${collapsed ? styles.collapsed : ""}`} dir="rtl">
    <a className={styles.skip} href="#admin-workspace">انتقل إلى محتوى الإدارة</a>
    <aside className={styles.sidebar}><Link prefetch={false} className={styles.brand} href="/admin" aria-label="مراس العلم — الرئيسية الإدارية"><BrandLockup compact /><span>إدارة واحدة. عمل أوضح.</span></Link>{nav}</aside>
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.title}>
          <button ref={trigger} className={styles.mobileTrigger} onClick={() => setMobileOpen(true)} aria-label="فتح أقسام الإدارة" aria-expanded={mobileOpen} aria-controls="admin-navigation-dialog"><Menu size={21} aria-hidden="true" /></button>
          <button className={styles.desktopTrigger} aria-label={collapsed ? "إظهار القائمة" : "طي القائمة"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Menu size={20} aria-hidden="true" /></button>
          <div><small>{active?.group?.title || "مساحة الإدارة"}</small><strong>{active?.item.title || "تفاصيل السجل"}</strong></div>
        </div>
        <div className={styles.tools}>
          <ThemeToggle compact />
          <button className={styles.refresh} onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} aria-label={refreshing ? "جارٍ تحديث بيانات الإدارة" : "تحديث بيانات الإدارة"}><RefreshCw size={16} aria-hidden="true" /><span>{refreshing ? "جارٍ التحديث" : "تحديث"}</span></button>
          <span className={styles.identity}><span className={styles.roleDot} aria-hidden="true" />{owner ? "المدير الأعلى" : "مساحة المشرف"}</span>
        </div>
      </header>
      <div id="admin-workspace" className={styles.body} tabIndex={-1} aria-busy={refreshing}>{children}</div>
    </div>
    <dialog ref={dialog} id="admin-navigation-dialog" className={styles.dialog} aria-label="أقسام الإدارة" onCancel={() => setMobileOpen(false)} onClose={() => { setMobileOpen(false); trigger.current?.focus(); }}>
      <header><strong>إدارة مراس</strong><button aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)}><X size={23} aria-hidden="true" /></button></header>{nav}
    </dialog>
  </div>;
}
