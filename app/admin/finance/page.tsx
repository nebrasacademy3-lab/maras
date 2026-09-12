import type { Metadata } from "next";
import { FinanceCenter } from "@/components/finance-center";
import { requireRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "المركز المالي | إدارة مراس",
  description: "المبيعات والاستردادات والفواتير ومراجعة عمليات الدفع في مراس.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const user = await requireRole("/admin/finance", ["admin"]);
  const query = await searchParams;
  return <FinanceCenter adminName={user.fullName} initialSearch={typeof query.search === "string" ? query.search.slice(0, 160) : ""} />;
}
