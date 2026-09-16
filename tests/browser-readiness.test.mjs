import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {navigatePublicPage} from '../scripts/qa-page-readiness.mjs';
function pageFixture(overrides={}){
  const listeners=new Map(),waiters=[],calls=[];const paths=['/api/auth/me','/api/public/announcements','/api/public/settings','/api/sync'];
  const page={on(name,fn){listeners.set(name,fn);},off(name,fn){assert.equal(listeners.get(name),fn);listeners.delete(name);},waitForResponse(predicate){return new Promise(resolve=>waiters.push({predicate,resolve}));},async goto(url,options){calls.push({url,options});for(const path of paths){const status=overrides[path]??(path==='/api/auth/me'?401:200),response={url:()=>new URL(path,url).href,request:()=>({method:()=> 'GET'}),status:()=>status,ok:()=>status===200,finished:async()=>{calls.push({finished:path});}};const waiter=waiters.find(w=>w.predicate(response));assert.ok(waiter,path);waiter.resolve(response);}return {status:()=>200};},reload(options){calls.push({reload:true});return this.goto('https://qa.example/about',options);},locator(){return {first(){return this;},async waitFor(){calls.push({heading:true});}};},async evaluate(){calls.push({fonts:true});}};
  return {page,listeners,calls};
}
test('browser readiness waits for real finite public responses and load, not an inline palette or networkidle',async()=>{const f=pageFixture();await navigatePublicPage(f.page,'https://qa.example/about');assert.deepEqual(f.calls[0].options,{waitUntil:'load'});assert.equal(f.calls.filter(c=>c.finished).length,4);assert.equal(f.listeners.size,0);});
test('failed public startup response fails QA rather than being ignored',async()=>{const f=pageFixture({'/api/public/settings':500});await assert.rejects(navigatePublicPage(f.page,'https://qa.example/about'),/HTTP 500/);assert.equal(f.listeners.size,0);});
test('reload also waits for new document initialization responses',async()=>{const f=pageFixture();await navigatePublicPage(f.page,'https://qa.example/about',{reload:true});assert.equal(f.calls[0].reload,true);assert.equal(f.calls.filter(c=>c.finished).length,4);assert.equal(f.listeners.size,0);});
test('header and announcement restoration revalidate a bfcache page without reusing aborted requests',async()=>{
 for(const name of ['site-header','announcement-campaign']){const source=await readFile(new URL('../components/'+name+'.tsx',import.meta.url),'utf8');assert.match(source,/pageActive\.current=false/);assert.match(source,/if\(!event\.persisted\)return/);assert.match(source,/addEventListener\("pageshow",restore\)/);assert.match(source,/removeEventListener\("pageshow",restore\)/);}
});
