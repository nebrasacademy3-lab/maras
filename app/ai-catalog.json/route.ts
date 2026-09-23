import { MERAS_PUBLIC_IDENTITY, searchIndexingEnabled, seoUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Discovery metadata only. No public MCP/A2A execution service is advertised. */
export function GET() {
  if (!searchIndexingEnabled()) {
    return Response.json({ error: "Public discovery is disabled." }, {
      status: 404,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" },
    });
  }
  return Response.json({
    specVersion: "1.0",
    host: {
      displayName: MERAS_PUBLIC_IDENTITY.name,
      documentationUrl: seoUrl("/about"),
      logoUrl: seoUrl("/brand/mark-official.png"),
    },
    // Private study tools require the user's account and are not public agent artifacts.
    entries: [],
  }, { headers: {
    "content-type": "application/ai-catalog+json; charset=utf-8",
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
    link: '</.well-known/ard.json>; rel="ard", </ai-catalog.json>; rel="ai-catalog"',
  } });
}
