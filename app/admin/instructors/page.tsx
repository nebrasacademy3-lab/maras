import { requireRole } from "@/lib/server-auth";
import { AdminInstructors } from "@/components/admin-instructors";
export const dynamic = "force-dynamic";
export default async function InstructorsAdminPage() { await requireRole("/admin/instructors", ["admin", "supervisor"]); return <AdminInstructors />; }
