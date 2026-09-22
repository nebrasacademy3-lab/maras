import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
function load(path, mocks) {
  const exports = {};
  const content = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(content, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText, {exports,URL,require:name=>{assert.ok(name in mocks,name);return mocks[name];}});
  return exports;
}
function render(destination, {active=false, direct=false, user={id:1}, status='available'}={}) {
  const pushed=[], external=[];let toggled=0;
  const routes=load('src/lib/notification-routing.ts',{
    'expo-router':{router:{push:value=>pushed.push(value)}},
    'react-native':{Linking:{openURL:async value=>external.push(value)}},
    '@/src/lib/api':{API_URL:'https://example.test',DIRECT_COMMERCE_ENABLED:direct},
  });
  const jsx=(type,props)=>({type,props});
  const component=load('src/components/LearningTracks.tsx',{
    'react':{default:{}},'react/jsx-runtime':{jsx,jsxs:jsx},
    '@expo/vector-icons':{Ionicons:'Icon'},
    '@tanstack/react-query':{useQueryClient:()=>({}),useMutation:()=>({mutate:()=>toggled++})},
    'expo-router':{router:{push:value=>pushed.push(value)}},
    'react-native':{StyleSheet:{create:value=>value},View:'View',Pressable:'Pressable'},
    '@/src/components/ScaledText':{ScaledText:'Text'},
    '@/src/components/ui':{AppButton:'Button',Card:'Card',SectionTitle:'Title',EmptyState:'Empty'},
    '@/src/lib/api':{ApiError:class extends Error{},API_URL:'https://example.test',DIRECT_COMMERCE_ENABLED:direct},
    '@/src/lib/notification-routing':routes,
    '@/src/providers/AuthProvider':{useAuth:()=>({user})},
    '@/src/providers/ThemeProvider':{useTheme:()=>({colors:{}})},
  });
  const tree=component.LearningTrackCard({track:{slug:'test',status,destination,ctaLabel:'اشترك عبر الموقع',iconKey:'book',title:'عنوان'},active});
  const button=tree.props.children.find(child=>child?.type==='Button');
  assert.ok(button);button.props.onPress();
  return {label:button.props.title,pushed,external,toggled};
}
test('native learning tracks reject remote checkout destinations and purchase labels',()=>{
  for(const path of ['/cart','/cart/?coupon=1','/checkout','/checkout/course','/courses/../cart','/courses/%2e%2e/cart','//pay.example.test/pay','https://example.test/cart','https://pay.example.test/pay','javascript:alert(1)']){
    const result=render(path);assert.equal(result.pushed.length,0,path);assert.equal(result.external.length,0,path);assert.equal(result.toggled,1);assert.equal(result.label,'أبلغني عند الإطلاق');
  }
});
test('native learning tracks map valid course and learning URLs to native routes',()=>{
  for(const path of ['/courses/math','https://example.test/courses/math','/learn/math']){
    const result=render(path);assert.equal(result.pushed.length,1);assert.ok(['/course/[slug]','/learn/[slug]'].includes(result.pushed[0].pathname));assert.equal(result.toggled,0);assert.equal(result.label,'افتح المسار');
  }
});
test('interest cancellation and guest authentication do not become purchases',()=>{
  assert.equal(render('/checkout',{active:true}).label,'تم تفعيل التنبيه · إلغاء');
  const guest=render('/cart',{user:null});assert.equal(guest.pushed[0].pathname,'/(auth)/login');assert.equal(guest.toggled,0);
  const coming=render('/courses/math',{status:'coming_soon'});assert.equal(coming.toggled,1);assert.equal(coming.pushed.length,0);
});
test('direct website mode preserves legitimate destination and custom labels',()=>{
  const result=render('/cart',{direct:true});assert.equal(result.pushed[0],'/cart');assert.equal(result.label,'اشترك عبر الموقع');assert.equal(result.toggled,0);
});
