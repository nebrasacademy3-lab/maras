import { getPublicPaymentAvailability, getPublicSettings, whatsappHref } from "@/lib/platform-settings";
import { normalizedSocialLinks } from "@/lib/social-links";

export async function GET() {
  const settings = await getPublicSettings();
  return Response.json({ ok: true, settings: { ...settings, ...getPublicPaymentAvailability(), whatsapp_url: whatsappHref(settings), social_links: normalizedSocialLinks(settings) } }, { headers: { "cache-control": "no-store" } });
}
