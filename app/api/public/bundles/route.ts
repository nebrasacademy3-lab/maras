import { jsonError } from "@/lib/api";
import { listActiveCourseBundles } from "@/lib/course-bundles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bundles = await listActiveCourseBundles();
    return Response.json({ ok: true, bundles }, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return jsonError("تعذر تحميل عروض الباقات حاليًا", 503);
  }
}
