"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, Bot, CircleHelp, FileUp, Gift, GraduationCap, Heart, House, LayoutDashboard, LifeBuoy, LogOut, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { SiteNavLink } from "./site-nav-link";
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
  { href: "/faq", label: "الأسئلة الشائعة", icon: CircleHelp },
  { href: "/join-instructors", label: "انضم كشارح", icon: GraduationCap },
];

type HeaderUser = { id?:number; fullName?: string | null; role?: string };

export function SiteHeader({ appMode = false, userName = "طالب مراس", userRole }: { appMode?: boolean; userName?: string; userRole?: string }) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [account, setAccount] = useState<HeaderUser | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { cartSlugs, favoriteSlugs } = useCommerceState();

  const accountRequest=useRef<AbortController|null>(null),notificationRequest=useRef<AbortController|null>(null);
  const pageActive=useRef(true);
  const refreshAccount=useCallback(async()=>{
    if(!pageActive.current)return undefined;
    accountRequest.current?.abort();const controller=new AbortController();accountRequest.current=controller;
    try{const response=await fetch("/api/auth/me",{credentials:"include",cache:"no-store",signal:controller.signal});
      if(!response.ok&&response.status!==401)return;
      const payload=response.ok?await response.json() as {user?:HeaderUser}:null;
      if(!controller.signal.aborted&&pageActive.current&&accountRequest.current===controller){const next=payload?.user||null;setAccount(next);return next;}
    }catch{/* A network interruption is not a successful logout and cannot overwrite a newer account read. */}
  },[]);
  const refreshNotifications=useCallback(async()=>{
    if(!pageActive.current)return;
    notificationRequest.current?.abort();const controller=new AbortController();notificationRequest.current=controller;
    try{const response=await fetch("/api/mobile/notifications",{credentials:"include",cache:"no-store",signal:controller.signal});if(!response.ok)return;
      const payload=await response.json() as {unreadCount?:number;notifications?:{readAt:string|null}[]};
      if(!controller.signal.aborted&&pageActive.current&&notificationRequest.current===controller)setUnreadNotifications(typeof payload.unreadCount==="number"?payload.unreadCount:payload.notifications?.filter(n=>!n.readAt).length||0);
    }catch{/* Keep the last known count until a current response can be verified. */}
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>void refreshAccount(),0);return()=>{clearTimeout(timer);accountRequest.current?.abort();};},[pathname,refreshAccount]);
  const signedIn=appMode||Boolean(account);
  const instructorMode=userRole === "instructor" || account?.role === "instructor" || pathname === "/instructor";
  const staffMode = ["admin", "supervisor"].includes(account?.role || userRole || "");
  const commerceEnabled=signedIn && !instructorMode && !staffMode && account?.role === "student";
  useEffect(()=>{resetCommerce();if(commerceEnabled)void ensureCommerceLoaded();},[commerceEnabled,account?.id,userName]);
  useEffect(()=>{const timer=setTimeout(()=>{if(signedIn)void refreshNotifications();else setUnreadNotifications(0);},0);return()=>{clearTimeout(timer);notificationRequest.current?.abort();};},[pathname,signedIn,account?.id,refreshNotifications]);
  useEffect(()=>{
    pageActive.current=true;
    const pause=()=>{pageActive.current=false;accountRequest.current?.abort();notificationRequest.current?.abort();resetCommerce();};
    const restore=(event:PageTransitionEvent)=>{if(!event.persisted)return;pageActive.current=true;void refreshAccount().then(current=>{if(pageActive.current&&current){if(current.role === "student")void ensureCommerceLoaded();void refreshNotifications();}});};
    window.addEventListener("pagehide",pause);window.addEventListener("pageshow",restore);
    return()=>{pause();window.removeEventListener("pagehide",pause);window.removeEventListener("pageshow",restore);};
  },[refreshAccount,refreshNotifications]);
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
    if (!changed.length || changed.includes("account")) void refreshAccount();
    if (signedIn && (!changed.length || changed.includes("notifications"))) void refreshNotifications();
    if (commerceEnabled && changed.some((channel) => channel === "account" || channel === "commerce")) { resetCommerce(); void ensureCommerceLoaded(); }
  });

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const row = header.querySelector<HTMLElement>(".header-inner");
    const updateHeight = () => document.documentElement.style.setProperty("--site-header-height", String(row?.getBoundingClientRect().height || 76) + "px");
    updateHeight();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateHeight) : null;
    if (row) observer?.observe(row);
    return () => { observer?.disconnect(); document.documentElement.style.removeProperty("--site-header-height"); };
  }, []);

  useEffect(() => {
    const closeMenus = () => {
      setMenuOpen(false);
      headerRef.current?.querySelectorAll("details[open]").forEach((item) => item.removeAttribute("open"));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeMenus(); menuButtonRef.current?.focus(); }
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) closeMenus();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("popstate", closeMenus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("popstate", closeMenus);
    };
  }, []);

  const displayName = appMode ? userName : account?.fullName || userName;
  const accountLinks: NavLink[] = staffMode ? [{ href: "/admin", label: "مساحة الإدارة", icon: LayoutDashboard }, { href: "/admin/security", label: "حسابي وأماني", icon: UserRound }, { href: "/notifications", label: "الإشعارات", icon: Bell }] : instructorMode ? [
    { href: "/instructor", label: "مساحة الشارح", icon: LayoutDashboard },
    { href: "/notifications", label: "الإشعارات", icon: Bell },
    { href: "/support", label: "الدعم", icon: LifeBuoy },
  ] : [
    { href: "/dashboard", label: "لوحتي", icon: LayoutDashboard },
    { href: "/dashboard?view=courses", label: "موادي", icon: BookOpen },
    { href: "/courses", label: "استكشف المواد", icon: GraduationCap },
    { href: "/cart", label: "السلة", icon: ShoppingBag },
    { href: "/favorites", label: "المفضلة", icon: Heart },
    { href: "/notifications", label: "الإشعارات", icon: Bell },
    { href: "/support", label: "الدعم", icon: LifeBuoy },
    { href: "/dashboard?view=account", label: "حسابي", icon: UserRound },
    { href: "/study-tools", label: "أدوات مراس", icon: Bot, mobileOnly: true },
    { href: "/referrals", label: "الإحالات والهدايا", icon: Gift, mobileOnly: true },
    { href: "/request-course", label: "طلب مادة", icon: FileUp, mobileOnly: true },
  ];

  function signOut() {
    setMenuOpen(false);
    void signOutWeb("/");
  }

  const activeLinks = signedIn ? accountLinks : links;
  return <>
    <header data-nosnippet ref={headerRef} className={`site-header ${signedIn ? "site-header-app" : ""}`}>
      <div className="container header-inner">
        <BrandLogo compact />
        <nav className="desktop-nav" aria-label={signedIn ? staffMode ? "تنقل حساب الإدارة" : instructorMode ? "تنقل حساب الشارح" : "تنقل حساب الطالب" : "التنقل الرئيسي"}>{activeLinks.filter((link) => !link.mobileOnly).map((link) => <SiteNavLink key={link.href} href={link.href}><link.icon size={15} aria-hidden="true" /><span>{link.label}</span></SiteNavLink>)}</nav>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label="البحث"><Search size={19} /></button>
          <ThemeToggle compact />
          {signedIn && <>{!instructorMode && !staffMode && <><Link href="/cart" className="icon-button commerce-icon-button" aria-label={`السلة${cartSlugs.length ? `، ${cartSlugs.length} مواد` : ""}`}><ShoppingBag size={19} />{cartSlugs.length > 0 && <i>{cartSlugs.length > 99 ? "99+" : cartSlugs.length}</i>}</Link><Link href="/favorites" className="icon-button commerce-icon-button" aria-label={`المفضلة${favoriteSlugs.length ? `، ${favoriteSlugs.length} مواد` : ""}`}><Heart size={19} fill={favoriteSlugs.length ? "currentColor" : "none"} />{favoriteSlugs.length > 0 && <i>{favoriteSlugs.length > 99 ? "99+" : favoriteSlugs.length}</i>}</Link></>}<Link href="/notifications" className="icon-button notification-button" aria-label="الإشعارات"><Bell size={19} />{unreadNotifications > 0 && <i>{unreadNotifications > 99 ? "99+" : unreadNotifications}</i>}</Link></>}
          {!signedIn ? <><Link href="/login" className="button button-ghost desktop-only">تسجيل الدخول</Link><Link href="/register" className="button button-primary desktop-only">إنشاء حساب</Link></> : <details className="account-utilities-menu desktop-only"><summary className="user-chip" aria-label={`قائمة حساب ${displayName}`}><span>{displayName.split(" ")[0]}</span><i>{displayName[0] || <UserRound size={16} />}</i></summary><div onClick={() => headerRef.current?.querySelectorAll("details[open]").forEach((item) => item.removeAttribute("open"))}><Link href={staffMode ? "/admin/security" : instructorMode ? "/instructor" : "/dashboard?view=account"}><UserRound size={16} />حسابي</Link>{!instructorMode && !staffMode && <><Link href="/study-tools"><Bot size={16} />أدوات مراس</Link><Link href="/referrals"><Gift size={16} />الإحالات والهدايا</Link></>}<button type="button" onClick={signOut}><LogOut size={16} />تسجيل الخروج</button></div></details>}
          <button ref={menuButtonRef} type="button" aria-controls="site-mobile-navigation" className="icon-button mobile-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label="القائمة" aria-expanded={menuOpen}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
      </div>
      {menuOpen && <nav id="site-mobile-navigation" aria-label="قائمة التنقل" className={`mobile-nav container ${signedIn ? "mobile-nav-account" : ""}`}>
        {signedIn && <div className="mobile-nav-user"><div className="mobile-nav-avatar">{displayName[0] || <UserRound size={17} />}</div><div><strong>{displayName}</strong><small>{staffMode ? "إدارة مراس" : instructorMode ? "حساب شارح مراس" : "حساب طالب مراس"}</small></div><Link href={staffMode ? "/admin/security" : instructorMode ? "/instructor" : "/dashboard?view=account"} onClick={() => setMenuOpen(false)} aria-label="فتح الحساب"><UserRound size={16} /></Link></div>}
        <div className="mobile-nav-links">{activeLinks.map((link) => <SiteNavLink key={link.href} href={link.href} className="mobile-nav-link" onClick={() => setMenuOpen(false)}><span className="mobile-nav-icon"><link.icon size={17} /></span><span>{link.label}</span>{link.href === "/cart" && cartSlugs.length > 0 && <b>{cartSlugs.length > 99 ? "99+" : cartSlugs.length}</b>}{link.href === "/favorites" && favoriteSlugs.length > 0 && <b>{favoriteSlugs.length > 99 ? "99+" : favoriteSlugs.length}</b>}{link.href === "/notifications" && unreadNotifications > 0 && <b>{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}<i>‹</i></SiteNavLink>)}</div>
        {!signedIn && <div className="mobile-auth"><Link href="/login" className="button button-ghost" onClick={() => setMenuOpen(false)}>تسجيل الدخول</Link><Link href="/register" className="button button-primary" onClick={() => setMenuOpen(false)}>إنشاء حساب</Link></div>}
        {signedIn && <button className="mobile-logout" onClick={signOut}><LogOut size={16} aria-hidden="true" /><span>تسجيل الخروج</span></button>}
      </nav>}
    </header>
    <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
  </>;
}
