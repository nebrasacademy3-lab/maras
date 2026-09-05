import type { Metadata } from "next";
import { AdminPartnersCenter } from "@/components/admin-partners-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "الشركاء والاعتمادات | إدارة مراس العلم",
  description: "إدارة شعارات الشركاء وسجلات الاعتماد والموافقات المرتبطة بالنشر.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPartnersPage() {
  const user = await requireRole("/admin/partners", ["admin"]);
  return <AdminPartnersCenter adminName={user.fullName} />;
}
