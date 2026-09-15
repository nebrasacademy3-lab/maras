import { getInformationContent } from "@/lib/information-content";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(await getInformationContent(), { headers: { "cache-control": "public, max-age=30", "x-content-type-options": "nosniff" } }); }
