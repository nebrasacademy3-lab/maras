// Retired integration: never accept events or mutate historical student entitlements.
export async function POST() {
  return Response.json({ ok: false, code: "STORE_PURCHASES_RETIRED", error: "تم إيقاف تكامل مشتريات المتاجر." }, { status: 410, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
