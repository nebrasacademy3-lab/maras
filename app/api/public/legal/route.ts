import { publishedLegalDocument } from "@/components/published-legal-content";
import { getPublicSettings } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getPublicSettings();
  return Response.json({
    policies: [publishedLegalDocument("privacy", settings), publishedLegalDocument("terms", settings)],
    operator: {
      name: settings.legal_name.trim() || "مراس العلم",
      registration: settings.commercial_registration_number.trim(),
      address: settings.legal_address.trim(),
      supportEmail: settings.support_email.trim(),
    },
  }, { headers: { "cache-control": "public, max-age=60", "x-content-type-options": "nosniff" } });
}
