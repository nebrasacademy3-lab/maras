import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function GET() {
  const headers = { "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff" };
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, service: "meras-alelm", database: "ready", time: new Date().toISOString() }, { headers });
  } catch {
    return Response.json({ ok: false, service: "meras-alelm", database: "unavailable" }, { status: 503, headers });
  }
}
