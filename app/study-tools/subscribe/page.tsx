import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AiSubscriptionCheckout } from "@/components/ai-subscription-checkout";
import { getAiEntitlement, getAiMonthlyPrice } from "@/lib/ai-platform";
import { requirePurchaser } from "@/lib/server-auth";
export const metadata: Metadata = { title: "اشتراك أدوات مراس", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function StudyToolsSubscribePage({ searchParams }: { searchParams: Promise<{ payment?: string; order?: string }> }) {
  const user = await requirePurchaser("/study-tools/subscribe");
  const [price, entitlement, query] = await Promise.all([getAiMonthlyPrice(), getAiEntitlement(user), searchParams]);
  return <main><SiteHeader appMode userName={user.fullName}/><AiSubscriptionCheckout price={price} entitlement={entitlement} returnOrder={query.payment === "return" ? query.order || "" : ""}/></main>;
}
