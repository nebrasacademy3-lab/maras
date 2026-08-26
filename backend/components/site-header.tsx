"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search, UserRound, X } from "lucide-react";
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

export function SiteHeader({ appMode = false, userName = "طالب مراس" }: { appMode?: boolean; userName?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <>
      <header className={`site-header ${appMode ? "site-header-app" : ""}`}>
        <div className="container header-inner">
          <BrandLogo compact />
          {!appMode && (
            <nav className="desktop-nav" aria-label="التنقل الرئيسي">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>{link.label}</Link>
              ))}
            </nav>
          )}
          {appMode && (
            <nav className="desktop-nav" aria-label="تنقل حساب الطالب">
              <Link href="/dashboard" className={pathname === "/dashboard" ? "active" : ""}>لوحتي</Link>
              <Link href="/dashboard#courses">موادي</Link>
              <Link href="/courses">استكشف</Link>
              <Link href="/support">الدعم</Link>
            </nav>
          )}
          <div className="header-actions">
            <button className="icon-button" onClick={() => setSearchOpen(true)} aria-label="البحث"><Search size={19} /></button>
            <ThemeToggle compact />
            {appMode && <Link href="/notifications" className="icon-button notification-button" aria-label="الإشعارات"><Bell size={19} /><i>3</i></Link>}
            {!appMode ? (
              <>
                <Link href="/login" className="button button-ghost desktop-only">تسجيل الدخول</Link>
                <Link href="/register" className="button button-primary desktop-only">إنشاء حساب</Link>
              </>
            ) : (
              <Link href="/dashboard?view=account" className="user-chip"><span>{userName.split(" ")[0]}</span><i>{userName[0] || <UserRound size={16} />}</i></Link>
            )}
            <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="القائمة">
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-nav container">
            {(appMode ? [
              { href: "/dashboard", label: "لوحتي" },
              { href: "/dashboard#courses", label: "موادي" },
              { href: "/courses", label: "استكشف المواد" },
              { href: "/support", label: "الدعم" },
            ] : links).map((link) => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>)}
            {!appMode && <div className="mobile-auth"><Link href="/login" className="button button-ghost">تسجيل الدخول</Link><Link href="/register" className="button button-primary">إنشاء حساب</Link></div>}
          </div>
        )}
      </header>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
