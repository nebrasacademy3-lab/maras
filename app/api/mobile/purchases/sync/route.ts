import { storeApiUser, storeApiError } from "@/lib/store-api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";
export async function POST(request: Request) {
  try {
    await storeApiUser(request, true);
    return Response.json({ ok: false, code: "STORE_PURCHASES_RETIRED", error: "تم إيقاف الشراء من المتاجر. تبقى مشترياتك السابقة متاحة في حسابك." }, { status: 410, headers: mobileNoStoreHeaders });
  } catch (error) { return storeApiError(error); }
}
