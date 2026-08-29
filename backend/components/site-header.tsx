"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, ChevronLeft, CircleHelp, GraduationCap, Heart, House, LayoutDashboard, LifeBuoy, LogOut, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-provider";
import { SearchDialog } from "./search-dialog";
import { useRealtimeSync } from "./realtime-sync";
import { ensureCommerceLoaded, resetCommerce, useCommerceState } from "./commerce-state";
import { usePlatformControls } from "./use-platform-controls";

const publicLinks = [
  { href: "/", label: "الرئيسية", icon: House },
  { href: "/universities", label: "الجامعات", icon: GraduationCap },
  { href: "/courses", label: "المواد", icon: BookOpen },
  { href: "/how-it-works", label: "كيف تعمل مراس؟", icon: LifeBuoy },
  { href: "/#faq", label: "الأسئلة الشائعة", icon: CircleHelp },
];

const accountLinks = [
  { href: "/dashboard", label: "لوحتي", icon: LayoutDashboard },
  { href: "/dashboard#courses", label: "موادي", icon: BookOpen },
  { href: "/courses", label: "استكشف المواد", icon: GraduationCap },
  { href: "/cart", label: "السلة", icon: ShoppingBag },
  { href: "/favorites", label: "المفضلة", icon: Heart },
  { href: "/notifications", label: "الإشعارات", icon: Bell },
  { href: "/support", label: "الدعم", icon: LifeBuoy },
  { href: "/dashboard?view=account", label: "حسابي", icon: UserRound },
];

const desktopAccountLinks = accountLinks.filter((link) => ["/dashboard", "/courses", "/support"].includes(link.href));

type HeaderUser = { fullName?: string | null };

export function SiteHeader({ appMode = false, userName = "طالب مراس" }: { appMode?: boolean; userName?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [account, setAccount] = useState<HeaderUser | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { cartSlugs, favoriteSlugs } = useCommerceState();
  const platformControls = usePlatformControls();
  const registrationAvailable = !platformControls.loading && !platformControls.error && platformControls.registration;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { user?: HeaderUser } : null)
      .then((payload) => setAccount(payload?.user || null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  const signedIn = appMode || Boolean(account);
  useEffect(() => { if (signedIn) { resetCommerce(); void ensureCommerceLoaded(); } }, [signedIn]);
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch("/api/mobile/notifications", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { unreadCount?: number; notifications?: Array<{ readAt: string | null }> } : null)
      .then((payload) => { if (!controller.signal.aborted) setUnreadNotifications(typeof payload?.unreadCount === "number" ? payload.unreadCount : payload?.notifications?.filter((item) => !item.readAt).length || 0); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname, signedIn]);

  useRealtimeSync((payload) => {
    const changed = payload.changed || [];
    if (!changed.length || changed.includes("account")) fetch("/api/auth/me", { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { user?: HeaderUser } : null).then((payload) => setAccount(payload?.user || null)).catch(() => undefined);
    if (signedIn && (!changed.length || changed.includes("notifications"))) fetch("/api/mobile/notifications", { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { unreadCount?: number } : null).then((payload) => setUnreadNotifications(payload?.unreadCount || 0)).catch(() => undefined);
    if (signedIn && changed.some((channel) => channel === "account" || channel === "commerce")) { resetCommerce(); void ensureCommerceLoaded(); }
  });

  const displayName = appMode ? userName : account?.fullName || userName;

  async function signOut() {
    setMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    window.location.assign("/");
  }

  const activeLinks = signedIn ? accountLinks : publicLinks;
  const desktopLinks = signedIn ? desktopAccountLinks : publicLinks;
  const isActive = (href: string) => {
    if (href.includes("#")) return false;
    const path = href.split("?")[0];
    return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [menuOpen]);

  return <>
    <header className={`site-header ${signedIn ? "site-header-app" : ""}`}>
      <div className="container header-inner">
        <BrandLogo compact />
        <nav className="desktop-nav" aria-label={signedIn ? "التنقل داخل حساب الطالب" : "التنقل الرئيسي"}>{desktopLinks.map((link) => <Link key={link.href} href={link.href} className={isActive(link.href) ? "active" : ""} aria-current={isActive(link.href) ? "page" : undefined}><link.icon size={15} aria-hidden="true" /><span>{link.label}</span></Link>)}</nav>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label="فتح البحث" title="البحث في مراس"><Search size={19} aria-hidden="true" /></button>
          <ThemeToggle compact />
          {signedIn && <><Link href="/cart" className="icon-button commerce-icon-button" aria-label={`السلة${cartSlugs.length ? `، ${cartSlugs.length} مواد` : ""}`}><ShoppingBag size={19} />{cartSlugs.length > 0 && <i>{cartSlugs.length > 99 ? "99+" : cartSlugs.length}</i>}</Link><Link href="/favorites" className="icon-button commerce-icon-button" aria-label={`المفضلة${favoriteSlugs.length ? `، ${favoriteSlugs.length} مواد` : ""}`}><Heart size={19} fill={favoriteSlugs.length ? "currentColor" : "none"} />{favoriteSlugs.length > 0 && <i>{favoriteSlugs.length > 99 ? "99+" : favoriteSlugs.length}</i>}</Link><Link href="/notifications" className="icon-button notification-button" aria-label="الإشعارات"><Bell size={19} />{unreadNotifications > 0 && <i>{unreadNotifications > 99 ? "99+" : unreadNotifications}</i>}</Link></>}
          {!signedIn ? <><Link href="/login" className="button button-ghost desktop-only">تسجيل الدخول</Link>{registrationAvailable && <Link href="/register" className="button button-primary desktop-only">إنشاء حساب</Link>}</> : <Link href="/dashboard?view=account" className="user-chip" aria-label={`حساب ${displayName}`}><span>{displayName.split(" ")[0]}</span><i>{displayName[0] || <UserRound size={16} />}</i></Link>}
          <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={menuOpen} aria-controls="mobile-site-navigation">{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </div>
      {menuOpen && <><button type="button" className="mobile-nav-backdrop" onClick={() => setMenuOpen(false)} aria-label="إغلاق القائمة" /><nav id="mobile-site-navigation" className={`mobile-nav container ${signedIn ? "mobile-nav-account" : ""}`} aria-label="التنقل على الجوال">
        {signedIn && <div className="mobile-nav-user"><div className="mobile-nav-avatar">{displayName[0] || <UserRound size={17} />}</div><div><strong>{displayName}</strong><small>حساب طالب مراس</small></div><Link href="/dashboard?view=account" onClick={() => setMenuOpen(false)} aria-label="فتح الحساب"><UserRound size={16} /></Link></div>}
        <div className="mobile-nav-links">{activeLinks.map((link) => <Link key={link.href} href={link.href} className={`mobile-nav-link ${isActive(link.href) ? "active" : ""}`} aria-current={isActive(link.href) ? "page" : undefined} onClick={() => setMenuOpen(false)}><span className="mobile-nav-icon"><link.icon size={17} aria-hidden="true" /></span><span>{link.label}</span>{link.href === "/cart" && cartSlugs.length > 0 && <b>{cartSlugs.length > 99 ? "99+" : cartSlugs.length}</b>}{link.href === "/favorites" && favoriteSlugs.length > 0 && <b>{favoriteSlugs.length > 99 ? "99+" : favoriteSlugs.length}</b>}<ChevronLeft size={16} aria-hidden="true" /></Link>)}</div>
        {!signedIn && <div className="mobile-auth"><Link href="/login" className="button button-ghost" onClick={() => setMenuOpen(false)}>تسجيل الدخول</Link>{registrationAvailable && <Link href="/register" className="button button-primary" onClick={() => setMenuOpen(false)}>إنشاء حساب</Link>}</div>}
        {signedIn && <button className="mobile-logout" onClick={signOut}><LogOut size={16} aria-hidden="true" /><span>تسجيل الخروج</span></button>}
      </nav></>}
    </header>
    <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
  </>;
}
