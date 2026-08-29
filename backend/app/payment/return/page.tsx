import type { Metadata } from "next";
import { MobilePaymentReturn } from "@/components/mobile-payment-return";

export const metadata: Metadata = {
  title: "العودة إلى تطبيق مراس",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ channel?: string; order?: string }> };

export default async function PaymentReturnPage({ searchParams }: Props) {
  const query = await searchParams;
  // This value is used only as an opaque navigation hint. Payment/access state
  // is always re-read by the authenticated app and never trusted here.
  const orderNumber = query.channel === "mobile" && typeof query.order === "string" && /^MR-[A-Z0-9-]{6,70}$/i.test(query.order)
    ? query.order.toUpperCase()
    : "";
  return <MobilePaymentReturn orderNumber={orderNumber} />;
}
