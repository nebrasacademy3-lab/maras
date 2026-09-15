import { StaffManager } from "@/components/staff-manager";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { requireRole } from "@/lib/server-auth";
export default async function StaffPage() { await requireRole("/admin/staff", ["admin"]); return <main className="container" dir="rtl" style={{paddingBlock:32}}><AdminCenterNav/><StaffManager/></main>; }
