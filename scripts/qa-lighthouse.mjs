import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
const paths=["/","/courses","/universities","/courses/qa-physics","/universities/qa-university","/universities/qa-university/specialties/qa-science","/bundles","/bundles/qa-science","/tools","/about","/faq","/how-it-works","/contact","/terms","/privacy","/refund-policy","/content-policy","/accessibility"];
mkdirSync("output/playwright",{recursive:true});mkdirSync("verification",{recursive:true});
const settings={onlyCategories:["seo"],networkQuietThresholdMs:0,pauseAfterLoadMs:1000,cpuQuietThresholdMs:1000};
const worker=process.argv[2];
if(worker!==undefined) {
 const rows=[];const workerId=Number(worker);
 const chrome=await launch({chromePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",chromeFlags:["--headless","--disable-gpu","--no-sandbox"]});
 try {
 for(const path of paths.filter((_,index)=>index%3===workerId)) {
  const name=path==="/"?"home":path.slice(1).replaceAll("/","-");
  const result=await lighthouse("http://127.0.0.1:3100"+path,{port:chrome.port,output:"json",logLevel:"error"},{extends:"lighthouse:default",settings});
  if(!result)throw new Error("No report for "+path);
  writeFileSync("output/playwright/lighthouse-"+name+".json",result.report);
  const seo=result.lhr.categories.seo;
  const failed=seo.auditRefs.map(a=>result.lhr.audits[a.id]).filter(a=>a.score!==null&&a.score<1).map(a=>({id:a.id,title:a.title,explanation:a.explanation}));
  const row={path,score:Math.round(seo.score*100),lighthouseVersion:result.lhr.lighthouseVersion,failed,warnings:result.lhr.runWarnings};
  rows.push(row);writeFileSync("verification/lighthouse-seo-part-"+workerId+".json",JSON.stringify(rows,null,2));console.log(JSON.stringify(row));
 }
 } finally {await chrome.kill()}
} else {
 for(const name of ["tools","home","courses"]) {const file="output/playwright/lighthouse-"+name+".json";const copy="output/playwright/lighthouse-default-"+name+".json";if(existsSync(file)&&!existsSync(copy))copyFileSync(file,copy)}
 await Promise.all([0,1,2].map(id=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[import.meta.filename,String(id)],{windowsHide:true,stdio:"inherit"});child.on("exit",code=>code?reject(new Error("Worker "+id+" failed")):resolve());child.on("error",reject)})));
 const pages=[0,1,2].flatMap(id=>JSON.parse(readFileSync("verification/lighthouse-seo-part-"+id+".json","utf8"))).sort((a,b)=>paths.indexOf(a.path)-paths.indexOf(b.path));
 writeFileSync("verification/lighthouse-seo.json",JSON.stringify({checkedAt:new Date().toISOString(),environment:"Loopback production build with synthetic database; mobile SEO category only",settings,measurementNote:"Network quiet wait is zero because host security software injects continuous polling. Load event, post-load pause and CPU quiet remain. Security software was not disabled or blocked. Default runs retained separately.",pages},null,2));
 if(pages.some(r=>r.score!==100||r.warnings.length))process.exitCode=1;
}
