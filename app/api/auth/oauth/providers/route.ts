import { availableOAuthProviders } from "@/lib/oauth-provider";
export const runtime = "nodejs";
export async function GET() {
  try { return Response.json(availableOAuthProviders(), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ google: false, apple: false }, { headers: { "cache-control": "no-store" } }); }
}
