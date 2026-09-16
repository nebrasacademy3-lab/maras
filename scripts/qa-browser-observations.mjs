/** Evidence only: no request bodies, auth headers, field values, cookies or secret-bearing screenshots. */
export async function observeBrowserContext(context, observations, label) {
  const safe = text => String(text || '').replace(/https?:\/\/[^\s"']+/g, value => { try { const u=new URL(value);return u.origin+u.pathname; } catch {return '[url]';} }).slice(0,1400);
  await context.exposeBinding('__marasQaError', ({page}, value) => {
    observations.push({context:label,kind:value.kind,page:safe(page.url()),message:safe(value.message),stack:safe(value.stack)});
  });
  await context.addInitScript(() => {
    const report=(kind,message,stack)=>{void window.__marasQaError({kind,message:String(message||''),stack:String(stack||'')}).catch(()=>{});};
    window.addEventListener('error',e=>{if(e instanceof ErrorEvent)report('window-error',e.message,e.error?.stack);});
    window.addEventListener('unhandledrejection',e=>report('unhandled-rejection',e.reason?.message||e.reason,e.reason?.stack));
    window.addEventListener('securitypolicyviolation',e=>report('csp-violation',e.effectiveDirective+' '+e.blockedURI,''));
  });
  context.on('page',page=>{
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())observations.push({context:label,kind:'main-frame-navigation',page:safe(page.url())});});
    page.on('pageerror',e=>observations.push({context:label,kind:'playwright-pageerror',page:safe(page.url()),message:safe(e.message),stack:safe(e.stack)}));
    page.on('requestfailed',request=>observations.push({context:label,kind:'request-failed',page:safe(page.url()),url:safe(request.url()),reason:safe(request.failure()?.errorText)}));
  });
}
