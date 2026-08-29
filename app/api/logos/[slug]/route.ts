import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogInstitutions } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { getObject } from "@/lib/storage";

function imageTypeForKey(key: string) {
  const extension = key.split(".").pop()?.toLowerCase();
  return extension === "webp" ? "image/webp" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : "image/png";
}

export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const slug = cleanText((await context.params).slug, 80).toLowerCase();
  const [row] = await getDb().select({ logoUrl: catalogInstitutions.logoUrl }).from(catalogInstitutions).where(eq(catalogInstitutions.slug, slug)).limit(1);
  if (!row?.logoUrl?.startsWith("r2:")) return jsonError("الشعار غير موجود", 404);
  const object = await getObject(row.logoUrl.slice(3));
  if (!object) return jsonError("الشعار غير موجود", 404);
  const headers = new Headers({ "content-type": imageTypeForKey(row.logoUrl.slice(3)), "cache-control": "public, max-age=86400, stale-while-revalidate=604800", "x-content-type-options": "nosniff" });
  if (object.size) headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}
