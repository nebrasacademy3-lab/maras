import { appleAssociation } from "@/lib/app-associations";
export const dynamic = "force-dynamic";
export function GET() {
  const association = appleAssociation(process.env.APPLE_APP_ID_PREFIX || process.env.APPLE_TEAM_ID);
  if (!association) return Response.json({ error: "app_association_not_configured" }, { status: 404, headers: { "cache-control": "no-store" } });
  return Response.json(association, { headers: { "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
}
