import type { Metadata } from "next";
import { AdminFileScans } from "@/components/admin-file-scans";
import { requireRole } from "@/lib/server-auth";
export const metadata: Metadata = { title: "فحص المرفقات | إدارة مراس", robots: { index: false, follow: false } };
export default async function Page() {
  await requireRole("/admin/files", ["admin"]);
  return <AdminFileScans />;
}
