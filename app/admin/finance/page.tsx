import type { Metadata } from "next";
import { FinanceCenter } from "@/components/finance-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "المركز المالي | إدارة مراس",
  description: "المبيعات والاستردادات والفواتير ومراجعة عمليات الدفع في مراس.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await requireRole("/admin/finance", ["admin"]);
  return <FinanceCenter adminName={user.fullName} />;
}
