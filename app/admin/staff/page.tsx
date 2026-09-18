import { StaffManager } from "@/components/staff-manager";
import { requireRole } from "@/lib/server-auth";
export default async function StaffPage() { await requireRole("/admin/staff", ["admin"]); return <main className="container" dir="rtl" style={{paddingBlock:32}}><StaffManager/></main>; }
