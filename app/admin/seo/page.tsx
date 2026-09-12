import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { AdminSeoCenter } from "@/components/admin-seo-center";
export const metadata: Metadata = { title: "الظهور في البحث والذكاء الاصطناعي", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminSeoPage() {
  const user = await requireRole("/admin/seo", ["admin"]);
  return <AdminSeoCenter adminName={user.fullName} />;
}
