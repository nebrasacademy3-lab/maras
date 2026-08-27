"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Heart, LogOut, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-provider";
import { SearchDialog } from "./search-dialog";

const links = [
  { href: "/", label: "الرئيسية" },
  { href: "/universities", label: "الجامعات" },
  { href: "/courses", label: "المواد" },
  { href: "/how-it-works", label: "كيف تعمل مراس؟" },
  { href: "/#faq", label: "الأسئلة الشائعة" },
];

type HeaderUser = { fullName?: string | null };

export function SiteHeader({ appMode = false, userName = "طالب مراس" }: { appMode?: boolean; userName?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [account, setAccount] = useState<HeaderUser | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { user?: HeaderUser } : null)
      .then((payload) => setAccount(payload?.user || null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  const signedIn = appMode || Boolean(account);
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch("/api/mobile/notifications", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { unreadCount?: number; notifications?: Array<{ readAt: string | null }> } : null)
      .then((payload) => { if (!controller.signal.aborted) setUnreadNotifications(typeof payload?.unreadCount === "number" ? payload.unreadCount : payload?.notifications?.filter((item) => !item.readAt).length || 0); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname, signedIn]);
  const displayName = appMode ? userName : account?.fullName || userName;
  const accountLinks = [
    { href: "/dashboard", label: "لوحتي" },
    { href: "/dashboard#courses", label: "موادي" },
    { href: "/courses", label: "استكشف المواد" },
    { href: "/cart", label: "السلة" },
    { href: "/favorites", label: "المفضلة" },
    { href: "/support", label: "الدعم" },
    { href: "/dashboard?view=account", label: "حسابي" },
  ];

  async function signOut() {
    setMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    window.location.assign("/");
  }

  return (
    <>
      <header className={`site-header ${signedIn ? "site-header-app" : ""}`}>
        <div className="container header-inner">
          <Link href="/" aria-label="الرئيسية"><BrandLogo compact /></Link>
          {!signedIn && <nav className="desktop-nav" aria-label="التنقل الرئيسي">{links.map((link) => <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>{link.label}</Link>)}</nav>}
          {signedIn && <nav className="desktop-nav" aria-label="تنقل حساب الطالب">{accountLinks.map((link) => <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>{link.label}</Link>)}</nav>}
          <div className="header-actions">
            <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label="البحث"><Search size={19} /></button>
            <ThemeToggle compact />
            {signedIn && <><Link href="/cart" className="icon-button" aria-label="السلة"><ShoppingBag size={19} /></Link><Link href="/favorites" className="icon-button" aria-label="المفضلة"><Heart size={19} /></Link><Link href="/notifications" className="icon-button notification-button" aria-label="الإشعارات"><Bell size={19} />{unreadNotifications > 0 && <i>{unreadNotifications > 99 ? "99+" : unreadNotifications}</i>}</Link></>}
            {!signedIn ? <><Link href="/login" className="button button-ghost desktop-only">تسجيل الدخول</Link><Link href="/register" className="button button-primary desktop-only">إنشاء حساب</Link></> : <Link href="/dashboard?view=account" className="user-chip"><span>{displayName.split(" ")[0]}</span><i>{displayName[0] || <UserRound size={16} />}</i></Link>}
            <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label="القائمة" aria-expanded={menuOpen}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
          </div>
        </div>
        {menuOpen && <div className="mobile-nav container">
          {(signedIn ? accountLinks : links).map((link) => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>)}
          {!signedIn && <div className="mobile-auth"><Link href="/login" className="button button-ghost">تسجيل الدخول</Link><Link href="/register" className="button button-primary">إنشاء حساب</Link></div>}
          {signedIn && <button className="mobile-logout" onClick={signOut}><LogOut size={16} /> تسجيل الخروج</button>}
        </div>}
      </header>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
