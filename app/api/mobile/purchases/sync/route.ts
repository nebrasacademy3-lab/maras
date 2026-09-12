import { syncStorePurchases } from "@/lib/store-purchases";
import { storeApiUser,storeApiError } from "@/lib/store-api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";
export async function POST(request:Request){try{const user=await storeApiUser(request,true);return Response.json({ok:true,...await syncStorePurchases(user)},{headers:mobileNoStoreHeaders});}catch(e){return storeApiError(e);}}