import type { Metadata } from "next";
import { AdminAiCenter } from "@/components/admin-ai-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = { title: "إدارة مراس AI | إدارة مراس", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const user = await requireRole("/admin/ai", ["admin"]);
  return <AdminAiCenter adminName={user.fullName}/>;
}
