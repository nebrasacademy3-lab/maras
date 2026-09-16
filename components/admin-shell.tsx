"use client";
import Link from "next/link";
import {usePathname, useSearchParams, useRouter} from "next/navigation";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {ChevronDown, ChevronLeft, Menu, Search, ShieldCheck, X, LogOut} from "lucide-react";
import {ADMIN_SELF_SECURITY, activeAdminDestination, visibleAdminNavigation, searchAdminNavigation} from "@/lib/admin-navigation";
import {useAdminAccess} from "@/components/admin-access";
import {BrandLockup} from "@/components/brand-logo";
import {ThemeToggle} from "@/components/theme-provider";
import {signOutWeb} from "@/components/web-logout";
import styles from "./admin-shell.module.css";

export function AdminShell({children,name}:{children:ReactNode;name:string}) {
  const {permissions,owner}=useAdminAccess(), pathname=usePathname() || "/admin",params=useSearchParams(),router=useRouter();
  const view=params.get("view"),active=activeAdminDestination(pathname,view),groups=visibleAdminNavigation(permissions,owner);
  const [query,setQuery]=useState(""),[mobileOpen,setMobileOpen]=useState(false),[collapsed,setCollapsed]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const el=dialog.current;if(!el)return;if(mobileOpen&&!el.open)el.showModal();else if(!mobileOpen&&el.open)el.close();},[mobileOpen]);
  useEffect(()=>{const timer=setTimeout(()=>setMobileOpen(false),0);return()=>clearTimeout(timer);},[pathname,view]);
  const nav=<><label className={styles.search}><Search size={17} aria-hidden/><input aria-label="البحث في أقسام الإدارة المسموحة" placeholder="ابحث عن قسم أو مهمة…" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/></label><nav aria-label="أقسام الإدارة الموحدة" className={styles.nav}>{query.trim()?searchAdminNavigation(groups,query).map(item=><Link key={item.id} href={item.href} onClick={()=>setMobileOpen(false)}><span>{item.title}<small>{item.groupTitle}</small></span><ChevronLeft size={15}/></Link>):groups.map(group=><details className={styles.group} key={`${group.id}:${active?.group?.id===group.id}`} open={active?.group?.id===group.id||group.id==="home"}><summary>{group.title}<ChevronDown size={15}/></summary>{group.items.map(item=><Link key={item.id} href={item.href} aria-current={active?.item.id===item.id?"page":undefined} onClick={()=>setMobileOpen(false)}><span>{item.title}</span><ChevronLeft size={14}/></Link>)}</details>)}{query.trim()&&!searchAdminNavigation(groups,query).length&&<p className={styles.empty}>لا توجد مهمة مطابقة ضمن صلاحياتك.</p>}</nav><div className={styles.footer}><Link href={ADMIN_SELF_SECURITY.href} onClick={()=>setMobileOpen(false)}><ShieldCheck size={18}/>{ADMIN_SELF_SECURITY.title}</Link><button onClick={()=>void signOutWeb("/")}><LogOut size={16}/>تسجيل الخروج</button></div></>;
  return <div className={`${styles.shell} ${collapsed?styles.collapsed:""}`} dir="rtl"><aside className={styles.sidebar}><Link className={styles.brand} href="/admin" aria-label="مراس العلم — الرئيسية الإدارية"><BrandLockup compact/><span>إدارة واحدة. عمل أوضح.</span></Link>{nav}</aside><div className={styles.workspace}><header className={styles.header}><div className={styles.title}><button ref={trigger} className={styles.mobileTrigger} onClick={()=>setMobileOpen(true)} aria-label="فتح أقسام الإدارة" aria-expanded={mobileOpen}><Menu size={21}/></button><button className={styles.desktopTrigger} aria-label={collapsed?"إظهار القائمة":"طي القائمة"} onClick={()=>setCollapsed(!collapsed)}><Menu size={20}/></button><div><small>{active?.group?.title||"مساحة الإدارة"}</small><strong>{active?.item.title||"تفاصيل السجل"}</strong></div></div><div className={styles.tools}><ThemeToggle compact/><button onClick={()=>router.refresh()} aria-label="تحديث بيانات الإدارة">تحديث</button><span className={styles.identity}>{name}<small>{owner?"المدير الأعلى":"مشرف بصلاحيات محددة"}</small></span></div></header><div className={styles.body}>{children}</div></div><dialog ref={dialog} className={styles.dialog} aria-label="أقسام الإدارة" onCancel={()=>setMobileOpen(false)} onClose={()=>{setMobileOpen(false);trigger.current?.focus();}}><header><strong>إدارة مراس</strong><button aria-label="إغلاق القائمة" onClick={()=>setMobileOpen(false)}><X size={23}/></button></header>{nav}</dialog></div>;
}
