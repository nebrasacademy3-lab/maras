import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('../mobile/src/lib/api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function load(fetch) {
  const exports = {};
  vm.runInNewContext(source, { exports, URL, Headers, FormData, AbortController, Error, setTimeout, clearTimeout, fetch, require: name => {
    if (name === 'expo-constants') return { default: { expoConfig: { extra: { apiUrl: 'https://marasalelm.com', storeMode: 'direct' } } }, __esModule: true };
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    throw new Error(name);
  } });
  return exports;
}
test('native API never sends bearer credentials to another origin or embedded URL userinfo', async () => {
  let calls = 0; const api = load(async () => { calls++; return Response.json({ ok: true }); }); api.setApiToken('test-only-not-a-production-secret');
  for (const url of ['https://evil.example/api/profile', 'https://user:password@marasalelm.com/api/profile']) await assert.rejects(api.api(url), error => error.status === 400);
  assert.equal(calls, 0);
  await api.api('/api/profile'); assert.equal(calls, 1);
});
test('native API rejects misleading success HTML or empty replies and refuses redirects', async () => {
  for (const body of ['<html>maintenance</html>', '', 'null', '"not an object"']) {
    const api = load(async (_, init) => { assert.equal(init.redirect, 'error'); return new Response(body, { status: 200 }); });
    await assert.rejects(api.api('/api/auth/reset-password'), error => error.status === 502);
  }
  const api = load(async () => new Response(null, { status: 204 })); assert.equal(typeof await api.api('/api/example'), 'object');
});
test('native API detaches external abort listeners after a completed request', async () => {
  const controller = new AbortController(); let attached = 0; let removed = 0;
  const add = controller.signal.addEventListener.bind(controller.signal); const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { attached++; return add(...args); };
  controller.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  const api = load(async () => Response.json({ ok: true }));
  const response = await api.api('/api/profile', { signal: controller.signal }); assert.equal(response.ok, true); assert.equal(attached, 1); assert.equal(removed, 1);
});
