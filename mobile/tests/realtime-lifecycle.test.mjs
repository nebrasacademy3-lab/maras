import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('../src/providers/RealtimeSyncProvider.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const snapshot = channels => ({ok:true,version:'catalog',channels});
class ApiError extends Error { constructor(status, retryAfterSeconds) {super(String(status)); this.status=status; this.retryAfterSeconds=retryAfterSeconds;} }

function fixture({initialState='active', refresh=async()=>null, rejectInvalidations=false}={}) {
  const timers=new Map(), requests=[], invalidations=[], effects=[], dependencies=[];
  let now=0, id=0, stateListener, removed=false, refreshCount=0;
  const AppState={currentState:initialState, addEventListener(name, listener) {assert.equal(name,'change');stateListener=listener;return {remove(){removed=true;}};}};
  const client={invalidateQueries(config){invalidations.push(config);return rejectInvalidations ? Promise.reject(new Error('offline')) : Promise.resolve();}};
  const user={id:1,role:'student'};
  const mocks={
    react:{useRef:value=>({current:value}),useEffect:(effect,deps)=>{effects.push(effect);dependencies.push(deps);}},
    'react/jsx-runtime':{jsx:(_type,props)=>props.children,Fragment:'Fragment'},
    'react-native':{AppState}, '@tanstack/react-query':{useQueryClient:()=>client},
    '@/src/lib/api':{ApiError,api(path,init){assert.equal(path,'/api/sync');return new Promise((resolve,reject)=>requests.push({signal:init.signal,resolve,reject}));}},
    '@/src/providers/AuthProvider':{useAuth:()=>({token:'synthetic',user,loading:false,refresh:async()=>{refreshCount++;return refresh();}})},
  };
  const exports={};
  vm.runInNewContext(code,{exports,AbortController,Date:{now:()=>now},setTimeout(callback,delay){timers.set(++id,{callback,delay,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),require:name=>{if(!(name in mocks))throw new Error(name);return mocks[name];}});
  exports.RealtimeSyncProvider({children:null});const cleanup=effects[0]();
  const state=next=>{AppState.currentState=next;stateListener(next);};
  const tick=milliseconds=>{now+=milliseconds;for(const [key,timer] of [...timers]){if(timer.at<=now){timers.delete(key);timer.callback();}}};
  return {timers,requests,invalidations,cleanup,state,tick,dependencies,user,refreshCount:()=>refreshCount,removed:()=>removed};
}

test('background aborts native sync and obsolete success cannot populate or reschedule', async()=>{
  const f=fixture();assert.equal(f.requests.length,1);f.state('background');assert.equal(f.requests[0].signal.aborted,true);
  f.requests[0].resolve(snapshot({catalog:'old'}));await flush();assert.equal(f.invalidations.length,0);assert.equal(f.timers.size,0);
  f.state('active');assert.equal(f.requests.length,2);f.requests[1].resolve(snapshot({catalog:'new'}));await flush();assert.equal(f.timers.size,1);f.cleanup();assert.equal(f.timers.size,0);assert.ok(f.removed());
});
test('late rejection cannot refresh auth or release a resumed request',async()=>{
  const f=fixture();f.state('background');f.state('active');f.requests[0].reject(new ApiError(401));await flush();
  assert.equal(f.refreshCount(),0);assert.equal(f.timers.size,0);f.state('active');assert.equal(f.requests.length,2);
  f.requests[1].resolve(snapshot({catalog:'1'}));await flush();assert.equal(f.timers.size,1);f.cleanup();
});
test('unmount aborts pending native network work and prevents all late auth effects',async()=>{
  const f=fixture();f.cleanup();assert.equal(f.requests[0].signal.aborted,true);f.requests[0].reject(new ApiError(401));await flush();assert.equal(f.refreshCount(),0);assert.equal(f.timers.size,0);
});
test('removed private channels invalidate their caches and revalidate authentication',async()=>{
  const f=fixture();f.requests[0].resolve(snapshot({catalog:'1',account:'a',admin:'b'}));await flush();f.tick(5000);
  f.requests[1].resolve(snapshot({catalog:'1'}));await flush();
  const keys=f.invalidations.map(item=>item.queryKey[0]);
  for(const key of ['dashboard','cart','favorites','admin-panel','admin-staff','admin-capabilities','registered-devices'])assert.ok(keys.includes(key),key);
  assert.equal(keys.filter(key=>key==='dashboard').length,1);assert.equal(f.refreshCount(),1);f.cleanup();
});
test('429 server cooldown survives background/foreground without request storms',async()=>{
  const f=fixture();f.requests[0].reject(new ApiError(429,120));await flush();assert.equal([...f.timers.values()][0].delay,120000);
  f.state('background');f.tick(10000);f.state('active');assert.equal(f.requests.length,1);assert.equal([...f.timers.values()][0].delay,110000);
  f.tick(110000);assert.equal(f.requests.length,2);f.cleanup();
});
test('transient failures back off, recover, and leave exactly one next poll',async()=>{
  const f=fixture();f.requests[0].reject(new Error('offline'));await flush();assert.equal([...f.timers.values()][0].delay,10000);
  f.tick(10000);f.requests[1].reject(new Error('offline'));await flush();assert.equal([...f.timers.values()][0].delay,20000);
  f.tick(20000);f.requests[2].resolve(snapshot({catalog:'ok'}));await flush();assert.equal([...f.timers.values()][0].delay,5000);assert.equal(f.timers.size,1);f.cleanup();
});
test('session-refresh failure is contained and rate limited',async()=>{
  const f=fixture({refresh:async()=>{throw new Error('offline');}});f.requests[0].reject(new ApiError(401));await flush();assert.equal(f.refreshCount(),1);assert.equal([...f.timers.values()][0].delay,60000);f.cleanup();
});
test('initial background never starts sync until foregrounded',async()=>{
  const f=fixture({initialState:'background'});assert.equal(f.requests.length,0);f.state('inactive');f.state('active');assert.equal(f.requests.length,1);f.cleanup();
});
test('malformed successful payload does not replace baseline or invalidate data',async()=>{
  const f=fixture();f.requests[0].resolve(snapshot({catalog:'1'}));await flush();f.tick(5000);f.requests[1].resolve({ok:true,channels:{catalog:33}});await flush();assert.equal(f.invalidations.length,0);
  f.tick(10000);f.requests[2].resolve(snapshot({catalog:'2'}));await flush();assert.ok(f.invalidations.some(row=>row.queryKey[0]==='catalog'));f.cleanup();
});
test('failed query refresh is handled and stable account identity is used for effect dependencies',async()=>{
  const f=fixture({rejectInvalidations:true});assert.ok(!f.dependencies[0].includes(f.user));assert.ok(f.dependencies[0].includes(f.user.id));
  f.requests[0].resolve(snapshot({catalog:'1'}));await flush();f.tick(5000);f.requests[1].resolve(snapshot({catalog:'2'}));await flush();assert.equal(f.timers.size,1);f.cleanup();
});

test('foreground refreshes social settings and related screens with active refetch exactly once',async()=>{
 const f=fixture({initialState:'background'});f.state('active');
 const settings=f.invalidations.filter(row=>row.queryKey[0]==='settings');
 assert.equal(settings.length,1);assert.equal(settings[0].refetchType,'active');
 assert.ok(f.invalidations.some(row=>row.queryKey[0]==='public-information'));
 f.state('active');assert.equal(f.invalidations.filter(row=>row.queryKey[0]==='settings').length,1);f.cleanup();
});
