import assert from 'node:assert/strict';
import test from 'node:test';
import { pureSource } from './helpers/pure-source.mjs';
const valid = { source: 'assistant', reference: 'a-1', reason: 'إجابة مضللة', excerpt: 'مقتطف تجريبي فقط' };
async function harness({ body = valid, user = null, origin = true, allowed = true, failed = false } = {}) {
  const writes = [], limits = [];
  const route = await pureSource('app/api/content-reports/route.ts', {
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
    supportTickets: 'support_tickets', sameOriginRequest: () => origin,
    clientIp: () => '192.0.2.7', getSessionUser: async () => user,
    checkRateLimit: async (...args) => { limits.push(args); return allowed; },
    readBoundedJsonObject: async (_request, size) => { assert.equal(size, 24 * 1024); return body; },
    getDb: () => ({ insert: table => { assert.equal(table, 'support_tickets'); return { values: async value => { if (failed) throw new Error('private-db-connection'); writes.push(value); } }; } }),
  });
  const response = await route.POST(new Request('https://example.test/api/content-reports', {method:'POST'}));
  return { response, writes, limits, payload: await response.json() };
}
test('guest AI flag is saved without requiring external navigation or account creation', async () => {
  const x = await harness(); assert.equal(x.response.status, 201); assert.equal(x.writes.length, 1);
  assert.equal(x.writes[0].userId, null); assert.equal(x.writes[0].contactChannel, 'in_app');
  assert.deepEqual(JSON.parse(x.writes[0].tagsJson), ['ai-content-review', 'assistant']);
  assert.match(x.writes[0].message, /بلاغ يقدمه المستخدم/); assert.equal(x.response.headers.get('cache-control'), 'no-store');
});
test('reported actor comes only from verified session and rejects caller-supplied ownership', async () => {
  const x = await harness({body:{...valid,userId:999,email:'other@example.test'},user:{id:7,email:'owner@example.test'}});
  assert.equal(x.writes[0].userId,7); assert.equal(x.writes[0].userEmail,'owner@example.test'); assert.equal(x.limits.length,2);
});
test('cross-origin reports and rate limits cannot write', async () => {
  for (const options of [{origin:false},{allowed:false}]) { const x = await harness(options); assert.ok([403,429].includes(x.response.status)); assert.equal(x.writes.length,0); }
});
test('report payload bounds and allowlisted source reject malformed references and content', async () => {
  for (const bad of [{source:'contract'},{reference:'../../other'},{reference:'https://internal/'},{reason:'x'},{reason:'x'.repeat(501)},{excerpt:'x'.repeat(2001)},{excerpt:'\u0000'}]) {
    const x = await harness({body:{...valid,...bad}}); assert.equal(x.response.status,400); assert.equal(x.writes.length,0);
  }
});
test('report persistence failure is not falsely acknowledged and does not expose private diagnostics', async () => {
  const x=await harness({failed:true});assert.equal(x.response.status,503);assert.equal(x.payload.ok,false);assert.doesNotMatch(JSON.stringify(x.payload),/private-db-connection/);
});
