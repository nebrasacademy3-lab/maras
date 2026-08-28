import { getMutationPublicSettings, whatsappHref } from "@/lib/platform-settings";
import { jsonError } from "@/lib/api";

export async function GET() {
  let settings;
  try { settings = await getMutationPublicSettings(); }
  catch { return jsonError("تعذر التحقق من حالة خدمات المنصة الآن", 503); }
  return Response.json({ ok: true, settings: { ...settings, whatsapp_url: whatsappHref(settings) } }, { headers: { "cache-control": "no-store" } });
}
