import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {inspectPage,sitemapLocations,fetchSameOrigin,auditPublicSeo} from "../scripts/audit-public-seo.mjs";
import {isolatedSource} from "./helpers/isolated-source.mjs";
const html=url=>`<!doctype html><html lang="ar" dir="rtl"><head><title>مراس العلم</title><meta name="description" content="وصف صفحة تجريبية"><link rel="canonical" href="${url}"><meta property="og:image" content="/og.png"></head><body><h1>مراس العلم</h1><img alt="" src="/brand.png"><script type="application/ld+json">{"@type":"WebSite"}</script></body></html>`;
test("actual HTML audit detects noindex, canonical differences, missing alt and malformed JSON-LD",()=>{
 const good=inspectPage(html("https://site.test/"),"https://site.test/");assert.equal(good.issues.length,0);assert.equal(good.jsonLdBlocks,1);
 const bad=inspectPage(html("https://other.test/").replace('alt=""','').replace('{"@type":"WebSite"}','{invalid'),"https://site.test/",new Headers({"x-robots-tag":"noindex"}));
 for(const code of ["NOINDEX_PUBLIC_URL","CANONICAL_DIFFERS","IMAGE_ALT_MISSING","JSON_LD_INVALID"])assert.ok(bad.issues.some(row=>row.code===code));
});
test("sitemaps reject foreign URLs, deduplicate paths and decode XML entities",()=>{
 const x=sitemapLocations('<urlset><url><loc>https://site.test/a?x=1&amp;y=2</loc></url><url><loc>https://site.test/a?x=1&amp;y=2</loc></url><url><loc>https://evil.test/</loc></url></urlset>',"https://site.test");assert.equal(x.urls.length,1);assert.equal(x.duplicates,1);assert.equal(x.invalid.length,1);assert.equal(x.urls[0],"https://site.test/a?x=1&y=2");
});
test("bounded HTTP audit runs against a local fixture and never reports a Google/Lighthouse score",async()=>{
 const server=createServer((req,res)=>{const origin=`http://${req.headers.host}`;if(req.url==="/robots.txt"){res.setHeader("content-type","text/plain");res.end(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml`);}else if(req.url==="/sitemap.xml"){res.setHeader("content-type","application/xml");res.end(`<urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/courses/math</loc></url></urlset>`);}else if(req.url==="/redirect"){res.writeHead(302,{location:"https://foreign.test/"});res.end();}else if(req.url==="/large"){res.end("x".repeat(200));}else{res.setHeader("content-type","text/html");res.end(html(origin+req.url));}});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 try{const result=await auditPublicSeo(origin,1);assert.equal(result.audited,1);assert.equal(result.discovered,2);assert.equal(result.complete,false);assert.equal(result.errors,0);assert.equal(result.score,null);await assert.rejects(fetchSameOrigin(origin+"/redirect",origin),/Off-origin/);await assert.rejects(fetchSameOrigin(origin+"/large",origin,{maxBytes:50}),/byte limit/);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test("grouped sitemap preserves specialty/shared coverage without fabricated future dates",async()=>{
 const seo=await isolatedSource("lib/seo.ts",{process:{env:{NEXT_PUBLIC_SITE_URL:"https://site.test",NODE_ENV:"production"}}});const sitemap=await isolatedSource("lib/seo-sitemap.ts",seo);
 const courses=[{slug:"shared",universitySlug:"u",audienceScope:"institution",updatedAt:"2026-01-01"},{slug:"private",universitySlug:"hidden",updatedAt:"2025-01-01"}];const result=sitemap.buildPublicSitemap(courses,[{slug:"u"}],[{institutionSlug:"u",slug:"s",updatedAt:"2999-01-01"},{institutionSlug:"other",slug:"s"}]);
 assert.ok(result.some(x=>x.url==="https://site.test/universities/u/specialties/s"));assert.ok(!result.some(x=>x.url.includes("private")||x.url.includes("other")));assert.equal(result.find(x=>x.url.includes("/specialties/")).lastModified.toISOString(),"2026-01-01T00:00:00.000Z");
 const readiness=await isolatedSource("lib/seo-readiness.ts",{...seo,...sitemap});const report=readiness.buildSeoReadiness([{...courses[0],title:"Math",description:"short"}],[{slug:"u"}],[],{origin:"https://site.test",indexing:false,verification:false});assert.equal(report.score,null);assert.ok(report.findings.some(x=>x.code==="INDEXING_DISABLED"));assert.ok(report.findings.some(x=>x.code==="COURSE_DESCRIPTION_SHORT"));
});
