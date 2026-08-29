export async function GET() {
  return Response.json(
    { ok: true, service: "meras-alelm", runtime: "online", time: new Date().toISOString() },
    { headers: { "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff" } },
  );
}
