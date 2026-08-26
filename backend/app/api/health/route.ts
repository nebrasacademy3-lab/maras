import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function GET() {
  try {
    await getDb().run(sql`select 1`);
    return Response.json({ ok: true, service: "meras-alelm", database: "ready", time: new Date().toISOString() });
  } catch (error) {
    return Response.json({ ok: false, service: "meras-alelm", database: "unavailable", error: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
