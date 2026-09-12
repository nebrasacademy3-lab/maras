import React,{useEffect,useState} from "react";
import {Platform,View} from "react-native";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import type {PurchasesStoreProduct} from "react-native-purchases";
import {ScaledText as Text} from "@/src/components/ScaledText";
import {AppButton,Card,LoadingState} from "@/src/components/ui";
import {api,getApiToken,NATIVE_PURCHASES_ENABLED} from "@/src/lib/api";
import {buyStoreProduct,fetchStoreCatalog,loadStoreProducts,restoreStorePurchases,storeErrorMessage} from "@/src/lib/native-purchases";
import {useAuth} from "@/src/providers/AuthProvider";
import {useTheme} from "@/src/providers/ThemeProvider";
export function StorePurchases({kind,slug,courseSlugs,history=false}:{kind?:"course"|"bundle"|"ai";slug?:string;courseSlugs?:string[];history?:boolean}) {
 const {user}=useAuth();const {colors}=useTheme();const client=useQueryClient();
 const [busy,setBusy]=useState("");const [message,setMessage]=useState(""); const [pendingProducts,setPendingProducts]=useState<string[]>([]);
 useEffect(()=>{const timer=setTimeout(()=>{setBusy("");setMessage("");setPendingProducts([]);},0);return()=>clearTimeout(timer);},[user?.id]);
 const catalog=useQuery({queryKey:["store-catalog",user?.id,kind,slug,courseSlugs,history],queryFn:()=>fetchStoreCatalog({kind,slug,courseSlugs,history}),enabled:NATIVE_PURCHASES_ENABLED&&!!user,retry:false});
 const sdkProducts=useQuery({queryKey:["store-products",user?.id,catalog.data?.products],queryFn:()=>loadStoreProducts(catalog.data!),enabled:!!catalog.data&&catalog.data.configured,retry:false,staleTime:60000});
 const [page,setPage]=useState(1);
 const past=useQuery({queryKey:["store-history",user?.id,page],queryFn:()=>api<{items:{id:string;title:string;status:string;purchased_at:string;duration_days:number|null}[];total:number;pageSize:number}>("/api/mobile/purchases/history?page="+page),enabled:!!user&&history});
 if(!NATIVE_PURCHASES_ENABLED)return null;
 if(!user)return <Card><Text style={{color:colors.text}}>سجّل الدخول لعرض مشتريات التطبيق واستعادتها.</Text></Card>;
 async function action(name:string,product?:PurchasesStoreProduct){
  if(!catalog.data||busy)return;const operationToken=getApiToken();setBusy(name);setMessage("");
  try {
   const result=product?await buyStoreProduct(catalog.data,product):name==="restore"?await restoreStorePurchases(catalog.data):await api<{changed:number;verified:number}>("/api/mobile/purchases/sync",{method:"POST",timeoutMs:60000});
   if(getApiToken()!==operationToken)return;
   setPendingProducts([]);setMessage(result.changed?"تمت المزامنة وتحديث حقوق حسابك.":"اكتملت المزامنة. إذا كان الشراء معلقًا، انتظر تأكيد المتجر ثم أعد المزامنة.");
   await client.invalidateQueries();
  }catch(e){if(getApiToken()!==operationToken)return;if(e&&typeof e==="object"&&"purchaseCompleted" in e)setPendingProducts(items=>[...items,name]);setMessage(storeErrorMessage(e));}finally{if(getApiToken()===operationToken)setBusy("");}
 }
 const choices=(catalog.data?.products||[]).filter(p=>{ if(kind&&p.kind!==kind||slug&&p.targetSlug!==slug)return false;if(!courseSlugs)return true;if(p.kind==="ai")return false;return p.kind==="bundle"?p.courseSlugs.length===courseSlugs.length&&p.courseSlugs.every(s=>courseSlugs.includes(s)):p.courseSlugs.some(s=>courseSlugs.includes(s)); });
 return <View style={{gap:12,marginVertical:12}}>
  <Card><Text style={{color:colors.text,fontSize:18,fontWeight:"800",textAlign:"right"}}>مشتريات التطبيق</Text><Text style={{color:colors.textSoft,textAlign:"right",lineHeight:23}}>الدفع والاستعادة عبر {Platform.OS==="ios"?"App Store":"Google Play"}. التجديد يدوي دون خصم تلقائي؛ يُعرض السعر النهائي من المتجر.</Text>
  {catalog.isLoading||sdkProducts.isLoading?<LoadingState/>:null}
  {catalog.error||sdkProducts.error?<Text style={{color:colors.danger}}>{storeErrorMessage(catalog.error||sdkProducts.error)}</Text>:null}
  {catalog.data&&!catalog.data.configured?<Text style={{color:colors.textSoft}}>الشراء غير متاح حاليًا. اشتراكاتك الحالية متاحة من حسابك.</Text>:null}
  {!history&&choices.map(p=>{const storeProduct=sdkProducts.data?.find(s=>s.identifier===(Platform.OS==="ios"?p.iosProductId:p.androidProductId));return <View key={p.key} style={{gap:8,marginTop:16}}><Text style={{color:colors.text,fontWeight:"700",textAlign:"right"}}>{p.title}</Text><Text style={{color:colors.textSoft,textAlign:"right"}}>{p.durationDays===null?"وصول دائم":p.durationDays+" يومًا"}{p.kind==="ai"?" · تضاف المدة بعد المدة الحالية":""}</Text><AppButton title={storeProduct?"شراء · "+storeProduct.priceString:"غير متاح في المتجر الآن"} disabled={!storeProduct||!!busy||pendingProducts.includes(p.key)} loading={busy===p.key} onPress={()=>void action(p.key,storeProduct)}/></View>;})}
  {!history&&catalog.data?.configured&&!choices.length?<Text style={{color:colors.textSoft}}>لم يُنشر منتج متوافق في المتجر لهذه المادة بعد.</Text>:null}
  <View style={{gap:8,marginTop:16}}><AppButton title="استعادة مشتريات حسابي" variant="soft" disabled={!catalog.data?.configured||!!busy} loading={busy==="restore"} onPress={()=>void action("restore")}/><AppButton title="إعادة المزامنة" variant="ghost" disabled={!!busy} loading={busy==="sync"} onPress={()=>void action("sync")}/></View>
  {message?<Text accessibilityLiveRegion="polite" style={{color:colors.text,textAlign:"right",marginTop:12}}>{message}</Text>:null}</Card>
  {history?past.data?.items.map(p=><Card key={p.id}><Text style={{color:colors.text,fontWeight:"700"}}>{p.title}</Text><Text style={{color:colors.textSoft}}>{new Date(p.purchased_at).toLocaleDateString("ar-SA")} · {p.status==="owned"?"شراء موثق":"مسترد"}</Text></Card>):null}
  {history&&past.data&&past.data.total>past.data.pageSize?<View><AppButton title="السابق" disabled={page===1} onPress={()=>setPage(page-1)}/><Text style={{color:colors.text}}>صفحة {page}</Text><AppButton title="التالي" disabled={page*past.data.pageSize>=past.data.total} onPress={()=>setPage(page+1)}/></View>:null}
 </View>;
}