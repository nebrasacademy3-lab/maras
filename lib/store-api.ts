import { getSessionUser, sameOriginRequest, checkRateLimit } from "@/lib/auth";
import { purchaseRequirement } from "@/lib/account-readiness";
import { StoreError } from "@/lib/store-contracts";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";
export async function storeApiUser(request:Request,mutation=false,purchase=false) {
 const user=await getSessionUser(request);
 if(!user)throw new StoreError("UNAUTHORIZED","سجّل الدخول.",401);
 if(mutation&&!sameOriginRequest(request))throw new StoreError("FORBIDDEN","مصدر الطلب غير صالح.",403);
 if(!await checkRateLimit("store-"+(mutation?"sync":"read"),"user:"+user.id,mutation?6:60,60))throw new StoreError("RATE_LIMITED","انتظر قليلًا وأعد المحاولة.",429);
 if(purchase){const required=purchaseRequirement(user);if(required)throw new StoreError(required.code,required.error,403);}
 return user;
}
export function storeApiError(error:unknown) {
 if(error instanceof StoreError)return Response.json({ok:false,error:error.message,code:error.code},{status:error.status,headers:mobileNoStoreHeaders});
 console.error("[store] request failed", error instanceof Error?error.name:"unknown");
 return Response.json({ok:false,error:"تعذر إكمال طلب المتجر. حاول لاحقًا.",code:"STORE_UNAVAILABLE"},{status:503,headers:mobileNoStoreHeaders});
}