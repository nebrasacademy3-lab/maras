import assert from 'node:assert/strict';
/** Await finite startup traffic, not networkidle (the production EventSource intentionally stays open).
 * Waiting for the inline palette script alone never proved React had mounted. A second hard navigation
 * during that interval can cancel initialization before the page's pagehide listeners even exist.
 * No traffic is mocked, intercepted, blocked or ignored; missing/failed startup responses fail the check.
 */
export async function navigatePublicPage(page,url,{reload=false}={}) {
  const expected=['/api/auth/me','/api/public/announcements','/api/public/settings','/api/sync'];
  const responseWaits=expected.map(path=>page.waitForResponse(response=>{
    const actual=new URL(response.url());return actual.origin===new URL(url).origin&&actual.pathname===path&&response.request().method()==='GET';
  },{timeout:30000}).then(async response=>{
    assert.ok(response.ok()||(path==='/api/auth/me'&&response.status()===401),`${path}: HTTP ${response.status()}`);
    await response.finished();return path;
  }));
  const pending=new Set();let changed=Date.now();
  const started=request=>{if(request.resourceType()==='eventsource'||new URL(request.url()).pathname==='/api/sync/stream')return;pending.add(request);changed=Date.now();};
  const ended=request=>{pending.delete(request);changed=Date.now();};
  page.on('request',started);page.on('requestfinished',ended);page.on('requestfailed',ended);
  // Observe all startup promises immediately: a navigation exception must not leave rejected waiters unhandled.
  const readiness=Promise.all(responseWaits);void readiness.catch(()=>{});
  try {
    const response=reload?await page.reload({waitUntil:'load'}):await page.goto(url,{waitUntil:'load'});
    assert.equal(response.status(),200,url);
    await readiness;
    await page.locator('h1').first().waitFor({state:'visible'});
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    const start=Date.now();
    while(pending.size||Date.now()-changed<150){
      if(Date.now()-start>15000)throw new Error(`Finite startup did not settle: ${[...pending].map(r=>new URL(r.url()).pathname).join(', ')}`);
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    return response;
  } finally {page.off('request',started);page.off('requestfinished',ended);page.off('requestfailed',ended);}
}
