import test from 'node:test';
import assert from 'node:assert/strict';
import {pureSource} from './helpers/pure-source.mjs';
async function fixture() {
  const requests=[];
  const store=await pureSource('components/commerce-state.tsx',{useSyncExternalStore:()=>null,fetch:(path,init)=>new Promise((resolve,reject)=>requests.push({path,init,resolve,reject}))});
  return {store,requests};
}
const respond=(request,slugs)=>request.resolve(Response.json({courseSlugs:slugs}));
test('an older initial read cannot overwrite a successfully changed favorite',async()=>{
  const {store,requests}=await fixture();const read=store.ensureCommerceLoaded();const write=store.setFavorite('new',true);
  respond(requests[2],['new']);await write;respond(requests[0],['cart']);respond(requests[1],['old']);await read;
  assert.deepEqual(store.getCommerceSnapshot(),{cartSlugs:['cart'],favoriteSlugs:['new'],loaded:true,loading:false});
});
test('a partial cache update does not pretend the other domain has loaded',async()=>{
  const {store,requests}=await fixture();store.syncCommerce({cartSlugs:['saved-cart']});assert.equal(store.getCommerceSnapshot().loaded,false);
  const pending=store.ensureCommerceLoaded();assert.equal(requests.length,2);respond(requests[0],['saved-cart']);respond(requests[1],['favorite']);await pending;assert.equal(store.getCommerceSnapshot().loaded,true);
});
test('a failed read preserves verified values and leaves the missing domain retryable',async()=>{
  const {store,requests}=await fixture();store.syncCommerce({cartSlugs:['saved-cart']});const first=store.ensureCommerceLoaded();
  requests[0].reject(new Error('offline'));requests[1].resolve(Response.json({error:'unavailable'},{status:503}));await first;
  assert.deepEqual(store.getCommerceSnapshot(),{cartSlugs:['saved-cart'],favoriteSlugs:[],loaded:false,loading:false});
  const retry=store.ensureCommerceLoaded();assert.equal(requests.length,4);respond(requests[2],['saved-cart']);respond(requests[3],['favorite']);await retry;assert.equal(store.getCommerceSnapshot().loaded,true);
});
test('malformed successful reads are not accepted as empty valid data',async()=>{
  const {store,requests}=await fixture();const pending=store.ensureCommerceLoaded();requests[0].resolve(Response.json({courseSlugs:['x',42]}));requests[1].resolve(Response.json({}));await pending;
  assert.equal(store.getCommerceSnapshot().loaded,false);assert.deepEqual(store.getCommerceSnapshot().cartSlugs,[]);
});
test('simultaneous consumers share one loading request',async()=>{
  const {store,requests}=await fixture();const a=store.ensureCommerceLoaded(),b=store.ensureCommerceLoaded();assert.equal(a,b);assert.equal(requests.length,2);
  respond(requests[0],[]);respond(requests[1],[]);await a;assert.equal(store.getCommerceSnapshot().loaded,true);
});
test('explicit generation protects async page readers after an account reset',async()=>{
  const {store}=await fixture();const epoch=store.getCommerceGeneration();store.resetCommerce();
  assert.equal(store.syncCommerce({cartSlugs:['private-old'],favoriteSlugs:['private-old']},epoch),false);
  assert.deepEqual(store.getCommerceSnapshot(),{cartSlugs:[],favoriteSlugs:[],loaded:false,loading:false});
});
test('stale load completion cannot clear a newer loading lifecycle',async()=>{
  const {store,requests}=await fixture();const old=store.ensureCommerceLoaded();store.resetCommerce();const current=store.ensureCommerceLoaded();
  respond(requests[0],['old']);respond(requests[1],['old']);await old;assert.equal(store.getCommerceSnapshot().loading,true);assert.equal(store.ensureCommerceLoaded(),current);
  respond(requests[2],['new']);respond(requests[3],['new']);await current;assert.deepEqual(store.getCommerceSnapshot().cartSlugs,['new']);
});

test('favorite writes run in user order rather than racing their returned list snapshots',async()=>{
  const {store,requests}=await fixture();const first=store.setFavorite('first',true),second=store.setFavorite('second',true);
  assert.equal(requests.length,1);respond(requests[0],['first']);await first;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,2);respond(requests[1],['first','second']);await second;
  assert.deepEqual(store.getCommerceSnapshot().favoriteSlugs,['first','second']);
});
test('reset prevents queued old-account mutations from ever reaching the network',async()=>{
  const {store,requests}=await fixture();const first=store.setFavorite('first',true),second=store.setFavorite('second',true);
  const rejectedFirst=assert.rejects(first,/تغيّر الحساب/),rejectedSecond=assert.rejects(second,/تغيّر الحساب/);
  store.resetCommerce();respond(requests[0],['first']);await Promise.all([rejectedFirst,rejectedSecond]);assert.equal(requests.length,1);
  const current=store.setFavorite('current',true);respond(requests[1],['current']);await current;
  assert.deepEqual(store.getCommerceSnapshot().favoriteSlugs,['current']);
});
test('failed mutations do not poison later actions or silently erase the known list',async()=>{
  const {store,requests}=await fixture();store.syncCommerce({cartSlugs:['existing']});
  const first=store.setCart('bad',true),second=store.setCart('new',true);const failed=assert.rejects(first,/تعذر تحديث السلة/);
  requests[0].resolve(Response.json({courseSlugs:'invalid'}));await failed;await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(store.getCommerceSnapshot().cartSlugs,['existing']);respond(requests[1],['existing','new']);await second;
  assert.deepEqual(store.getCommerceSnapshot().cartSlugs,['existing','new']);
});
test('independent cart and favorite writes do not block each other',async()=>{
  const {store,requests}=await fixture();const cart=store.setCart('cart',true),favorite=store.setFavorite('fav',true);assert.equal(requests.length,2);
  respond(requests[1],['fav']);await favorite;respond(requests[0],['cart']);await cart;
  assert.deepEqual(store.getCommerceSnapshot(),{cartSlugs:['cart'],favoriteSlugs:['fav'],loaded:true,loading:false});
});
