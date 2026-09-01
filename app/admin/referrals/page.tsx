import type { Metadata } from "next";
import { AdminReferralsCenter } from "@/components/admin-referrals-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "إدارة الإحالات والهدايا | مراس العلم",
  description: "مركز إدارة مستويات الإحالة والكوبونات والهدايا المملوكة للمستخدم.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminReferralsPage() {
  const user = await requireRole("/admin/referrals", ["admin"]);
  return <AdminReferralsCenter adminName={user.fullName} />;
}
