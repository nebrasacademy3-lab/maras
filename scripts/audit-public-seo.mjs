#!/usr/bin/env node
/** Bounded, read-only HTTP checks. No credentials; never follows off-origin redirects.
 * This is not Lighthouse, a full HTML validator, a Google index check, or a ranking score.
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function decodeEntities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, token => {
    const named={"&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">"};
    if(named[token.toLowerCase()]) return named[token.toLowerCase()];
    const hex=/^&#x/i.test(token);const code=Number.parseInt(token.slice(hex?3:2,-1),hex?16:10);
    return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):"";
  });
}
export function attributes(tag) {
  const output={};
  for(const item of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) output[item[1].toLowerCase()]=decodeEntities(item[2]??item[3]??item[4]??"");
  return output;
}
export function inspectPage(html,url,headers=new Headers()) {
  const issues=[];const add=(code,detail,severity="error")=>issues.push({code,detail,severity});
  const clean=html.replace(/<!--[\s\S]*?-->/g,"").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,"");
  const title=[...clean.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(row=>decodeEntities(row[1]).replace(/<[^>]*>/g,"").trim());
  if(title.length!==1||!title[0])add("TITLE_INVALID","Expected one nonempty page title");
  const meta=[...clean.matchAll(/<meta\b[^>]*>/gi)].map(row=>attributes(row[0]));
  const descriptions=meta.filter(row=>row.name?.toLowerCase()==="description");
  if(descriptions.length!==1||!descriptions[0]?.content?.trim())add("DESCRIPTION_INVALID","Expected one nonempty description");
  const canonical=[...clean.matchAll(/<link\b[^>]*>/gi)].map(row=>attributes(row[0])).filter(row=>row.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  if(canonical.length!==1||!canonical[0]?.href)add("CANONICAL_MISSING_OR_DUPLICATE","Expected one canonical URL");
  else {try {const href=new URL(canonical[0].href,url);if(href.href!==new URL(url).href)add("CANONICAL_DIFFERS",href.href);if(!/^https?:\/\//i.test(canonical[0].href))add("CANONICAL_RELATIVE","Prefer an absolute canonical URL","warning");}catch{add("CANONICAL_INVALID","Canonical is not a URL");}}
  const robots=[headers.get("x-robots-tag")||"",...meta.filter(row=>["robots","googlebot"].includes(row.name?.toLowerCase())).map(row=>row.content||"")].join(",");
  if(/\b(?:noindex|none)\b/i.test(robots))add("NOINDEX_PUBLIC_URL","A sitemap page is marked noindex");
  const h1=[...clean.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)].length;
  if(h1===0)add("H1_MISSING","No main heading found");else if(h1>1)add("MULTIPLE_H1","Review heading hierarchy","warning");
  const lang=attributes(clean.match(/<html\b[^>]*>/i)?.[0]||"").lang;
  if(!lang)add("LANG_MISSING","Document language is missing");
  for(const tag of meta.filter(row=>row.property?.toLowerCase()==="og:image"))if(!tag.content)add("OG_IMAGE_EMPTY","Empty sharing image","warning");
  if(!meta.some(row=>row.property?.toLowerCase()==="og:image"&&row.content))add("OG_IMAGE_MISSING","Sharing image is missing","warning");
  const images=[...clean.matchAll(/<img\b[^>]*>/gi)].map(row=>attributes(row[0]));
  const missingAlt=images.filter(row=>!("alt" in row)).length;
  if(missingAlt)add("IMAGE_ALT_MISSING",`${missingAlt} images have no alt attribute`,"warning");
  let jsonLdBlocks=0;
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))if(attributes(script[1]).type?.toLowerCase()==="application/ld+json") {jsonLdBlocks++;try{JSON.parse(script[2]);}catch{add("JSON_LD_INVALID","Structured data contains invalid JSON");}}
  return {url,title:title[0]||"",description:descriptions[0]?.content||"",h1,lang:lang||null,jsonLdBlocks,issues};
}
export async function fetchSameOrigin(url,origin,{maxBytes=2*1024*1024,timeoutMs=15000}={}) {
  let current=new URL(url);const signal=AbortSignal.timeout(timeoutMs);
  for(let redirects=0;redirects<=4;redirects++) {
    if(current.origin!==origin||current.username||current.password)throw new Error("Off-origin or credential-bearing URL rejected");
    const response=await fetch(current,{redirect:"manual",signal,headers:{"user-agent":"MerasSEOAudit/1.0",accept:"text/html,application/xml,text/plain"}});
    if([301,302,303,307,308].includes(response.status)) {await response.body?.cancel();const location=response.headers.get("location");if(!location)throw new Error("Redirect without location");current=new URL(location,current);continue;}
    const reader=response.body?.getReader();let bytes=0;const chunks=[];
    if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new Error("Response exceeds byte limit");}chunks.push(value);}}finally{reader.releaseLock();}}
    return {status:response.status,headers:response.headers,url:current.href,text:Buffer.concat(chunks).toString("utf8"),bytes};
  }
  throw new Error("Too many redirects");
}
export function sitemapLocations(xml,origin) {
  const paths=[...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map(row=>decodeEntities(row[1].trim()));
  const urls=[];const invalid=[];
  for(const path of paths) {try{const url=new URL(path);if(url.origin!==origin||url.username||url.password||url.hash)throw new Error();urls.push(url.href);}catch{invalid.push(path.slice(0,300));}}
  return {urls:[...new Set(urls)],invalid,index:/<sitemapindex\b/i.test(xml),duplicates:paths.length-new Set(urls).size-invalid.length};
}
export async function auditPublicSeo(base,limit=50) {
  const parsed=new URL(base);if(!["https:","http:"].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error("Use an HTTP(S) site origin without credentials");
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error("limit must be between 1 and 1000");
  const origin=parsed.origin;const issues=[];const add=(code,detail)=>issues.push({code,detail,severity:"error"});
  let robotsText="";
  try{const robots=await fetchSameOrigin(`${origin}/robots.txt`,origin);robotsText=robots.text;if(robots.status!==200)add("ROBOTS_HTTP_STATUS",String(robots.status));if(!/^sitemap:\s*https?:\/\//im.test(robots.text))issues.push({code:"ROBOTS_SITEMAP_MISSING",detail:"No absolute Sitemap directive",severity:"warning"});}catch(error){add("ROBOTS_FETCH_FAILED",error.message);}
  const discovered=new Set();const pending=[`${origin}/sitemap.xml`];const seen=new Set();
  while(pending.length&&seen.size<20) {
    const path=pending.shift();if(seen.has(path))continue;seen.add(path);
    try{const doc=await fetchSameOrigin(path,origin,{maxBytes:4*1024*1024});if(doc.status!==200){add("SITEMAP_HTTP_STATUS",`${path}: ${doc.status}`);continue;}const list=sitemapLocations(doc.text,origin);for(const invalid of list.invalid)add("SITEMAP_INVALID_OR_EXTERNAL_URL",invalid);if(list.duplicates)issues.push({code:"SITEMAP_DUPLICATES",detail:String(list.duplicates),severity:"warning"});
      if(list.index)pending.push(...list.urls);else {if(!/<urlset\b/i.test(doc.text))add("SITEMAP_NOT_URLSET",path);for(const url of list.urls)discovered.add(url);}
    }catch(error){add("SITEMAP_FETCH_FAILED",`${path}: ${error.message}`);}
  }
  if(pending.length)add("SITEMAP_CRAWL_LIMIT","Only the first 20 sitemap documents were inspected");
  if(!discovered.size)add("SITEMAP_EMPTY","No public URLs discovered");
  const queue=[...discovered].slice(0,limit);const pages=[];
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){const url=queue.shift();const target=new URL(url);
    if(/^\/(?:api|admin|dashboard|account|checkout|login|register)(?:\/|$)/i.test(decodeURIComponent(target.pathname))){add("PRIVATE_URL_IN_SITEMAP",url);continue;}
    try{const response=await fetchSameOrigin(url,origin);const result=inspectPage(response.text,url,response.headers);result.status=response.status;result.finalUrl=response.url;result.bytes=response.bytes;if(response.status!==200)result.issues.push({code:"PAGE_HTTP_STATUS",detail:String(response.status),severity:"error"});if(!/text\/html/i.test(response.headers.get("content-type")||""))result.issues.push({code:"NOT_HTML",detail:"Sitemap page is not HTML",severity:"error"});if(response.url!==url)result.issues.push({code:"SITEMAP_REDIRECT",detail:response.url,severity:"warning"});pages.push(result);}catch(error){pages.push({url,issues:[{code:"PAGE_FETCH_FAILED",detail:error.message,severity:"error"}]});}
  }}));
  const all=[...issues,...pages.flatMap(row=>row.issues)];
  return {generatedAt:new Date().toISOString(),origin,scope:"bounded_anonymous_HTTP_and_HTML_checks",score:null,discovered:discovered.size,audited:pages.length,sampleLimit:limit,complete:discovered.size<=limit&&!pending.length,errors:all.filter(row=>row.severity==="error").length,warnings:all.filter(row=>row.severity==="warning").length,issues,pages:pages.sort((a,b)=>a.url.localeCompare(b.url)),robotsText,limitations:["No Google indexing/ranking verification","No Lighthouse, JavaScript execution, performance or full accessibility measurement","Only same-origin URLs; redirects to www or other domains are reported, not followed","robots.txt is returned for review; a full user-agent-specific robots parser is not implemented"]};
}
export async function main(args=process.argv.slice(2)) {
  const values={};for(let i=0;i<args.length;i+=2){if(!["--base","--limit","--output"].includes(args[i])||args[i+1]===undefined)throw new Error("Usage: npm run seo:audit -- --base https://your-domain --limit 50 --output seo-audit.json");values[args[i]]=args[i+1];}
  if(!values["--base"])throw new Error("--base is required. No network requests are made without an explicit target.");
  const report=await auditPublicSeo(values["--base"],Number(values["--limit"]||50));const output=values["--output"]||"seo-audit.json";
  await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({output,audited:report.audited,discovered:report.discovered,errors:report.errors,warnings:report.warnings,score:null}));
  if(report.errors)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
