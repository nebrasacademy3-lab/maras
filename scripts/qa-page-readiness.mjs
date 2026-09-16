import assert from 'node:assert/strict';

/** Await real, finite startup traffic. The production event stream intentionally stays open.
 * Every phase shares one deadline: headers alone do not prove a body finished, and a hidden
 * document may never execute requestAnimationFrame. Neither case may hang the entire CI job.
 * Missing responses, failed response bodies and page exceptions are not filtered or mocked.
 */
export async function navigatePublicPage(page, url, {reload=false, timeout=30000}={}) {
  assert.ok(Number.isFinite(timeout) && timeout > 0, 'Positive readiness timeout required');
  const destination = new URL(url), deadline = Date.now() + timeout;
  const remaining = () => Math.max(1, deadline - Date.now());
  const bounded = async (promise, phase) => {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Public readiness timed out during ${phase}: ${destination.pathname}`)), remaining());
      })]);
    } finally { clearTimeout(timer); }
  };
  // Authentication is optional on public pages; protected flows validate it separately.
  const expected = ['/api/public/announcements', '/api/public/settings', '/api/sync'];
  const responseWaits = expected.map(path => bounded(page.waitForResponse(response => {
    const actual = new URL(response.url());
    return actual.origin === destination.origin && actual.pathname === path && response.request().method() === 'GET';
  }, {timeout:remaining()}).then(async response => {
    assert.ok(response.ok(), `${path}: HTTP ${response.status()}`);
    const failure = await bounded(response.finished(), `response body ${path}`);
    if (failure) throw new Error(`Public startup body failed: ${path}`, {cause:failure});
    return path;
  }), `startup response ${path}`));
  const pending = new Set();
  let changed = Date.now();
  const started = request => {
    if (request.resourceType() === 'eventsource' || new URL(request.url()).pathname === '/api/sync/stream') return;
    pending.add(request); changed = Date.now();
  };
  const ended = request => { if (pending.delete(request)) changed = Date.now(); };
  page.on('request', started); page.on('requestfinished', ended); page.on('requestfailed', ended);
  const readiness = Promise.all(responseWaits);
  // A failed navigation must not leave rejected startup waiters unobserved.
  void readiness.catch(() => undefined);
  try {
    const options = {waitUntil:'load', timeout:remaining()};
    const response = await bounded(reload ? page.reload(options) : page.goto(url, options), 'document load');
    assert.equal(response?.status(), 200, url);
    await bounded(readiness, 'startup traffic');
    await bounded(page.locator('h1').first().waitFor({state:'visible',timeout:remaining()}), 'visible heading');
    await bounded(page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }), 'fonts and visible animation frames');
    while (pending.size || Date.now() - changed < 150) {
      if (Date.now() >= deadline) throw new Error(`Finite startup did not settle: ${[...pending].map(r => new URL(r.url()).pathname).join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, Math.min(25, remaining())));
    }
    return response;
  } finally { page.off('request', started); page.off('requestfinished', ended); page.off('requestfailed', ended); }
}
