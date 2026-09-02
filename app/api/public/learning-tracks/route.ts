import { getPublicLearningTracks } from "@/lib/learning-tracks";

export const dynamic = "force-dynamic";

export async function GET() {
  const tracks = await getPublicLearningTracks();
  return Response.json({ ok: true, tracks }, {
    headers: {
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      "x-content-type-options": "nosniff",
    },
  });
}
