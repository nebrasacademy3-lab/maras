"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, Bot, CircleHelp, Gift, GraduationCap, Heart, House, LayoutDashboard, LifeBuoy, LogOut, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-provider";
import { SearchDialog } from "./search-dialog";
import { useRealtimeSync } from "./realtime-sync";
import { ensureCommerceLoaded, resetCommerce, useCommerceState } from "./commerce-state";
import { signOutWeb } from "./web-logout";

type NavLink = { href: string; label: string; icon: typeof House; mobileOnly?: boolean };

const links: NavLink[] = [
  { href: "/", label: "الرئيسية", icon: House },
  { href: "/universities", label: "الجامعات", icon: GraduationCap },
  { href: "/courses", label: "المواد", icon: BookOpen },
  { href: "/how-it-works", label: "كيف تعمل مراس؟", icon: LifeBuoy },
  { href: "/#faq", label: "الأسئلة الشائعة", icon: CircleHelp },
];

type HeaderUser = { fullName?: string | null };

export function SiteHeader({ appMode = false, userName = "طالب مراس" }: { appMode?: boolean; userName?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [account, setAccount] = useState<HeaderUser | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { cartSlugs, favoriteSlugs } = useCommerceState();

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
  useEffect(() => {
    const syncReadState = (event: Event) => {
      const detail = (event as CustomEvent<{ unread?: number }>).detail;
      setUnreadNotifications(Math.max(0, Number(detail?.unread || 0)));
    };
    window.addEventListener("meras:notifications-read", syncReadState);
    return () => window.removeEventListener("meras:notifications-read", syncReadState);
  }, []);

  useRealtimeSync((payload) => {
    const changed = payload.changed || [];
    if (!changed.length || changed.includes("account")) fetch("/api/auth/me", { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { user?: HeaderUser } : null).then((payload) => setAccount(payload?.user || null)).catch(() => undefined);
    if (signedIn && (!changed.length || changed.includes("notifications"))) fetch("/api/mobile/notifications", { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? await response.json() as { unreadCount?: number } : null).then((payload) => setUnreadNotifications(payload?.unreadCount || 0)).catch(() => undefined);
    if (signedIn && changed.some((channel) => channel === "account" || channel === "commerce")) { resetCommerce(); void ensureCommerceLoaded(); }
  });

  const displayName = appMode ? userName : account?.fullName || userName;
  const accountLinks: NavLink[] = [
    { href: "/dashboard", label: "لوحتي", icon: LayoutDashboard },
    { href: "/dashboard#courses", label: "موادي", icon: BookOpen },
    { href: "/courses", label: "استكشف المواد", icon: GraduationCap },
    { href: "/cart", label: "السلة", icon: ShoppingBag },
    { href: "/favorites", label: "المفضلة", icon: Heart },
    { href: "/notifications", label: "الإشعارات", icon: Bell },
    { href: "/support", label: "الدعم", icon: LifeBuoy },
    { href: "/dashboard?view=account", label: "حسابي", icon: UserRound },
    { href: "/meras-ai", label: "مراس AI", icon: Bot, mobileOnly: true },
    { href: "/referrals", label: "الإحالات والهدايا", icon: Gift, mobileOnly: true },
  ];

  function signOut() {
    setMenuOpen(false);
    void signOutWeb("/");
  }

  const activeLinks = signedIn ? accountLinks : links;
  return <>
    <header className={`site-header ${signedIn ? "site-header-app" : ""}`}>
      <div className="container header-inner">
        <BrandLogo compact />
        <nav className="desktop-nav" aria-label={signedIn ? "تنقل حساب الطالب" : "التنقل الرئيسي"}>{activeLinks.filter((link) => !link.mobileOnly).map((link) => <Link key={link.href} href={link.href} className={pathname === link.href.split("?")[0] ? "active" : ""}><link.icon size={15} aria-hidden="true" /><span>{link.label}</span></Link>)}</nav>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label="البحث"><Search size={19} /></button>
          <ThemeToggle compact />
          {signedIn && <><Link href="/cart" className="icon-button commerce-icon-button" aria-label={`السلة${cartSlugs.length ? `، ${cartSlugs.length} مواد` : ""}`}><ShoppingBag size={19} />{cartSlugs.length > 0 && <i>{cartSlugs.length > 99 ? "99+" : cartSlugs.length}</i>}</Link><Link href="/favorites" className="icon-button commerce-icon-button" aria-label={`المفضلة${favoriteSlugs.length ? `، ${favoriteSlugs.length} مواد` : ""}`}><Heart size={19} fill={favoriteSlugs.length ? "currentColor" : "none"} />{favoriteSlugs.length > 0 && <i>{favoriteSlugs.length > 99 ? "99+" : favoriteSlugs.length}</i>}</Link><Link href="/notifications" className="icon-button notification-button" aria-label="الإشعارات"><Bell size={19} />{unreadNotifications > 0 && <i>{unreadNotifications > 99 ? "99+" : unreadNotifications}</i>}</Link></>}
          {!signedIn ? <><Link href="/login" className="button button-ghost desktop-only">تسجيل الدخول</Link><Link href="/register" className="button button-primary desktop-only">إنشاء حساب</Link></> : <details className="account-utilities-menu desktop-only"><summary className="user-chip" aria-label={`قائمة حساب ${displayName}`}><span>{displayName.split(" ")[0]}</span><i>{displayName[0] || <UserRound size={16} />}</i></summary><div role="menu"><Link href="/dashboard?view=account" role="menuitem"><UserRound size={16} />حسابي</Link><Link href="/meras-ai" role="menuitem"><Bot size={16} />مراس AI</Link><Link href="/referrals" role="menuitem"><Gift size={16} />الإحالات والهدايا</Link><button type="button" role="menuitem" onClick={signOut}><LogOut size={16} />تسجيل الخروج</button></div></details>}
          <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label="القائمة" aria-expanded={menuOpen}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </div>
      {menuOpen && <div className={`mobile-nav container ${signedIn ? "mobile-nav-account" : ""}`}>
        {signedIn && <div className="mobile-nav-user"><div className="mobile-nav-avatar">{displayName[0] || <UserRound size={17} />}</div><div><strong>{displayName}</strong><small>حساب طالب مراس</small></div><Link href="/dashboard?view=account" onClick={() => setMenuOpen(false)} aria-label="فتح الحساب"><UserRound size={16} /></Link></div>}
        <div className="mobile-nav-links">{activeLinks.map((link) => <Link key={link.href} href={link.href} className={`mobile-nav-link ${pathname === link.href ? "active" : ""}`} onClick={() => setMenuOpen(false)}><span className="mobile-nav-icon"><link.icon size={17} /></span><span>{link.label}</span>{link.href === "/cart" && cartSlugs.length > 0 && <b>{cartSlugs.length > 99 ? "99+" : cartSlugs.length}</b>}{link.href === "/favorites" && favoriteSlugs.length > 0 && <b>{favoriteSlugs.length > 99 ? "99+" : favoriteSlugs.length}</b>}{link.href === "/notifications" && unreadNotifications > 0 && <b>{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}<i>‹</i></Link>)}</div>
        {!signedIn && <div className="mobile-auth"><Link href="/login" className="button button-ghost" onClick={() => setMenuOpen(false)}>تسجيل الدخول</Link><Link href="/register" className="button button-primary" onClick={() => setMenuOpen(false)}>إنشاء حساب</Link></div>}
        {signedIn && <button className="mobile-logout" onClick={signOut}><LogOut size={16} aria-hidden="true" /><span>تسجيل الخروج</span></button>}
      </div>}
    </header>
    <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
  </>;
}
