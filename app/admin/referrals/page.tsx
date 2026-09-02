import type { Metadata } from "next";
import { AdminReferralsCenter } from "@/components/admin-referrals-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "إدارة الإحالات والهدايا | مراس العلم",
  description: "مركز إدارة مستويات الإحالة والكوبونات والهدايا المملوكة للمستخدم.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminReferralsPage({ searchParams }: { searchParams: Promise<{ search?: string; tab?: string }> }) {
  const user = await requireRole("/admin/referrals", ["admin"]);
  const params = await searchParams;
  return <AdminReferralsCenter adminName={user.fullName} initialSearch={typeof params.search === "string" ? params.search.slice(0, 120) : ""} initialTab={params.tab} />;
}
