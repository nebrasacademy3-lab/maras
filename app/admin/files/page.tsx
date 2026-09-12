import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { AdminFileSecurity } from "@/components/admin-file-security";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "أمان المرفقات | إدارة مراس", robots: { index: false, follow: false } };
export default async function AdminFilesPage() { await requireRole("/admin/files", ["admin"]); return <AdminFileSecurity />; }
