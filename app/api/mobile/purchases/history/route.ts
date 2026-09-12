import { storeHistory } from "@/lib/store-purchases";
import { storeApiUser,storeApiError } from "@/lib/store-api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";
export async function GET(request:Request){try{const user=await storeApiUser(request);const page=Math.max(1,Math.min(100000,Number.parseInt(new URL(request.url).searchParams.get("page")||"1")||1));return Response.json({ok:true,...await storeHistory(user.id,page)},{headers:mobileNoStoreHeaders});}catch(e){return storeApiError(e);}}