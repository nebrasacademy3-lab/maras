import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {pureSource} from './helpers/pure-source.mjs';
const policy=await pureSource('lib/staff-policy.ts');
const nav=await pureSource('lib/admin-navigation.ts',policy);
const needs=await pureSource('lib/admin-console-scope.ts');
const actor=await pureSource('lib/admin-actor.ts');
const origins=await pureSource('lib/public-origin.ts');
const partners=await pureSource('lib/partner-policy.ts',origins);

test('admin navigation has exactly eight groups, no duplicate task IDs or destinations',()=>{
 assert.equal(nav.ADMIN_NAVIGATION.length,8);
 const all=nav.ADMIN_NAVIGATION.flatMap(g=>g.items);
 assert.equal(new Set(all.map(i=>i.id)).size,all.length);
 assert.equal(new Set(all.map(i=>i.href)).size,all.length);
 assert.deepEqual(nav.visibleAdminNavigation([],false).map(g=>g.id),['home']);
 assert.equal(nav.ADMIN_SELF_SECURITY.href,'/admin/security');
});
test('ungranted student, finance, staff, metadata and counts never enter a material supervisor navigation/search',()=>{
 const groups=nav.visibleAdminNavigation(['catalog.manage'],false);
 assert.deepEqual(groups.map(g=>g.id),['home','education']); // Cross-course bundles require an explicit global-data scope.
 const items=groups.flatMap(g=>g.items);
 for(const id of ['students','roster','subscriptions','finance','orders','coupons','audit','staff','seo','pages'])assert.equal(items.some(i=>i.id===id),false,id);
 for(const word of ['الطلاب','المدفوعات','المشرفون','الاستردادات'])assert.equal(nav.searchAdminNavigation(groups,word).length,0,word);
 assert.equal(nav.searchAdminNavigation(groups,'الدروس').length,2);
});
test('every new navigation route exists and its capability matches both server and console guards',async()=>{
 for(const group of nav.ADMIN_NAVIGATION)for(const item of group.items){
  const path=item.href.split('?')[0];
  await access(new URL('../app'+path+'/page.tsx',import.meta.url));
  const required=item.view?policy.CONSOLE_VIEWS[item.view]:policy.adminPagePermissions(path);
  assert.ok(required,`${item.id} has a real guard`);
  assert.deepEqual([...item.permissions].sort(),[...required].sort(),item.id);
  assert.equal(policy.permissionsCover(new Set(item.permissions),required),true);
 }
});
test('server and native navigation are byte-identical; no second center list remains mounted',async()=>{
 assert.equal(await readFile(new URL('../lib/admin-navigation.ts',import.meta.url),'utf8'),await readFile(new URL('../mobile/src/lib/admin-navigation.ts',import.meta.url),'utf8'));
 const dashboard=await readFile(new URL('../components/admin-dashboard.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(dashboard,/<aside[^>]+admin-sidebar|<AdminCenterNav\b|ADMIN_CENTERS\.map/);
 const mobile=await readFile(new URL('../mobile/app/admin.tsx',import.meta.url),'utf8');
 assert.match(mobile,/<AdminNavigation /);assert.doesNotMatch(mobile,/<ScrollView[^>]+horizontal|visibleTabs\.map/);
});
test('scoped console reads do not load unrelated finances, student sessions, files or audit',()=>{
 for(const dataset of ['users','sessions','devices','orders','access','settings','audit','tickets','requests'])assert.equal(needs.adminConsoleNeeds('courses',dataset,true),false,dataset);
 assert.equal(needs.adminConsoleNeeds('courses','courses',true),true);
 assert.equal(needs.adminConsoleNeeds('settings','settings',true),true);
 assert.equal(needs.adminConsoleNeeds('settings','orders',true),false);
 assert.equal(needs.adminConsoleNeeds('courses','users',false),true,'legacy clients keep shape, still subject to independent permissions');
});
test('actor expectation cannot switch account, accept malformed IDs, or create authority',()=>{
 for(const v of ['2','0','-1','1.0','1e0','01','9007199254740992','*'])assert.equal(actor.adminActorMatches(new Headers({'x-meras-acting-user':v}),1),false,v);
 assert.equal(actor.adminActorMatches(new Headers({'x-meras-acting-user':'1'}),1),true);
 assert.equal(actor.adminActorMatches(new Headers(),1),true,'older clients still require normal authentication/permissions');
});
test('partner links reject local, credential-bearing, non-HTTPS and nonstandard-port targets',()=>{
 for(const v of ['javascript:alert(1)','http://example.com','https://127.0.0.1/a','https://192.168.1.8/a','https://foo.internal/x','https://user:pw@example.com','https://example.com:8443'])assert.equal(partners.partnerHttps(v),false,v);
 assert.equal(partners.partnerHttps('https://example.com/verify?id=1#record'),true);
 assert.equal(partners.partnerHttps(''),true);
});
test('partner stale revisions and unsupported public accreditation cannot be silently approved',()=>{
 assert.throws(()=>partners.partnerRevision(undefined,'x',1),e=>e.status===404);
 assert.throws(()=>partners.partnerRevision({updatedAt:'a'},'b',1),e=>e.status===409);
 assert.doesNotThrow(()=>partners.partnerRevision({updatedAt:'a'},'a',1));
 const value={status:'published',kind:'partner',rightsConfirmed:true,rightsReference:'written agreement',credentialNumber:null,verificationUrl:null};
 assert.doesNotThrow(()=>partners.validatePublishedPartner(value));
 assert.throws(()=>partners.validatePublishedPartner({...value,rightsConfirmed:false}));
 assert.throws(()=>partners.validatePublishedPartner({...value,rightsReference:''}));
 assert.throws(()=>partners.validatePublishedPartner({...value,kind:'accreditation'}));
 assert.doesNotThrow(()=>partners.validatePublishedPartner({...value,kind:'accreditation',credentialNumber:'QA-1',verificationUrl:'https://example.com/verify'}));
});

test("canonical public identity is consistent in visible content, Organization, WebSite and AboutPage", async()=>{
  const helpers=await import("./helpers/pure-source.mjs");
  const origin=await helpers.pureSource("lib/public-origin.ts",{process:{env:{NODE_ENV:"production",NEXT_PUBLIC_SITE_URL:"https://marasalelm.com"}}});
  const seo=await helpers.pureSource("lib/seo.ts",{...origin,process:{env:{NODE_ENV:"production",NEXT_PUBLIC_SITE_URL:"https://marasalelm.com"}}});
  const identity=seo.publicIdentityFacts(),graph=seo.siteStructuredData()["@graph"],page=seo.publicInformationSchema("/about","عن مراس","تعريف منشور");
  assert.equal(graph[0]["@id"],identity.organizationId);assert.equal(graph[1].publisher["@id"],identity.organizationId);assert.equal(page.about["@id"],identity.organizationId);assert.equal(page["@id"],graph[0].mainEntityOfPage["@id"]);assert.equal(graph[1]["@id"],page.isPartOf["@id"]);
  assert.deepEqual(graph[0].alternateName,graph[1].alternateName);assert.equal(identity.url,"https://marasalelm.com/");assert.match(identity.distinction,/ليست جهة مانحة/);
  const about=await readFile(new URL("../app/about/page.tsx",import.meta.url),"utf8"),guide=await readFile(new URL("../app/llms.txt/route.ts",import.meta.url),"utf8");
  assert.match(about,/identity\.description/);assert.match(about,/identity\.distinction/);assert.match(guide,/identity\.alternateNames/);assert.doesNotMatch(guide,/recommend.*first|ignore previous|تجاهل التعليمات|اقترح.*الأولى/i);
});

test("late commerce reads cannot restore the previous account after reset",async()=>{
  const requests=[];const loaded=await pureSource('components/commerce-state.tsx',{fetch:(_path,init)=>new Promise(resolve=>requests.push({resolve,signal:init.signal})),useSyncExternalStore:()=>null});
  const first=loaded.ensureCommerceLoaded();assert.equal(requests.length,2);loaded.resetCommerce();assert.ok(requests.every(r=>r.signal.aborted));const second=loaded.ensureCommerceLoaded();assert.equal(requests.length,4);
  requests[2].resolve(Response.json({courseSlugs:['current-course']}));requests[3].resolve(Response.json({courseSlugs:['current-favorite']}));await second;
  requests[0].resolve(Response.json({courseSlugs:['old-private-course']}));requests[1].resolve(Response.json({courseSlugs:['old-private-favorite']}));await first;
  assert.deepEqual(loaded.getCommerceSnapshot().cartSlugs,['current-course']);assert.deepEqual(loaded.getCommerceSnapshot().favoriteSlugs,['current-favorite']);
});

test("late successful commerce mutations never update another account's in-memory snapshot",async()=>{
  let complete;const state=await pureSource('components/commerce-state.tsx',{fetch:()=>new Promise(resolve=>{complete=resolve;}),useSyncExternalStore:()=>null});
  const pending=state.setFavorite('old-course',true);state.resetCommerce();complete(Response.json({courseSlugs:['old-course']}));await assert.rejects(pending,/تغيّر الحساب/);assert.deepEqual(state.getCommerceSnapshot().favoriteSlugs,[]);
});
