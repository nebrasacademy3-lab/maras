import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {observeBrowserContext} from '../scripts/qa-browser-observations.mjs';

async function fixture() {
  const context = new EventEmitter(), page = new EventEmitter(), observations = [];
  let binding, init;
  context.exposeBinding = async (name, callback) => { assert.equal(name, '__marasQaError'); binding = callback; };
  context.addInitScript = async callback => { init = callback; };
  page.url = () => 'https://qa.example/faq?token=private#secret';
  const main = {}; page.mainFrame = () => main;
  await observeBrowserContext(context, observations, 'restricted-supervisor');
  context.emit('page', page);
  return {page, observations, binding, init, main};
}

test('browser diagnostics imports and records exceptions from every observed context', async () => {
  const f = await fixture();
  f.page.emit('pageerror', new Error('deliberate test exception'));
  assert.equal(f.observations[0].context, 'restricted-supervisor');
  assert.equal(f.observations[0].kind, 'playwright-pageerror');
  assert.equal(f.observations[0].message, 'deliberate test exception');
  assert.match(f.init.toString(), /unhandledrejection/);
  assert.match(f.init.toString(), /securitypolicyviolation/);
});

test('diagnostic URLs never persist query, fragment or URL credentials', async () => {
  const f = await fixture();
  f.binding({page:f.page}, {kind:'window-error', message:'Failed https://user:pass@qa.example/api?token=private#secret', stack:'https://qa.example/app.js?key=hidden'});
  assert.equal(f.observations[0].page, 'https://qa.example/faq');
  assert.equal(f.observations[0].message, 'Failed https://qa.example/api');
  assert.equal(f.observations[0].stack, 'https://qa.example/app.js');
  assert.doesNotMatch(JSON.stringify(f.observations), /private|secret|hidden|user:pass/);
});

test('diagnostics distinguishes main-frame navigation from failed requests without suppressing errors', async () => {
  const f = await fixture();
  f.page.emit('framenavigated', {});
  assert.equal(f.observations.length, 0);
  f.page.emit('framenavigated', f.main);
  f.page.emit('requestfailed', {url:()=> 'https://qa.example/api?key=hidden', failure:()=> ({errorText:'cancelled'})});
  assert.deepEqual(f.observations.map(row=>row.kind), ['main-frame-navigation', 'request-failed']);
  assert.equal(f.observations[1].url, 'https://qa.example/api');
});
