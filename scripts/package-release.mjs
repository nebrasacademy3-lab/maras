import {execFileSync} from "node:child_process";
import {existsSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,lstatSync,readdirSync} from "node:fs";
import {resolve,join,dirname,relative,sep} from "node:path";
import {createHash} from "node:crypto";
const root=process.cwd(),version=process.argv[2]||"2026-09-12",target=resolve("release","maras-"+version);
if(!/^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?$/.test(version))throw new Error("Invalid release suffix");
if(existsSync(target))throw new Error("Release directory already exists. Use a new version suffix.");
const listed=execFileSync("git",["ls-files","-z","--cached","--others","--exclude-standard"],{encoding:"utf8",maxBuffer:20*1024*1024}).split("\0").filter(Boolean);
const ignored=/^(?:\.git\/|\.codex\/|\.agents\/|\.playwright-cli\/|\.data\/|\.next\/|node_modules\/|mobile\/node_modules\/|mobile\/\.expo\/|mobile\/dist\/|outputs?\/|release\/|verification\/|work\/)/;
const files=listed.filter(p=>!ignored.test(p)&&!/(?:^|\/)\.env(?:$|\.(?!.*example$))/.test(p)&&!/(?:\.zip|\.log|\.tsbuildinfo|\.pem|\.p8|\.keystore|\.jks|\.p12|\.pfx|\.mobileprovision)$/.test(p)&&!/(?:google-services\.json|GoogleService-Info\.plist|(?:firebase-)?service-account[^/]*\.json)$/.test(p));
function walk(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){const p=join(directory,entry.name);if(entry.isDirectory())walk(p);else if(entry.isFile())files.push(relative(root,p).split(sep).join("/"));}}
// Current reports only; earlier audits are intentionally not relabelled as current verification.
const reports=["README_AR.md","coverage-matrix.csv","admin-report.md","admin-live-data.json","admin-live-security.json","admin-live-store-controls.json","file-services-live.json","migration-upgrade.json","service-reliability.json","store-integration.json","quality-gates.json","web-tests.tap","mobile-tests.tap","initial-admin.json","seo-report.md","seo-http.json","seo-head-before-fix.json","seo-sitemap-links.json","seo-sitemap-crawl.json","page-role-smoke.json","seo-browser-report.json","lighthouse-summary.json","lighthouse-seo.json","lighthouse-seo-before-head-fix.json","seo-head-after-fix.json","seo-build.json","npm-audit-production.json","mobile-npm-audit-production.json"];
for(const report of reports)if(existsSync(join("verification",report)))files.push("verification/"+report);
if(existsSync("verification/current-screenshots"))walk("verification/current-screenshots");
if(existsSync("verification/lighthouse"))walk("verification/lighthouse");
const manifest=[];
for(const path of [...new Set(files)].sort()){
 const source=resolve(root,path),destination=resolve(target,path);
 if(!source.startsWith(root+sep)||!destination.startsWith(target+sep)||!existsSync(source))continue;
 if(lstatSync(source).isSymbolicLink())throw new Error("Symlink excluded: "+path);
 const bytes=readFileSync(source);
 // Reject actual-looking service credentials, not environment variable names or public SDK IDs.
 if(/\.(?:[cm]?[jt]sx?|json|ya?ml|env|md|txt)$/.test(path)&&!path.startsWith("tests/")&&!path.startsWith("mobile/tests/")){
  const text=bytes.toString("utf8");
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)&&!path.endsWith(".example"))throw new Error("Private key-like material: "+path);
 }
 mkdirSync(dirname(destination),{recursive:true});copyFileSync(source,destination);
 manifest.push({path,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
}
writeFileSync(join(target,"RELEASE_MANIFEST.json"),JSON.stringify({version,createdAt:new Date().toISOString(),files:manifest},null,2));
console.log(JSON.stringify({directory:target,files:manifest.length,bytes:manifest.reduce((s,f)=>s+f.bytes,0)}));
