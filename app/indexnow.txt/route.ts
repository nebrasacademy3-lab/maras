import { indexNowConfig } from "@/lib/seo-indexnow";
export const dynamic = "force-dynamic";
export function GET() {
  const config = indexNowConfig();
  return new Response(config.enabled ? config.key : "Not found", { status: config.enabled ? 200 : 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
