import { appleAssociation } from "@/lib/mobile-associations";
export const dynamic = "force-dynamic";
export function GET() {
  const data = appleAssociation(process.env.APPLE_TEAM_ID);
  return Response.json(data || { error: "Apple team identifier has not been configured." }, { status: data ? 200 : 503, headers: { "cache-control": data ? "public, max-age=300" : "no-store", "x-content-type-options": "nosniff" } });
}
