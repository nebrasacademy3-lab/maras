"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bot, CircleDollarSign, FileStack, Gift, Handshake, LayoutDashboard, LockKeyhole, PackageOpen, Route, type LucideIcon } from "lucide-react";
import styles from "./admin-center-nav.module.css";

export const ADMIN_CENTERS: ReadonlyArray<{ href: string; label: string; icon: LucideIcon; description: string }> = [
  { href: "/admin", label: "لوحة الإدارة", icon: LayoutDashboard, description: "الكتالوج والطلاب والطلبات والدعم" },
  { href: "/admin/finance", label: "المركز المالي", icon: CircleDollarSign, description: "الإيراد والاستردادات والتسويات" },
  { href: "/admin/operations", label: "التشغيل والتحليلات", icon: Activity, description: "الطوابير والأتمتة والامتثال" },
  { href: "/admin/bundles", label: "الباقات والعروض", icon: PackageOpen, description: "عروض مركبة بتسعير محكوم" },
  { href: "/admin/learning-tracks", label: "المسارات القادمة", icon: Route, description: "خارطة المحتوى وتسجيل الاهتمام" },
  { href: "/admin/course-resources", label: "ملفات المواد", icon: FileStack, description: "ملفات الطلاب ونطاق ظهور المواد" },
  { href: "/admin/referrals", label: "الإحالات والهدايا", icon: Gift, description: "المستويات والكوبونات والمراجعة" },
  { href: "/admin/partners", label: "الشركاء والاعتمادات", icon: Handshake, description: "الشعارات والموافقات وحالة النشر" },
  { href: "/admin/ai", label: "أدوات مراس", icon: Bot, description: "المفاتيح والخدمات والاشتراكات" },
  { href: "/admin/security", label: "أمان الحساب", icon: LockKeyhole, description: "المصادقة الإضافية والتحقق الإداري" },
];

export function AdminCenterNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname() || "";
  return <nav className={`${styles.nav} ${compact ? styles.compact : ""}`} aria-label="مراكز الإدارة">
    {ADMIN_CENTERS.map((center) => {
      const Icon = center.icon;
      const active = center.href === "/admin" ? pathname === "/admin" : pathname.startsWith(center.href);
      return <Link key={center.href} href={center.href} className={active ? styles.active : ""} aria-current={active ? "page" : undefined}><Icon size={15} /><span>{center.label}</span></Link>;
    })}
  </nav>;
}
