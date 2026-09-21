import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>{if(!(name in mocks))throw new Error(name);return mocks[name];}});return exports;}
const staff=load('src/lib/staff-policy.ts'),navigation=load('src/lib/admin-navigation.ts',{'./staff-policy':staff});
test('instructor navigation requires the independent view or manage capability',()=>{
 for(const permissions of [[],['staff.manage'],['catalog.manage'],['data.all']])assert.equal(navigation.visibleAdminNavigation(permissions,false).flatMap(group=>group.items).some(item=>item.id==='instructors'),false);
 for(const permissions of [['instructors.view'],['instructors.manage']])assert.equal(navigation.visibleAdminNavigation(permissions,false).flatMap(group=>group.items).some(item=>item.id==='instructors'),true);
 assert.equal(navigation.visibleAdminNavigation([],true).flatMap(group=>group.items).some(item=>item.id==='instructors'),true);
});
test('native instructor administration makes no private queries for accounts without instructor view',()=>{let queries=0;const element=(type,props)=>({type,props});const empty={};const component=load('src/components/admin-instructors.tsx',{react:require('react'),'react/jsx-runtime':{jsx:element,jsxs:element},'react-native':empty,'@tanstack/react-query':{useQuery:()=>{queries++;throw new Error('Private query');}},'@/src/components/ui':{EmptyState:'EmptyState'},'@/src/components/SearchPicker':empty,'@/src/components/ScaledText':empty,'@/src/components/instructor-video-preview':empty,'@/src/lib/api':empty,'@/src/lib/downloads':empty,'@/src/lib/admin-capabilities':{useAdminCapabilities:()=>({owner:false,can:()=>false})},'@/src/lib/interaction-events':empty,'@/src/lib/instructor':empty,'@/src/lib/instructor-assignments':empty,'@/src/providers/AuthProvider':{useAuth:()=>({user:{id:9,role:'supervisor'}})},'@/src/providers/ThemeProvider':empty});assert.equal(component.AdminInstructors().type,'EmptyState');assert.equal(queries,0);});
