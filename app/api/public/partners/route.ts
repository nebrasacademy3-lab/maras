import { getPublicPartners } from "@/lib/platform-partners";

export const dynamic = "force-dynamic";

const MAX_PUBLIC_PARTNERS = 24;

export async function GET() {
  const partners = (await getPublicPartners()).slice(0, MAX_PUBLIC_PARTNERS);
  return Response.json({ ok: true, partners }, {
    headers: {
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "x-content-type-options": "nosniff",
    },
  });
}
