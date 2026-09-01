import type { Metadata } from "next";
import { AdminSecurity } from "@/components/admin-security";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "أمان حساب الإدارة | مراس العلم",
  description: "إدارة المصادقة الإضافية وتأكيد العمليات الحساسة.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const user = await requireRole("/admin/security", ["admin", "supervisor"]);
  return <AdminSecurity adminName={user.fullName} backHref={user.role === "supervisor" ? "/supervisor" : "/admin"} />;
}
