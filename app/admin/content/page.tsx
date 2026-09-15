import { PublicContentEditor } from "@/components/public-content-editor";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { requireRole } from "@/lib/server-auth";
export default async function PublicContentAdmin() { await requireRole("/admin/content", ["admin", "supervisor"]); return <main className="container" dir="rtl" style={{paddingBlock:32}}><AdminCenterNav/><PublicContentEditor/></main>; }
