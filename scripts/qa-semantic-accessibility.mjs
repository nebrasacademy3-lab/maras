/** Focused axe audit of the user's attached semantic/name checklist on synthetic QA. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),origin='http://127.0.0.1:3100';
const fixture=JSON.parse(readFileSync('.data/qa-fixtures.json','utf8'));assert.equal(fixture.origin,origin,'Synthetic loopback only');
const phase=process.env.QA_A11Y_PHASE||'before';assert.ok(['before','after'].includes(phase));
const out='output/playwright/accessibility-20260923';mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),phase,engine:'chromium',checks:[],limitations:['Automated semantic/name checks do not establish full WCAG conformance or caption accuracy.']};
const rules=['accesskeys','aria-command-name','aria-dialog-name','aria-input-field-name','aria-meter-name','aria-progressbar-name','aria-text','aria-toggle-field-name','aria-tooltip-name','aria-treeitem-name','bypass','definition-list','dlitem','duplicate-id-aria','form-field-multiple-labels','frame-title','html-xml-lang-mismatch','input-button-name','input-image-alt','link-in-text-block','list','listitem','meta-refresh','object-alt','select-name','skip-link','td-headers-attr','th-has-data-cells','video-caption','svg-img-alt','table-duplicate-name','empty-heading','aria-allowed-role','image-redundant-alt','identical-links-same-purpose','button-name','label','link-name','aria-valid-attr-value','aria-required-parent','aria-required-children','landmark-one-main','region'];
const browser=await chromium.launch({headless:true,...(process.env.LOCALAPPDATA?{executablePath:join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe')}:{})});
try{
for(const role of ['public','student-a','admin']){
const context=await browser.newContext({locale:'ar-SA',reducedMotion:'reduce',viewport:{width:1440,height:1080}});
if(role!=='public')await context.addCookies([{name:'meras_session',value:fixture.users.find(user=>user.role===role).token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'}]);
for(const route of role==='public'?['/','/courses','/login']:role==='student-a'?['/dashboard','/dashboard?view=orders','/study-tools','/learn/qa-physics']:['/admin']){
const page=await context.newPage();console.log(role+' '+route);
try{
await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('heading',{level:1}).first().waitFor({timeout:60000});
await page.waitForFunction(()=>document.documentElement.dataset.palette&&document.fonts.status==='loaded');
if(role==='admin')await page.locator('.admin-metrics').waitFor({timeout:45000});
await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
async function audit(state){const result=await page.evaluate(async({rules})=>{const available=axe.getRules().map(rule=>rule.ruleId);return await axe.run(document,{runOnly:{type:'rule',values:rules.filter(rule=>available.includes(rule))},resultTypes:['violations','incomplete','passes','inapplicable']});},{rules});
const compact=rows=>rows.map(row=>({id:row.id,impact:row.impact,description:row.description,help:row.help,helpUrl:row.helpUrl,nodes:row.nodes.map(node=>({target:node.target,html:node.html.slice(0,800),failureSummary:node.failureSummary}))}));
const semantics=await page.evaluate(()=>({accesskeys:[...document.querySelectorAll('[accesskey]')].map(e=>e.getAttribute('accesskey')),skipLinks:[...document.querySelectorAll('a[href^="#"]')].filter(e=>/تخط|skip/i.test(e.textContent||'')).map(e=>({text:e.textContent,href:e.getAttribute('href'),targetExists:Boolean(document.getElementById(e.hash.slice(1)))})),videos:[...document.querySelectorAll('video')].map(e=>({hasAudio:!e.muted,tracks:[...e.querySelectorAll('track')].map(t=>({kind:t.kind,language:t.srclang,label:t.label,hasSource:Boolean(t.src)}))})),divTables:[...document.querySelectorAll('.orders-table,.live-table')].map(e=>({class:e.className,role:e.getAttribute('role'),rows:e.querySelectorAll('[role="row"],tr').length}))}));
report.checks.push({role,route,state,violations:compact(result.violations),incomplete:compact(result.incomplete),passes:result.passes.map(r=>r.id),inapplicable:result.inapplicable.map(r=>r.id),semantics});writeFileSync(out+'/'+phase+'.json',JSON.stringify(report,null,2));}
await audit('default');
if(route==='/') { const search=page.getByRole('button',{name:/بحث/}).first();if(await search.isVisible()){await search.click();if(await page.getByRole('dialog').count())await audit('search-dialog');await page.keyboard.press('Escape');}}
if(route==='/admin') {const search=page.getByPlaceholder('ابحث في القسم الحالي...');await search.focus();await audit('admin-search');}
await page.screenshot({path:out+'/'+phase+'-'+role+'-'+(route==='/'?'home':route.slice(1).replaceAll(/[/?=]/g,'-'))+'.png'});
}catch(error){report.checks.push({role,route,error:error.message});writeFileSync(out+'/'+phase+'.json',JSON.stringify(report,null,2));}
finally{await page.close();}
}
await context.close();
}
}finally{await browser.close()}
console.log(JSON.stringify(report.checks.map(c=>({role:c.role,route:c.route,state:c.state,error:c.error,violations:c.violations?.map(v=>({id:v.id,count:v.nodes.length})),divTables:c.semantics?.divTables,skips:c.semantics?.skipLinks,videos:c.semantics?.videos})),null,2));
