import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { AdminInstructors } from "@/components/admin-instructors";
export const dynamic = "force-dynamic";
export default async function InstructorsAdminPage() { const user = await requireRole("/admin/instructors", ["admin"]); if (!user.isPlatformOwner) redirect("/admin"); return <AdminInstructors />; }
