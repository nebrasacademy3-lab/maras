import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AiSubscriptionCheckout } from "@/components/ai-subscription-checkout";
import { getAiEntitlement, getAiMonthlyPrice } from "@/lib/ai-platform";
import { requireUser } from "@/lib/server-auth";

export const metadata: Metadata = { title: "اشتراك مراس AI", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AiSubscribePage({ searchParams }: { searchParams: Promise<{ payment?: string; order?: string }> }) {
  const user = await requireUser("/meras-ai/subscribe");
  const [price, entitlement, query] = await Promise.all([getAiMonthlyPrice(), getAiEntitlement(user), searchParams]);
  return <main><SiteHeader appMode userName={user.fullName}/><AiSubscriptionCheckout price={price} entitlement={entitlement} returnOrder={query.payment === "return" ? query.order || "" : ""}/></main>;
}
