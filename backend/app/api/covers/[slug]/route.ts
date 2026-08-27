import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCourses } from "@/db/schema";
import { getObject } from "@/lib/storage";
import { jsonError } from "@/lib/api";

function contentTypeFor(key: string) {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(slug)) return jsonError("الغلاف غير صالح", 400);
  const db = getDb();
  const [course] = await db.select({ coverImageUrl: catalogCourses.coverImageUrl }).from(catalogCourses).where(eq(catalogCourses.slug, slug)).limit(1);
  if (!course?.coverImageUrl?.startsWith("r2:")) return jsonError("الغلاف غير موجود", 404);
  const object = await getObject(course.coverImageUrl.slice(3));
  if (!object) return jsonError("الغلاف غير موجود في التخزين", 404);
  return new Response(object.body, { headers: { "content-type": contentTypeFor(course.coverImageUrl), "cache-control": "public, max-age=3600, stale-while-revalidate=86400", "x-content-type-options": "nosniff" } });
}
