/*
 * Real SecureVideoPlayer + real application CSS. No DB, uploads, production calls, or user media.
 * NODE_PATH may point to the Codex Playwright runtime. Set PLAYWRIGHT_BROWSERS_PATH to the engine cache.
 * node scripts/verify-video-fullscreen.mjs [--baseline] [--engine=chromium|webkit|firefox]
 *   [--case=plain-fallback|transformed-legacy|learning-native|lifecycle]
 * --baseline reads the committed player/CSS with git show; it never changes the working tree.
 * Only generated reports, screenshots and synthetic fixtures are written under outputs/video-fullscreen.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium, webkit, firefox } = require("playwright");
const { build } = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const root = process.cwd();
const baseline = process.argv.includes("--baseline");
const engineFilter = process.argv.find(value => value.startsWith("--engine="))?.split("=")[1];
const caseFilter = process.argv.find(value => value.startsWith("--case="))?.split("=")[1];
const committed = file => execFileSync("git", ["show", "HEAD:" + file], { cwd: root, encoding: "utf8" });
const folder = path.resolve("outputs/video-fullscreen", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(folder, { recursive: true });
const cssFiles = Array.from(fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8").matchAll(/import "\.\/(.+?\.css)"/g), match => path.join(root, "app", match[1]));
const css = (await postcss([tailwind()]).process(cssFiles.map(file => baseline && ["globals.css", "additions.css"].includes(path.basename(file)) ? committed("app/" + path.basename(file)) : fs.readFileSync(file, "utf8")).join("\n"), { from: path.join(root, "app/globals.css") })).css;
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SecureVideoPlayer} from './components/secure-video-player';
const options=new URLSearchParams(location.search), scene=options.get('scene');
const player=<SecureVideoPlayer title="فيديو اختبار مستقل — مراجعة ملء الشاشة" source={options.get('format')==='webm'?'/fixture.webm':'/fixture.mp4'} courseSlug="qa-fixture" lessonId="qa-fixture-lesson" preview onTimeChange={seconds=>window.__qaTime=seconds}/>;
function App(){return scene==='learning'?<main className="learning-page"><header className="learning-header">مساحة التعلم — اختبار محلي</header><div className="learning-layout sidebar-closed"><aside className="lesson-sidebar"/><section className="learning-main"><div style={{height:360}}/><div className="learning-video-wrap">{player}</div><div style={{height:1000}}/></section></div></main>:<main><div style={{height:430}}/><section className="course-detail-body"><div className="container course-detail-layout"><div className="course-main-column" style={scene==='transformed'?{transform:'translateZ(0)',contain:'layout paint'}:undefined}><section className="course-preview-block"><header className="block-title"><h2>الدرس التجريبي</h2></header>{player}</section></div></div></section><div style={{height:1000}}/></main>}
const mounted=createRoot(document.getElementById('root'));mounted.render(<App/>);window.__qaUnmount=()=>mounted.unmount();`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, sourcefile: "qa-video-entry.tsx", loader: "tsx" }, bundle: true, write: false, outfile: path.join(folder,"player-fixture.js"), format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "qa-boundaries", setup(plugin) { plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: "unused-link", namespace: "qa-unused" })); plugin.onLoad({ filter: /.*/, namespace: "qa-unused" }, () => ({ contents: "export default function Link(){throw new Error('Next navigation is not used by this video fixture')}" })); if(baseline)plugin.onLoad({filter:/[\\/]secure-video-player\.tsx$/},()=>({contents:committed("components/secure-video-player.tsx"),loader:"tsx",resolveDir:path.join(root,"components")})); } }], logLevel: "silent" });
const browser = await chromium.launch({ headless: true, channel: process.env.MARAS_TEST_BROWSER || "msedge" });
let media;
// Generate ten-second animated, silent H.264 and VP8 fixtures, never from the user's videos.
const generator = await browser.newPage();
try {
  media = await generator.evaluate(async () => {
    const mime = "video/mp4;codecs=avc1.42001E";
    if (!MediaRecorder.isTypeSupported(mime)) throw new Error("This browser cannot generate the local H.264 fixture");
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext("2d"); const chunks = []; const stream = canvas.captureStream(12);
    const webmChunks = [], webmRecorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 300000 });
    webmRecorder.ondataavailable = event => { if (event.data.size) webmChunks.push(event.data); };
    const webmDone = new Promise(resolve => webmRecorder.onstop = resolve);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 300000 });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const done = new Promise(resolve => recorder.onstop = resolve); const started = performance.now(); let frame;
    const draw = () => { const seconds = (performance.now() - started) / 1000; const gradient = context.createLinearGradient(0,0,640,360); gradient.addColorStop(0,"#1258e8"); gradient.addColorStop(1,"#7445f5"); context.fillStyle=gradient;context.fillRect(0,0,640,360);context.fillStyle="#fff";context.font="bold 36px Arial";context.fillText("MERAS VIDEO QA",70,130);context.fillText(seconds.toFixed(1)+" seconds",70,185);context.fillRect(30+(seconds*55)%520,250,70,25);}; draw(); recorder.start();webmRecorder.start();frame=setInterval(draw,80);
    await new Promise(resolve=>setTimeout(resolve,10000));recorder.stop();webmRecorder.stop();await Promise.all([done,webmDone]);clearInterval(frame);stream.getTracks().forEach(track=>track.stop());
    const encode = async chunks => { const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer()); let binary="";for(let index=0;index<bytes.length;index++)binary+=String.fromCharCode(bytes[index]);return btoa(binary); };
    return {base64:await encode(chunks),webmBase64:await encode(webmChunks),mime};
  });
} finally { await generator.close(); }
const mediaBytes = Buffer.from(media.base64, "base64");
let webmBytes = Buffer.from(media.webmBase64, "base64");
const enginesFolder = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(root,"outputs/browser-engines");
const ffmpegFolder = fs.existsSync(enginesFolder) ? fs.readdirSync(enginesFolder).find(name => name.startsWith("ffmpeg-")) : null;
const ffmpeg = process.env.MARAS_QA_FFMPEG || (ffmpegFolder ? path.join(enginesFolder,ffmpegFolder,process.platform === "win32" ? "ffmpeg-win64.exe" : "ffmpeg-linux") : null);
if (ffmpeg && fs.existsSync(ffmpeg)) {
  // Only remux generated bytes. A seekable WebM avoids Firefox treating Chromium's fragmented MP4 as one short fragment.
  const webmOutput = path.join(folder,"synthetic-fixture.webm");
  execFileSync(ffmpeg,["-hide_banner","-loglevel","error","-i","pipe:0","-c","copy",webmOutput],{input:webmBytes,stdio:["pipe","pipe","pipe"]});
  webmBytes = fs.readFileSync(webmOutput);
}
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8");response.end('<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/player.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');return; }
  if (url.pathname === "/app.css") { response.setHeader("Content-Type","text/css");response.end(css);return; }
  if (url.pathname === "/app.js") { response.setHeader("Content-Type","text/javascript");response.end(bundle.outputFiles.find(file=>file.path.endsWith('.js')).contents);return; }
  if (url.pathname === "/player.css") { response.setHeader("Content-Type","text/css");response.end(bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.contents || "");return; }
  if (url.pathname === "/fixture.mp4" || url.pathname === "/fixture.webm") {
    const bytes = url.pathname.endsWith(".webm") ? webmBytes : mediaBytes;
    response.setHeader("Content-Type",url.pathname.endsWith(".webm") ? "video/webm" : "video/mp4");response.setHeader("Accept-Ranges","bytes");response.setHeader("Cache-Control","no-store");
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || "");
    if(range){const start=Number(range[1]),end=Math.min(bytes.length-1,range[2]?Number(range[2]):bytes.length-1);if(start>end){response.writeHead(416,{"Content-Range":`bytes */${bytes.length}`});response.end();return;}response.writeHead(206,{"Content-Range":`bytes ${start}-${end}/${bytes.length}`,"Content-Length":end-start+1});response.end(bytes.subarray(start,end+1));return;}
    response.setHeader("Content-Length",bytes.length);response.end(bytes);return;
  }
  if (url.pathname === "/api/progress") { response.writeHead(204);response.end();return; }
  if (/^\/(brand|fonts)\//.test(url.pathname)) { const file = path.resolve(root,"public","."+decodeURIComponent(url.pathname));const allowed=path.resolve(root,"public")+path.sep;if(file.startsWith(allowed)&&fs.existsSync(file)&&fs.statSync(file).isFile()){response.setHeader("Content-Type",file.endsWith(".woff2")?"font/woff2":file.endsWith(".png")?"image/png":"application/octet-stream");response.end(fs.readFileSync(file));return;} }
  response.writeHead(404);response.end();
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const results = [];
const engines = [{name:"chromium",browser}];
for(const [name,engine] of [["webkit",webkit],["firefox",firefox]]){
  if(fs.existsSync(engine.executablePath()))try{engines.push({name,browser:await engine.launch({headless:true})});}catch(error){results.push({engine:name,status:"unavailable",reason:error.message});}
  else results.push({engine:name,status:"unavailable",reason:"Playwright engine is not installed; no Safari/device claim is made"});
}
async function geometry(page) {
  return page.evaluate(()=>{const shell=document.querySelector('.secure-player'),video=shell.querySelector('video'),stage=shell.querySelector('.secure-player-stage');const rect=element=>{const box=element.getBoundingClientRect();return{x:box.x,y:box.y,width:box.width,height:box.height,right:box.right,bottom:box.bottom}};return{viewport:{width:innerWidth,height:innerHeight},shell:rect(shell),video:rect(video),stage:rect(stage),time:video.currentTime,duration:video.duration,videoWidth:video.videoWidth,readyState:video.readyState,paused:video.paused,identity:video===window.__qaVideo,fullscreen:document.fullscreenElement===shell,cssFullscreen:shell.classList.contains('browser-fullscreen'),popover:shell.matches(':popover-open'),bodyOverflow:document.body.style.overflow,scrollY,innerScroll:document.querySelector('.learning-main')?.scrollTop||0,controls:Array.from(shell.querySelectorAll('.video-controls button,.video-progress')).map(element=>({label:element.getAttribute('aria-label')||element.textContent,visible:!!element.getClientRects().length,...rect(element)}))}});
}
function assertFrameInside(value) {
  const {viewport,shell,video}=value;
  assert.ok(shell.x>=-2&&shell.y>=-2&&shell.right<=viewport.width+2&&shell.bottom<=viewport.height+2, "Fullscreen shell escapes viewport: "+JSON.stringify(value));
  assert.ok(Math.abs(shell.width-viewport.width)<=3&&Math.abs(shell.height-viewport.height)<=3, "Fullscreen shell is constrained by an ancestor/max-height: "+JSON.stringify(value));
  assert.ok(video.width>100&&video.height>100&&video.x>=-3&&video.y>=-3&&video.right<=viewport.width+3&&video.bottom<=viewport.height+3,"Video frame is clipped or missing: "+JSON.stringify(value));
  assert.ok(value.identity,"The video element was replaced during fullscreen");
  for(const control of value.controls.filter(item=>item.visible))assert.ok(control.x>=-3&&control.y>=-3&&control.right<=viewport.width+3&&control.bottom<=viewport.height+3,"Control outside fullscreen: "+JSON.stringify(control));
}
async function assertControlsClickable(page,settingsOpen=false) {
  const targets=await page.evaluate(selector=>Array.from(document.querySelectorAll(selector)).filter(button=>!button.disabled&&button.getClientRects().length).map(button=>{const box=button.getBoundingClientRect();const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return{label:button.getAttribute('aria-label')||button.textContent,clickable:!!hit&&(hit===button||button.contains(hit)),interceptor:hit?.closest('button')?.getAttribute('aria-label')||hit?.className||null};}),settingsOpen?'.player-settings button,.video-exit-fullscreen':'.video-controls button,.video-exit-fullscreen');
  assert.deepEqual(targets.filter(target=>!target.clickable),[],'A fullscreen control is covered by another element');return targets;
}
async function runCase(engine,scene,mode,viewport,theme) {
  const fallback=mode!=='native';const context=await engine.browser.newContext({viewport,hasTouch:engine.name==='chromium'&&viewport.width<600,reducedMotion:"reduce"});const page=await context.newPage();page.setDefaultTimeout(12_000);page.setDefaultNavigationTimeout(45_000);const errors=[];page.on("pageerror",error=>errors.push(error.message));const item={engine:engine.name,scene,mode,viewport,theme};
  try {
    await page.goto(`${baseURL}/?scene=${scene}&format=${engine.name === 'firefox' ? 'webm' : 'mp4'}`,{waitUntil:"load"});
    await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&video.readyState>=2&&video.videoWidth>0&&Number.isFinite(video.duration)&&video.duration>3;});
    if(theme==='dark')await page.evaluate(()=>document.documentElement.classList.add('dark'));
    await page.locator('.secure-player').scrollIntoViewIfNeeded();
    await page.evaluate(()=>{const scroller=document.querySelector('.learning-main');if(scroller)scroller.scrollTop=150;else window.scrollTo({top:200,behavior:'instant'});});
    await page.evaluate(()=>{const video=document.querySelector('video');window.__qaVideo=video;video.pause();video.currentTime=1.8;video.muted=true;video.loop=true;});
    await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-1.8)<.1&&!document.querySelector('video').seeking);
    if(fallback)await page.locator('.secure-player').evaluate((shell,legacy)=>{shell.requestFullscreen=legacy?undefined:async()=>{throw new DOMException('Fullscreen disabled for fallback QA','NotAllowedError')};shell.webkitRequestFullscreen=undefined;if(legacy){shell.showPopover=undefined;shell.hidePopover=undefined;}},mode==='legacy');
    const originalStyles=await page.evaluate(()=>({html:document.documentElement.style.cssText,body:document.body.style.cssText,parent:document.querySelector('.course-main-column')?.style.cssText||''}));
    await page.getByRole('button',{name:'ملء الشاشة',exact:true}).scrollIntoViewIfNeeded();
    const before=await geometry(page);item.before=before;
    await page.getByRole('button',{name:'ملء الشاشة',exact:true}).click();
    await page.getByRole('button',{name:'إنهاء ملء الشاشة',exact:true}).waitFor();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const expanded=await geometry(page);item.expanded=expanded;item.resolvedMode=expanded.fullscreen?'native':expanded.popover?'viewport-popover':'viewport-legacy';assertFrameInside(expanded);assert.ok(Math.abs(expanded.time-before.time)<.2,'Playback time reset during fullscreen');
    item.normalControlHitTargets=await assertControlsClickable(page);
    const brand=await page.locator('.video-brand .brand-logo-word').evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);const box=range.getBoundingClientRect();return{x:box.x,y:box.y,right:box.right,bottom:box.bottom}});item.brand=brand;
    assert.ok(brand.x>=0&&brand.y>=0&&brand.right<=expanded.viewport.width&&brand.bottom<=expanded.viewport.height,'Brand name is clipped at fullscreen edge');
    if(mode==='native'&&engine.name==='chromium')assert.equal(expanded.fullscreen,true,'Native shell fullscreen did not activate');
    await page.getByRole('button',{name:'الإعدادات',exact:true}).click();
    item.settingsHitTargets=await assertControlsClickable(page,true);
    const settings=await page.locator('.player-settings').boundingBox();assert.ok(settings.x>=-2&&settings.y>=-2&&settings.x+settings.width<=expanded.viewport.width+2&&settings.y+settings.height<=expanded.viewport.height+2,'Settings are clipped in fullscreen');
    await page.locator('.player-settings').getByRole('button',{name:'1.5×',exact:true}).click();assert.equal(await page.locator('video').evaluate(video=>video.playbackRate),1.5);
    await page.locator('.player-settings > div button').click();
    await page.locator('.player-settings').waitFor({state:'hidden'});await assertControlsClickable(page);
    await page.locator('.video-controls-main').getByRole('button',{name:'تشغيل',exact:true}).click();
    const startTime=await page.locator('video').evaluate(video=>video.currentTime);await page.waitForFunction(time=>document.querySelector('video').currentTime>time+.2,startTime);
    await page.locator('.video-controls-main').getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();
    await page.getByRole('button',{name:'تدوير المشغل',exact:true}).click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));assertFrameInside(await geometry(page));
    item.rotatedControlHitTargets=await assertControlsClickable(page);
    await page.getByRole('button',{name:'الإعدادات',exact:true}).click();const rotatedSettings=await page.locator('.player-settings').boundingBox();assert.ok(rotatedSettings.x>=-2&&rotatedSettings.y>=-2&&rotatedSettings.x+rotatedSettings.width<=expanded.viewport.width+2&&rotatedSettings.y+rotatedSettings.height<=expanded.viewport.height+2,'Rotated settings are clipped');item.rotatedSettingsHitTargets=await assertControlsClickable(page,true);await page.screenshot({path:path.join(folder,`${engine.name}-${scene}-${mode}-${viewport.width}-${theme}-rotated-settings.png`)});await page.locator('.player-settings > div button').click();
    await page.locator('.player-settings').waitFor({state:'hidden'});await assertControlsClickable(page);
    await page.getByRole('button',{name:'تدوير المشغل',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.secure-player').classList.contains('video-rotated'));
    if(fallback){await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>Math.abs(document.querySelector('.secure-player').getBoundingClientRect().width-innerWidth)<3);assertFrameInside(await geometry(page));await page.setViewportSize(viewport);await page.waitForFunction(()=>Math.abs(document.querySelector('.secure-player').getBoundingClientRect().width-innerWidth)<3);}
    await page.screenshot({path:path.join(folder,`${engine.name}-${scene}-${mode}-${viewport.width}-${theme}.png`)});
    const fullTime=await page.locator('video').evaluate(video=>video.currentTime);
    await page.getByRole('button',{name:'إنهاء ملء الشاشة',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement&&!document.querySelector('.secure-player').classList.contains('browser-fullscreen'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const restored=await geometry(page);item.restored=restored;assert.equal(restored.identity,true);assert.ok(Math.abs(restored.time-fullTime)<.2);assert.equal(restored.bodyOverflow,before.bodyOverflow);assert.ok(Math.abs(restored.scrollY-before.scrollY)<=3&&Math.abs(restored.innerScroll-before.innerScroll)<=3,'Scroll position changed on exit');
    assert.deepEqual(await page.evaluate(()=>({html:document.documentElement.style.cssText,body:document.body.style.cssText,parent:document.querySelector('.course-main-column')?.style.cssText||''})),originalStyles,'Temporary parent/document styles were not restored');
    const visual=await page.locator('.secure-player').evaluate(shell=>({color:getComputedStyle(shell.querySelector('.video-controls button')).color,fit:getComputedStyle(shell.querySelector('video')).objectFit,slowAnimations:Array.from(shell.querySelectorAll('*')).filter(element=>{const style=getComputedStyle(element);return style.animationName!=='none'&&style.animationDuration.split(',').some(value=>parseFloat(value)>.02&&!value.trim().endsWith('ms'));}).length}));assert.equal(visual.color,'rgb(255, 255, 255)');assert.equal(visual.fit,'contain');assert.equal(visual.slowAnimations,0);
    if(fallback){await page.locator('.video-controls-main').getByRole('button',{name:'تشغيل',exact:true}).click();const liveStart=await page.locator('video').evaluate(video=>video.currentTime);await page.getByRole('button',{name:'ملء الشاشة',exact:true}).click();await page.getByRole('button',{name:'إنهاء ملء الشاشة',exact:true}).waitFor();await page.waitForFunction(seconds=>document.querySelector('video')===window.__qaVideo&&document.querySelector('video').currentTime>seconds+.15,liveStart);await page.keyboard.press('Escape');await page.getByRole('button',{name:'ملء الشاشة',exact:true}).waitFor();assert.equal((await geometry(page)).bodyOverflow,before.bodyOverflow);await page.locator('.video-controls-main').getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();await page.getByRole('button',{name:'ملء الشاشة',exact:true}).click();await page.getByRole('button',{name:'إنهاء ملء الشاشة',exact:true}).waitFor();await page.evaluate(()=>window.__qaUnmount());await page.waitForFunction(()=>!document.querySelector('.secure-player'));assert.equal(await page.evaluate(()=>document.body.style.overflow),before.bodyOverflow);}
    assert.deepEqual(errors,[]);item.status='passed';item.identityAndTimePreserved=true;item.playbackAdvances=true;item.settingsAndRotation=true;item.scrollRestored=true;item.stylesRestored=true;item.reducedMotionAndColors=true;item.escapeAndCleanup=fallback;
  }catch(error){item.status='failed';item.error=error.message;item.runtimeErrors=errors;item.failedGeometry=await geometry(page).catch(()=>undefined);await page.screenshot({path:path.join(folder,`failure-${engine.name}-${scene}-${mode}-${viewport.width}-${theme}.png`)}).catch(()=>undefined);}
  finally{await context.close();}results.push(item);console.log(JSON.stringify({engine:engine.name,scene,mode,viewport,theme,status:item.status,error:item.error?.slice(0,400),expanded:item.expanded?{shell:item.expanded.shell,time:item.expanded.time,identity:item.expanded.identity,native:item.expanded.fullscreen,popover:item.expanded.popover}:undefined}));
}
async function runPendingCase(engine,action) {
  const context=await engine.browser.newContext({viewport:{width:390,height:800},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(12_000);page.setDefaultNavigationTimeout(45_000);
  const item={engine:engine.name,scene:'pending-request',action},errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(`${baseURL}/?scene=learning&format=${engine.name==='firefox'?'webm':'mp4'}`);
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    await page.locator('.secure-player').evaluate(shell=>{window.__qaVideo=shell.querySelector('video');shell.requestFullscreen=()=>new Promise(()=>{});shell.webkitRequestFullscreen=undefined;});
    const before=await page.evaluate(()=>document.body.style.cssText);
    const button=page.getByRole('button',{name:'ملء الشاشة',exact:true});await button.click();
    if(action==='double-click')await button.click();
    else if(action==='escape')await page.keyboard.press('Escape');
    else if(action==='unmount')await page.evaluate(()=>window.__qaUnmount());
    if(action==='watchdog') {
      await page.getByRole('button',{name:'إنهاء ملء الشاشة',exact:true}).waitFor();assertFrameInside(await geometry(page));
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
      await page.getByRole('button',{name:'ملء الشاشة',exact:true}).waitFor();
    } else await page.waitForTimeout(1750);
    const after=await page.evaluate(()=>({body:document.body.style.cssText,fullscreen:!!document.fullscreenElement,cssFullscreen:!!document.querySelector('.secure-player.browser-fullscreen'),popover:!!document.querySelector('.secure-player:popover-open'),mounted:!!document.querySelector('.secure-player'),same:document.querySelector('video')===window.__qaVideo}));
    assert.equal(after.body,before,'Pending fullscreen left a body scroll lock');assert.equal(after.fullscreen,false);assert.equal(after.cssFullscreen,false);assert.equal(after.popover,false);assert.equal(after.mounted,action!=='unmount');if(action!=='unmount')assert.equal(after.same,true);assert.deepEqual(errors,[]);
    item.status='passed';item.cleanup=after;
  } catch(error) {item.status='failed';item.error=error.message;item.runtimeErrors=errors;await page.screenshot({path:path.join(folder,`failure-${engine.name}-pending-${action}.png`)}).catch(()=>undefined);}
  finally{await context.close();}results.push(item);console.log(JSON.stringify(item));
}
try {
  for(const engine of engines.filter(item => !engineFilter || item.name === engineFilter))for(const [scene,mode,width,theme] of [["plain","fallback",360,"light"],["transformed","fallback",360,"light"],["learning","fallback",390,"dark"],["transformed","legacy",360,"dark"],["learning","legacy",390,"light"],["plain","native",360,"dark"],["learning","native",1440,"light"]])if(!caseFilter || caseFilter === `${scene}-${mode}`)await runCase(engine,scene,mode,{width,height:800},theme);
  if(!baseline&&(!caseFilter||caseFilter==='lifecycle'))for(const engine of engines.filter(item=>!engineFilter||item.name===engineFilter))for(const action of ['double-click','escape','unmount','watchdog'])await runPendingCase(engine,action);
}finally{for(const engine of engines)await engine.browser.close();await new Promise(resolve=>server.close(resolve));}
const verified=results.filter(item=>item.status!=='unavailable');const report={ok:verified.length>0&&verified.every(item=>item.status==='passed'),baseline,fixture:{source:'locally generated animated canvas',mp4Bytes:mediaBytes.length,mp4Mime:media.mime,webmBytes:webmBytes.length,webmMime:'video/webm;codecs=vp8',formatsByEngine:{chromium:'MP4',webkit:'MP4',firefox:'WebM'}},results,screenshots:folder,limits:['Real SecureVideoPlayer component and actual CSS; mocked source/progress endpoint only; unused Next Link import isolated','No database, signed-session, upload, DRM, production network, Safari device, or OS screen-recording assertion','Firefox native fullscreen uses its actual desktop window size, not the requested mobile viewport; mobile fallback/legacy retain their requested widths']};
fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,passed:verified.filter(item=>item.status==='passed').length,total:verified.length,screenshots:folder}));if(!report.ok)process.exitCode=1;
