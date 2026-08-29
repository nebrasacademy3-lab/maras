import { getPublicSettings, whatsappHref } from "@/lib/platform-settings";

export async function GET() {
  const settings = await getPublicSettings();
  return Response.json({ ok: true, settings: { ...settings, whatsapp_url: whatsappHref(settings) } }, { headers: { "cache-control": "no-store" } });
}

