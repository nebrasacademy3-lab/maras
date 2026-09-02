import type { Metadata } from "next";
import { ReferralsCenter } from "@/components/referrals-center";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "الإحالات والهدايا | مراس العلم",
  description: "شارك رابطك الخاص، تابع إحالاتك، واستلم كوبوناتك وهداياك المخصصة لحسابك.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ reward?: string }> }) {
  await requireUser("/referrals");
  const rewardId = Math.floor(Number((await searchParams).reward)) || 0;
  return <><SiteHeader /><ReferralsCenter highlightRewardId={rewardId > 0 ? rewardId : 0} /><SiteFooter /></>;
}
