import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

export async function loadMobileRouting() {
  const source = await readFile(new URL("../mobile/src/lib/notification-routing.ts", import.meta.url), "utf8");
  const exports = {};
  const pushed = [];
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, URLSearchParams,
    require: (name) => {
      if (name === "@/src/lib/api") return { API_URL:"https://maras.example", DIRECT_COMMERCE_ENABLED:false };
      if (name === "expo-router") return { router: { push: (route) => pushed.push(route) } };
      if (name === "react-native") return { Linking: { openURL: async () => {} } };
      throw new Error("Unexpected import: " + name);
    },
  });
  return { ...exports, pushed };
}

export async function loadMobileApi({mode="reader",platform="ios"}={}) {
  const evaluate=(source,mocks,extras={})=>{const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,Headers,FormData,AbortController,setTimeout,clearTimeout,__DEV__:false,require:name=>{if(!(name in mocks))throw new Error(name);return mocks[name];},...extras});return exports;};
  const policy=evaluate(await readFile(new URL("../mobile/src/lib/store-commerce.ts",import.meta.url),"utf8"),{}),requests=[];
  const api=evaluate(await readFile(new URL("../mobile/src/lib/api.ts",import.meta.url),"utf8"),{"expo-constants":{default:{expoConfig:{extra:{apiUrl:"https://maras.example",storeMode:mode,storeDistribution:mode==="direct"?"internal":"store"}}}},"react-native":{Platform:{OS:platform}},"@/src/lib/store-commerce":policy,"@/src/lib/interaction-events":{nativeToast:()=>{},requestNativeAdminMfa:async()=>false}},{fetch:async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({ok:true}),{status:200});}});
  return {...api,requests};
}
