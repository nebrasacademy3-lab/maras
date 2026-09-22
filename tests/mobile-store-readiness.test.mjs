import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pureSource } from './helpers/pure-source.mjs';
const associations = await pureSource('lib/mobile-associations.ts');
test('public Android association rejects missing, placeholder and malformed signing fingerprints', () => {
  for (const raw of [undefined, '', 'placeholder', '00:11', 'G0:'.repeat(31) + '00']) assert.equal(associations.androidAssociations(raw), null);
  const fingerprint = Array(32).fill('AB').join(':');
  const result = associations.androidAssociations(fingerprint + ',' + fingerprint.toLowerCase());
  assert.equal(result[0].target.package_name, 'sa.merasalelm.app');
  assert.equal(result[0].target.sha256_cert_fingerprints.length, 1);
});
test('Apple associations need an actual team identifier and exclude purchasing', () => {
  for (const raw of [undefined, '', 'YOUR_TEAM_ID', 'abcde12345']) assert.equal(associations.appleAssociation(raw), null);
  const value = associations.appleAssociation('ABCDE12345');
  assert.equal(value.applinks.details[0].appIDs[0], 'ABCDE12345.sa.merasalelm.app');
  assert.ok(value.applinks.details[0].components.some(row => row['/'] === '/courses/*'));
  assert.ok(value.applinks.details[0].components.every(row => !/cart|checkout|payment/.test(row['/'])));
});
test('account deletion rejects changed web identity before any account mutation', async () => {
  let databaseCalls = 0;
  const route = await pureSource('app/api/mobile/account/route.ts', {
    isMobileRequest: () => true,
    getSessionUser: async () => ({ id: 7 }),
    checkRateLimit: async () => true,
    readBoundedJsonObject: async () => ({ userId: 8, confirmation: 'حذف حسابي' }),
    jsonError: (error, status) => Response.json({error}, {status}),
    getDb: () => { databaseCalls++; throw new Error('must not reach the database'); },
  });
  const response = await route.DELETE(new Request('https://example.test/api/mobile/account', {method:'DELETE'}));
  assert.equal(response.status, 409); assert.equal(databaseCalls, 0);
});
test('deletion landing page is public and offers a browser form rather than requiring the app', () => {
  const page = readFileSync(new URL('../app/account-deletion/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /AccountDeletionRequest/); assert.match(page, /دون تثبيت التطبيق/); assert.doesNotMatch(page, /redirect\(|cookies\(/);
  const form = readFileSync(new URL('../components/account-deletion-request.tsx', import.meta.url), 'utf8');
  assert.match(form, /userId: identity.id/); assert.match(form, /code.length !== 6/); assert.match(form, /redirect: "error"/);
});
