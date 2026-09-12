import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
const base="http://127.0.0.1:3100";
const origin="https://maras-qa.example";
const paths=["/","/courses","/universities","/courses/qa-physics","/universities/qa-university","/universities/qa-university/specialties/qa-science","/bundles","/bundles/qa-science","/tools","/about","/faq","/how-it-works","/contact","/terms","/privacy","/refund-policy","/content-policy","/accessibility"];
const pages=[];
for(const path of paths) {
  const response=await fetch(base+path,{redirect:"manual"});
  assert.equal(response.status,200,path);
  const html=await response.text();
  const title=html.match(/<title>(.*?)<\/title>/s)?.[1];
  const description=html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const robots=html.match(/<meta name="robots" content="([^"]+)"/)?.[1];
  const h1Count=[...html.matchAll(/<h1(?:\s|>)/g)].length;
  const jsonld=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  assert.ok(title,path+" title"); assert.ok(description,path+" description"); assert.ok(html.search(/<meta name=.description./)<html.indexOf("</head>"),path+" head description"); assert.equal(new URL(canonical).href,new URL(origin+path).href,path+" canonical"); assert.ok(!robots?.includes("noindex"),path+" indexable"); assert.ok(h1Count>=1,path+" server h1"); assert.ok(jsonld.length>=1,path+" structured data");
  assert.ok(!html.includes("أدوات مراس اختبار محلي"),"temporary SEO edit restored");
  pages.push({path,status:response.status,title,descriptionLength:description.length,canonical,robots,h1Count,structuredDataBlocks:jsonld.length});
}
const robots=[];
for(const bot of ["Googlebot","bingbot","OAI-SearchBot","PerplexityBot","GPTBot"]) {
 const r=await fetch(base+"/robots.txt",{headers:{"user-agent":bot}});const text=await r.text();
 assert.equal(r.status,200);assert.match(text,/Allow: \//);assert.match(text,/Disallow: \/api\//);assert.match(text,/Sitemap: https:\/\/maras-qa.example\/sitemap.xml/);assert.doesNotMatch(text,/Disallow: \/\r?\n/);
 const metadataPaths=["/tools","/universities","/about","/refund-policy"];
 for(const path of metadataPaths) {const page=await fetch(base+path,{headers:{"user-agent":bot}});const html=await page.text();assert.equal(page.status,200,bot+" "+path);const head=html.slice(0,html.indexOf("</head>"));assert.match(head,/<meta name="description" content="[^"]+"/,bot+" "+path+" head description");}
 robots.push({bot,status:r.status,publicAllowed:true,apiExcluded:true,headMetadataPages:metadataPaths});
}
const sitemap=await(await fetch(base+"/sitemap.xml")).text();
for(const path of paths)assert.ok(sitemap.includes("<loc>"+origin+path+"</loc>"),path+" sitemap");
assert.ok(!/<loc>[^<]*\/(admin|account|study-tools|api|checkout)(\/|<)/.test(sitemap));
const privatePaths=[];
for(const path of ["/admin/seo","/study-tools","/login","/courses?search=qa"]) {
 const r=await fetch(base+path,{redirect:"manual"});const body=await r.text();const noindex=(r.headers.get("x-robots-tag")||"").includes("noindex")||/<meta name="robots" content="[^"]*noindex/.test(body);assert.ok(noindex,path+" noindex");privatePaths.push({path,status:r.status,noindex});
}
assert.equal((await fetch(base+"/indexnow.txt")).status,404,"IndexNow opt-in disabled");
mkdirSync("verification",{recursive:true});
const result={checkedAt:new Date().toISOString(),environment:"loopback production build with synthetic database; no external search submissions",pages,robots,privatePaths,sitemapUrls:[...sitemap.matchAll(/<loc>/g)].length,temporarySeoEditRestored:true,indexNowDisabled:true};
writeFileSync("verification/seo-http.json",JSON.stringify(result,null,2));
console.log(JSON.stringify({publicPages:pages.length,botPolicies:robots.length,privateChecks:privatePaths.length,sitemapUrls:result.sitemapUrls,result:"passed"}));
