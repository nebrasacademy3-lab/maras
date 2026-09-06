import { androidAssociation } from "@/lib/app-associations";
export const dynamic = "force-dynamic";
export function GET() {
  const association = androidAssociation(process.env.ANDROID_SHA256_FINGERPRINTS);
  if (!association) return Response.json({ error: "app_association_not_configured" }, { status: 404, headers: { "cache-control": "no-store" } });
  return Response.json(association, { headers: { "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
}
