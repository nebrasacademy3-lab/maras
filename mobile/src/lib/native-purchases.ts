import Constants from "expo-constants";
import { Platform } from "react-native";
import type { PurchasesStoreProduct } from "react-native-purchases";
import { api, getApiToken, NATIVE_PURCHASES_ENABLED } from "@/src/lib/api";
export type StoreCatalogProduct={key:string;kind:"course"|"bundle"|"ai";targetSlug:string|null;title:string;iosProductId:string|null;androidProductId:string|null;durationDays:number|null;courseSlugs:string[]};
export type StoreCatalog={sessionToken:string;accountId:string;configured:boolean;products:StoreCatalogProduct[]};
let configured=false;
let activeAccount="";
let chain:Promise<unknown>=Promise.resolve();
function serialize<T>(action:()=>Promise<T>):Promise<T>{const next=chain.then(action,action);chain=next.catch(()=>{});return next;}
function assertSession(token:string){if(!token||token!==getApiToken())throw new Error("تغير الحساب. افتح المشتريات مجددًا من حسابك الحالي.");}
async function sdkFor(accountId:string,token:string) {
 assertSession(token);
 if(!NATIVE_PURCHASES_ENABLED)throw new Error("الشراء من المتجر يتطلب نسخة التطبيق المخصصة للمتجر.");
 const key=String(Platform.OS==="ios"?Constants.expoConfig?.extra?.revenuecatIosKey:Constants.expoConfig?.extra?.revenuecatAndroidKey);
 if(!key||key==="undefined")throw new Error("مشتريات التطبيق غير مهيأة حاليًا.");
 const module=await import("react-native-purchases");
 assertSession(token);
 if(!configured){module.default.configure({apiKey:key,appUserID:accountId});configured=true;activeAccount=accountId;}
 else if(activeAccount!==accountId){await module.default.logIn(accountId);activeAccount=accountId;}
 assertSession(token);
 return module;
}
export async function fetchStoreCatalog(filter:{kind?:string;slug?:string;courseSlugs?:string[];history?:boolean}={}){const q=new URLSearchParams();if(filter.kind)q.set("kind",filter.kind);if(filter.slug)q.set("slug",filter.slug);if(filter.courseSlugs)q.set("courses",filter.courseSlugs.join(","));if(filter.history)q.set("history","true");const token=getApiToken();const result=await api<StoreCatalog>("/api/mobile/purchases/catalog?"+q.toString());assertSession(token);return {...result,sessionToken:token};}
export function loadStoreProducts(catalog:StoreCatalog) {
 const token=getApiToken();
 return serialize(async()=>{
  if(!catalog.configured)throw new Error("مشتريات التطبيق غير مهيأة حاليًا.");
  const sdk=await sdkFor(catalog.accountId,catalog.sessionToken);
  const ids=catalog.products.map(p=>Platform.OS==="ios"?p.iosProductId:p.androidProductId).filter((p):p is string=>!!p);
  const products=ids.length?await sdk.default.getProducts(ids,sdk.PRODUCT_CATEGORY.NON_SUBSCRIPTION):[];
  assertSession(token);return products;
 });
}
export class PurchaseSyncPendingError extends Error { purchaseCompleted=true; constructor(){super("اكتمل الشراء لدى المتجر ولم تكتمل المزامنة. استخدم إعادة المزامنة دون الدفع مجددًا.");} }
export function buyStoreProduct(catalog:StoreCatalog,product:PurchasesStoreProduct) {
 const token=getApiToken();
 return serialize(async()=>{
  const sdk=await sdkFor(catalog.accountId,catalog.sessionToken);
  await sdk.default.purchaseStoreProduct(product);
  assertSession(token);
  // Only the server may grant access; CustomerInfo is never accepted as proof.
  try { const result=await api<{ok:true;changed:number;verified:number;unresolved?:number}>("/api/mobile/purchases/sync",{method:"POST",timeoutMs:60000}); assertSession(token); if(result.unresolved)throw new PurchaseSyncPendingError(); return result; } catch { assertSession(token); throw new PurchaseSyncPendingError(); }
 });
}
export function restoreStorePurchases(catalog:StoreCatalog) {
 const token=getApiToken();
 return serialize(async()=>{
  const sdk=await sdkFor(catalog.accountId,catalog.sessionToken);
  await sdk.default.restorePurchases();
  assertSession(token);
  const result=await api<{ok:true;changed:number;verified:number;unresolved?:number}>("/api/mobile/purchases/sync",{method:"POST",timeoutMs:60000});assertSession(token);if(result.unresolved)throw new PurchaseSyncPendingError();return result;
 });
}
export function storeErrorMessage(error:unknown) {
 if(error&&typeof error==="object"&&"userCancelled" in error&&error.userCancelled)return "تم إلغاء الشراء.";
 if(error&&typeof error==="object"&&"code" in error&&String(error.code)==="20")return "الشراء بانتظار موافقة المتجر. سيُفعّل بعد تأكيده.";
 return error instanceof Error?error.message:"تعذر إكمال الشراء. تحقق من الاتصال وأعد المزامنة دون تكرار الدفع.";
}