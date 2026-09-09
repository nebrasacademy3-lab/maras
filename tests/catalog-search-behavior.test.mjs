import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(path, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiledModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: compiledModule, exports: compiledModule.exports, require: name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; }, URL, Request, Response, DOMException, ...globals });
  return compiledModule.exports;
}
const search = load("../lib/catalog-search.ts");
const institution = { slug:"orbit", name:"جامعة المدار", nameEn:"Orbit University", type:"أهلية", region:"الرياض", aliases:["مدار"], domain:"example.test", featured:true };
const course = { slug:"physics", universitySlug:"orbit", title:"مبادئ الفيزياء", titleEn:"Physics", code:"PHY101", university:institution.name, specialty:"الهندسة", color:"from-blue-700", icon:"P", units:[{privateField:"not needed by search"}], price:120 };
const route = load("../app/api/catalog/search/route.ts", { "@/lib/catalog-search":search, "@/lib/catalog-store":{ getInstitutionsCatalog:async()=>[institution], getCoursesCatalog:async()=>[course,{...course,slug:"hidden",universitySlug:"hidden"}] } });

test("real search route response is consumable by the dialog without a universities/institutions mismatch", async()=>{
  const response=await route.GET(new Request("https://local.test/api/catalog/search"));
  const payload=await response.json();
  const result=search.parseCatalogSearchResults(payload);
  assert.equal(result.institutions[0].name,institution.name);
  assert.equal(result.courses[0].slug,course.slug);
  assert.equal(result.courses.length,1);
  assert.ok(!("units" in payload.courses[0]));
  assert.ok(!("price" in payload.courses[0]));
});
test("Arabic variants, multiword search, course codes and Arabic digits match consistently",async()=>{
  for(const q of ["مبادي الفيزياء","فيزياء مدار","PHY١٠١","الهندسه"]){
    const response=await route.GET(new Request("https://local.test/api/catalog/search?q="+encodeURIComponent(q)));
    assert.equal((await response.json()).courses[0]?.slug,"physics",q);
  }
  assert.equal(search.catalogSearchMatches("مادة أخرى",[course.title]),false);
  const response=await route.GET(new Request("https://local.test/api/catalog/search?q="+encodeURIComponent("مدار")));
  assert.equal((await response.json()).institutions.length,1);
});
test("invalid or partial search bodies fail safely and malformed rows cannot form navigation links",()=>{
  for(const value of [null,[],{}, {universities:[],courses:[]}, {institutions:null,courses:[]}])assert.throws(()=>search.parseCatalogSearchResults(value));
  const result=search.parseCatalogSearchResults({institutions:[null,{}, {...institution,slug:"../admin"},institution],courses:[null,{}, {...course,slug:".."}, {...course,slug:"//evil.test"},course]});
  assert.equal(result.institutions.length,1);
  assert.equal(result.courses.length,1);
});
test("native share cancellation never becomes a copied/shared event",async()=>{
  const sharing=load("../lib/browser-sharing.ts",{}, {navigator:{share:async()=>{throw new DOMException("Cancelled","AbortError")}}});
  assert.equal(await sharing.shareBrowserLink({url:"https://example.test/r/code"}),"cancelled");
  const fallback=load("../lib/browser-sharing.ts",{}, {navigator:{}});
  assert.equal(await fallback.shareBrowserLink({url:"https://example.test/r/code"}),"fallback");
});
test("clipboard denial falls back without an unhandled rejection and restores focus",async()=>{
  let removed=false,focused=false,selected=false;
  class Element {isConnected=true;focus(){focused=true;}}
  const field={style:{},setAttribute(){},select(){selected=true;},setSelectionRange(){},remove(){removed=true;}};
  const sharing=load("../lib/browser-sharing.ts",{}, {HTMLElement:Element,navigator:{clipboard:{writeText:async()=>{throw new DOMException("Denied","NotAllowedError")}}},document:{activeElement:new Element(),body:{append(){}},createElement:()=>field,execCommand:()=>true}});
  assert.equal(await sharing.copyBrowserText("hello"),true);
  assert.ok(removed&&focused&&selected);
});
