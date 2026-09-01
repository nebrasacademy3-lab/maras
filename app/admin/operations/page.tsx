import type { Metadata } from "next";
import { AdminOperationsCenter } from "@/components/admin-operations-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = { title: "مركز التشغيل والتحليلات | إدارة مراس", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const user = await requireRole("/admin/operations", ["admin"]);
  return <AdminOperationsCenter adminName={user.fullName} />;
}
