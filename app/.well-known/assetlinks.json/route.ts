import { androidAssociations } from "@/lib/mobile-associations";
export const dynamic = "force-dynamic";
export function GET() {
  const data = androidAssociations(process.env.ANDROID_APP_SIGNING_SHA256);
  return Response.json(data || { error: "App signing fingerprints have not been configured." }, { status: data ? 200 : 503, headers: { "cache-control": data ? "public, max-age=300" : "no-store", "x-content-type-options": "nosniff" } });
}
