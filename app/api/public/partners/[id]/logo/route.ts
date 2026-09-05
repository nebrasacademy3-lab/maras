import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformPartners } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser, roleAllowed } from "@/lib/auth";
import { getObject } from "@/lib/storage";

function isHttps(value: string | null) {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Math.floor(Number((await params).id));
  if (!id) return jsonError("الشعار غير موجود", 404);
  const [partner] = await getDb().select().from(platformPartners).where(eq(platformPartners.id, id)).limit(1);
  const manager = roleAllowed(await getSessionUser(request), ["admin"]);
  if (!partner?.logoObjectKey || (!manager && (partner.status !== "published" || !partner.rightsConfirmed))) return jsonError("الشعار غير موجود", 404);
  if (!manager && partner.kind === "accreditation" && (!partner.credentialNumber?.trim() || !partner.rightsReference?.trim() || !isHttps(partner.verificationUrl))) return jsonError("الشعار غير موجود", 404);
  const object = await getObject(partner.logoObjectKey);
  if (!object) return jsonError("الشعار غير موجود", 404);
  return new Response(object.body, { headers: {
    "content-type": partner.logoContentType || object.contentType || "application/octet-stream",
    "cache-control": manager ? "private, no-store" : "public, max-age=86400, stale-while-revalidate=604800",
    "x-content-type-options": "nosniff",
  } });
}
