import type { Metadata } from "next";
import { AdminBundlesCenter } from "@/components/admin-bundles-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "إدارة الباقات والعروض | إدارة مراس",
  description: "إنشاء باقات المواد وجدولتها وتسعيرها وإدارتها من مركز واحد.",
  robots: { index:false, follow:false },
};

export const dynamic = "force-dynamic";

export default async function AdminBundlesPage() {
  const user = await requireRole("/admin/bundles", ["admin"]);
  return <AdminBundlesCenter adminName={user.fullName}/>;
}
