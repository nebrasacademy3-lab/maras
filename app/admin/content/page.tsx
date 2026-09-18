import { PublicContentEditor } from "@/components/public-content-editor";
import { requireRole } from "@/lib/server-auth";
export default async function PublicContentAdmin() { await requireRole("/admin/content", ["admin", "supervisor"]); return <main className="container" dir="rtl" style={{paddingBlock:32}}><PublicContentEditor/></main>; }
