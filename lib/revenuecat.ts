import { boundedRequestBody } from "@/lib/request-body";
import { StoreError, parseStorePurchase, type VerifiedStorePurchase } from "@/lib/store-contracts";

export function revenuecatConfig() {
  const key = process.env.REVENUECAT_SECRET_API_KEY?.trim() || "";
  const project = process.env.REVENUECAT_PROJECT_ID?.trim() || "";
  const environment = process.env.REVENUECAT_ENVIRONMENT?.trim().toLowerCase();
  const appIds = (process.env.REVENUECAT_APP_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!key.startsWith("sk_") || !/^proj[a-zA-Z0-9]+$/.test(project) || !["sandbox","production"].includes(environment || "") || !appIds.length)
    throw new StoreError("STORE_NOT_CONFIGURED", "مشتريات التطبيق غير مهيأة حاليًا.", 503);
  return { key, project, environment: environment!, appIds };
}
async function revenuecatGet(path: string) {
  const config = revenuecatConfig();
  if (!path.startsWith("/v2/projects/" + encodeURIComponent(config.project) + "/")) throw new StoreError("STORE_BAD_PROVIDER_PATH", "تعذر مزامنة المتجر.", 502);
  let response: Response;
  try {
    response = await fetch("https://api.revenuecat.com" + path, { headers: { Authorization: "Bearer " + config.key, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  } catch { throw new StoreError("STORE_CONNECTION_FAILED", "تعذر الاتصال بالمتجر. أعد المزامنة لاحقًا.", 503); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new StoreError(response.status === 429 ? "STORE_RATE_LIMITED" : "STORE_VERIFICATION_FAILED", "لم تكتمل مراجعة المتجر. أعد المحاولة لاحقًا.", 503);
  }
  const bounded = boundedRequestBody(new Request("https://local.invalid", {method:"POST",body:response.body,duplex:"half"} as RequestInit), 2*1024*1024);
  const data: unknown = await new Response(bounded).json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new StoreError("STORE_BAD_RESPONSE", "استجابة المتجر غير صالحة.",502);
  return data as Record<string,unknown>;
}
export async function fetchVerifiedPurchases(accountId: string) {
  const config = revenuecatConfig();
  const base = "/v2/projects/" + encodeURIComponent(config.project);
  const customerPath = base + "/customers/" + encodeURIComponent(accountId) + "/purchases";
  const rows: VerifiedStorePurchase[] = [];
  const seen = new Set<string>();
  let cursor = "";
  for (let page=0; page<100; page++) {
    const data = await revenuecatGet(customerPath + "?limit=100&environment=" + config.environment + (cursor ? "&starting_after="+encodeURIComponent(cursor) : ""));
    if (!Array.isArray(data.items)) throw new StoreError("STORE_BAD_RESPONSE","استجابة المتجر غير مكتملة.",502);
    for (const item of data.items) {
      if (!item || typeof item !== "object") throw new StoreError("STORE_BAD_RESPONSE","استجابة المتجر غير مكتملة.",502);
      rows.push(parseStorePurchase(item as Record<string,unknown>,accountId,config.environment));
    }
    if (!data.next_page) return rows.sort((a,b)=>a.purchasedAt.localeCompare(b.purchasedAt) || a.transactionId.localeCompare(b.transactionId));
    const last = data.items.at(-1) as {id?:unknown} | undefined;
    if (typeof last?.id !== "string" || seen.has(last.id)) throw new StoreError("STORE_BAD_PAGINATION","تعذرت متابعة سجل المشتريات.",502);
    cursor = last.id; seen.add(cursor);
  }
  throw new StoreError("STORE_HISTORY_TOO_LARGE","يتطلب سجل المشتريات مراجعة الدعم.",409);
}
export async function fetchProviderProduct(productId: string) {
  const config = revenuecatConfig();
  const product = await revenuecatGet("/v2/projects/"+encodeURIComponent(config.project)+"/products/"+encodeURIComponent(productId));
  if (!config.appIds.includes(String(product.app_id)) || !["one_time","non_consumable","consumable","non_renewing_subscription"].includes(String(product.type)) || typeof product.store_identifier !== "string")
    throw new StoreError("STORE_PRODUCT_UNSUPPORTED","المنتج غير معتمد للشراء اليدوي.",409);
  return product.store_identifier;
}
