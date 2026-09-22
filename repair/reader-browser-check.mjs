import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const root=path.join(process.env.RUNNER_TEMP,'reader-web'),out=path.join(process.env.RUNNER_TEMP,'reader-browser-evidence');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let rel;try{rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end();return;}let file=path.resolve(root,'.'+rel);if(!file.startsWith(root+path.sep))file=path.join(root,'index.html');if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const courses=Array.from({length:200},(_,i)=>({slug:'course-'+i,title:'مادة اختبار '+i,titleEn:'Test Course '+i,code:'TEST'+i,university:'جامعة تجريبية',universitySlug:'test',specialty:'رياضيات',description:'محتوى تجريبي معزول',price:99,rating:4.8,ratingsCount:2,students:1,duration:'ساعة',lessons:1,instructor:'شارح تجريبي',color:'blue',icon:'book',featured:i<4,availableForPurchase:true,access:'available',units:[]}));
const requests=[],blocked=[],reports=[],errors=[];
const browser=await chromium.launch({headless:true});let activePage;
try {
 for(const theme of ['light','dark'])for(const width of [320,390,768,1024]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(({theme})=>{localStorage.setItem('meras_theme',theme);localStorage.setItem('meras_language','ar');localStorage.setItem('meras_font_scale','1.2');},{theme});
  await context.route('**/*',async route=>{
   const r=route.request(),url=new URL(r.url());
   if(url.origin===origin)return route.continue();
   if(url.hostname!=='marasalelm.com'){blocked.push(url.origin);return route.abort();}
   requests.push({path:url.pathname,method:r.method()});
   const headers={'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,OPTIONS'};
   if(r.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(r.method()!=='GET'){blocked.push(r.method()+' '+url.pathname);return route.fulfill({status:403,headers,json:{ok:false}});}
   let body={ok:true};
   switch(url.pathname){
    case '/api/mobile/catalog':body={ok:true,courses,institutions:[{slug:'test',name:'جامعة تجريبية',nameEn:'Test University',region:'منطقة تجريبية',type:'public',specialties:1,courses:200}]};break;
    case '/api/public/settings':body={ok:true,settings:{first_platform_claim_text:'أول منصة سعودية رسمية',announcement:'',payment_methods_marketing_enabled:'true'}};break;
    case '/api/public/announcements':body={ok:true,announcements:[]};break;
    case '/api/public/partners':body={ok:true,partners:[]};break;
    case '/api/public/learning-tracks':body={ok:true,tracks:[]};break;
    case '/api/sync':body={ok:true,channels:{catalog:'1'}};break;
    case '/api/auth/me':body={ok:true,user:null};break;
    case '/api/catalog/programs':body={ok:true,programs:[{name:'رياضيات'}]};break;
    default:body={ok:true,notifications:[],activeSlugs:[]};
   }
   return route.fulfill({status:200,headers,json:body});
  });
  const page=await context.newPage();activePage=page;page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.goto(origin+'/(tabs)',{waitUntil:'networkidle'});
  await page.getByText('اكتشف موادك',{exact:true}).waitFor();
  const copy=await page.locator('body').innerText();
  assert.ok(!copy.includes('أول منصة سعودية رسمية'));assert.ok(!copy.includes('تعلّم اليوم، واختر طريقة الدفع'));
  await page.screenshot({path:`${out}/home-${theme}-${width}.png`});
  let fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(fit.scroll<=fit.width+2,JSON.stringify({theme,width,home:fit}));
  await page.goto(origin+'/courses',{waitUntil:'networkidle'});
  await page.getByText('تصفية المواد',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/courses-${theme}-${width}.png`});
  fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(fit.scroll<=fit.width+2,JSON.stringify({theme,width,courses:fit}));
  const mounted=await page.getByText(/^مادة اختبار \d+$/).count();assert.ok(mounted<100,'virtualized list should not mount all 200 rows: '+mounted);
  const search=page.getByPlaceholder('اسم المادة، الرمز، الجامعة أو التخصص');await search.fill('NO-MATCH');await page.getByText('لا توجد نتائج',{exact:true}).waitFor();await search.fill('TEST199');await page.getByText('مادة اختبار 199',{exact:true}).waitFor();
  reports.push({theme,width,fontScale:1.2,home:true,courses:true,search:true,mountedOf200:mounted,overflow:false});
  await context.close();activePage=null;
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 fs.writeFileSync(out+'/report.json',JSON.stringify({commit:process.env.REVIEW_HEAD,passed:reports.length,reports,clientExceptions:errors,network:'All API responses synthetic; no production access',native:false,physical:false,blockedOrigins:[...new Set(blocked)],apiPaths:[...new Set(requests.map(x=>x.path))]},null,2));
 console.log(JSON.stringify({passed:reports.length,reports,errors}));
} catch(e){if(activePage){await activePage.screenshot({path:out+'/failed.png'}).catch(()=>{});fs.writeFileSync(out+'/failed-page.txt',await activePage.locator('body').innerText().catch(()=>''));}fs.writeFileSync(out+'/failure.json',JSON.stringify({error:String(e.stack),errors,requests,blocked},null,2));console.error(e);process.exitCode=1;}finally{await browser.close();await new Promise(r=>server.close(r));}
