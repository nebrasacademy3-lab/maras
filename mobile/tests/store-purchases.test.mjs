import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
function isolated(path,mocks){
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../"+path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{if(!(name in mocks))throw new Error(name);return mocks[name];},URL,Headers,FormData,AbortController,setTimeout,clearTimeout,__DEV__:false});return exports;
}
const mode=isolated("src/lib/store-commerce.ts",{});
for(const platform of ["ios","android"])test(platform+" native IAP uses stores in release and custom development clients",()=>{
 const base={platform,development:false,executionEnvironment:"standalone",configuredMode:"iap",distribution:"store"};
 assert.equal(mode.resolveStoreMode(base),"iap");assert.equal(mode.resolveStoreMode({...base,development:true}),"iap");assert.equal(mode.resolveStoreMode({...base,executionEnvironment:"storeClient"}),"reader");assert.equal(mode.resolveStoreMode({...base,configuredMode:"direct"}),"reader");
});
function setup({purchaseError=null,syncError=null,purchaseAction=null}={}){
 let token="session-a";const calls=[];
 const sdk={configure:options=>calls.push(["configure",options.appUserID]),logIn:async id=>calls.push(["login",id]),getProducts:async ids=>ids.map(identifier=>({identifier,priceString:"SAR 30"})),purchaseStoreProduct:async()=>{calls.push(["purchase"]);await purchaseAction?.(()=>{token="session-b";});if(purchaseError)throw purchaseError;},restorePurchases:async()=>calls.push(["restore"])};
 const api=async(path)=>{calls.push(["api",path]);if(syncError)throw syncError;return {ok:true,changed:1,verified:1,accountId:"account-a",configured:true,products:[]};};
 const module=isolated("src/lib/native-purchases.ts",{"expo-constants":{__esModule:true,default:{expoConfig:{extra:{revenuecatIosKey:"appl_test"}}}},"react-native":{Platform:{OS:"ios"}},"@/src/lib/api":{api,getApiToken:()=>token,NATIVE_PURCHASES_ENABLED:true},"react-native-purchases":{__esModule:true,default:sdk,PRODUCT_CATEGORY:{NON_SUBSCRIPTION:"NON_SUBSCRIPTION"}}});
 const catalog={sessionToken:"session-a",accountId:"account-a",configured:true,products:[]};
 return {module,catalog,calls,change:()=>{token="session-b";}};
}
test("native successful purchase calls only authenticated server sync for entitlement",async()=>{const s=setup();await s.module.buyStoreProduct(s.catalog,{identifier:"p1"});assert.deepEqual(s.calls.map(c=>c[0]),["configure","purchase","api"]);assert.equal(s.calls[2][1],"/api/mobile/purchases/sync");});
test("store cancellation does not call server fulfillment",async()=>{const s=setup({purchaseError:{userCancelled:true}});await assert.rejects(()=>s.module.buyStoreProduct(s.catalog,{}));assert.equal(s.calls.filter(c=>c[0]==="api").length,0);});
test("account change while store sheet is open cannot sync the old purchase to the new account",async()=>{const s=setup({purchaseAction:async change=>change()});await assert.rejects(()=>s.module.buyStoreProduct(s.catalog,{}),/تغير الحساب/);assert.equal(s.calls.filter(c=>c[0]==="api").length,0);});
test("stale catalog cannot change SDK identity after switching accounts",async()=>{const s=setup();s.change();await assert.rejects(()=>s.module.loadStoreProducts(s.catalog),/تغير الحساب/);assert.equal(s.calls.length,0);});
test("verified store payment with failed sync yields recoverable pending state",async()=>{const s=setup({syncError:new Error("offline")});await assert.rejects(()=>s.module.buyStoreProduct(s.catalog,{}),e=>e.purchaseCompleted===true);assert.equal(s.calls.filter(c=>c[0]==="purchase").length,1);});
test("restore reads store receipts then verifies them on the server",async()=>{const s=setup();await s.module.restoreStorePurchases(s.catalog);assert.deepEqual(s.calls.map(c=>c[0]),["configure","restore","api"]);});
