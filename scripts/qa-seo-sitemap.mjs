import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const base="http://127.0.0.1:3100", origin="https://maras-qa.example";
const sitemap=await(await fetch(base+"/sitemap.xml")).text();
const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replaceAll("&amp;","&"));
assert.equal(new Set(urls).size,urls.length,"unique canonical sitemap URLs");
const rows=[];let next=0;
async function crawl() {while(next<urls.length) {
 const url=new URL(urls[next++]);assert.equal(url.origin,origin);assert.ok(!url.search&&!url.hash);
 const response=await fetch(base+url.pathname,{redirect:"manual"});const html=await response.text();
 const head=html.slice(0,html.indexOf("</head>"));
 const canonical=head.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
 const description=head.match(/<meta name="description" content="([^"]+)"/)?.[1];
 const title=head.match(/<title>(.*?)<\/title>/s)?.[1];
 const robots=head.match(/<meta name="robots" content="([^"]+)"/)?.[1];
 const passed=response.status===200&&Boolean(title&&description&&canonical)&&new URL(canonical).href===url.href&&!robots?.includes("noindex")&&/<h1(?:\s|>)/.test(html);
 rows.push({path:url.pathname,status:response.status,passed,headTitle:Boolean(title),headDescription:Boolean(description),canonical,robots});
}}
await Promise.all([crawl(),crawl(),crawl(),crawl()]);
rows.sort((a,b)=>a.path.localeCompare(b.path));
writeFileSync("verification/seo-sitemap-crawl.json",JSON.stringify({checkedAt:new Date().toISOString(),environment:"Every discovered sitemap URL fetched over loopback with synthetic production data",total:rows.length,passed:rows.filter(r=>r.passed).length,rows},null,2));
console.log(JSON.stringify({total:rows.length,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed)}));
assert.ok(rows.every(r=>r.passed),"every sitemap page is HTTP200 with matching canonical, head metadata, h1 and indexability");
