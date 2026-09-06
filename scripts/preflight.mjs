#!/usr/bin/env node
/** Local configuration check. Does not connect to providers, print secrets, or mutate data. */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Actual environment wins. Use `node --env-file=.env scripts/preflight.mjs` for a local file.
const env = process.env;
const strict = process.argv.includes('--strict');
const results = [];
const add = (level, key, message) => results.push({ level, key, message });
const value = key => (env[key] || '').trim();
const placeholder = text => !text || /replace[-_ ]|change[-_ ]?me|your[-_ ]|example\.com/i.test(text);
const secretKeys = ['SESSION_SECRET', 'ADMIN_API_TOKEN', 'ADMIN_UPLOAD_TOKEN', 'VIDEO_SIGNING_SECRET', 'ADMIN_MFA_ENCRYPTION_KEY', 'SCHEDULED_TASK_TOKEN', 'REFERRAL_HASH_SALT', 'AI_KEYS_ENCRYPTION_KEY'];
for (const key of secretKeys) {
  const v = value(key);
  add(placeholder(v) || v.length < 32 ? 'error' : 'ok', key, placeholder(v) || v.length < 32 ? 'Set an independent, non-placeholder secret of at least 32 characters; preserve existing encryption keys until migrated.' : 'Present; value not displayed.');
}
const presentSecrets = secretKeys.filter(key => !placeholder(value(key)));
for (let i = 0; i < presentSecrets.length; i++) for (let j = i + 1; j < presentSecrets.length; j++) {
  if (value(presentSecrets[i]) === value(presentSecrets[j])) add('error', 'SECRET_REUSE', `${presentSecrets[i]} and ${presentSecrets[j]} must not share a value.`);
}
try { const url = new URL(value('DATABASE_URL')); if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(); add('ok', 'DATABASE_URL', 'URL syntax is valid; connectivity and migrations have not been checked.'); }
catch { add('error', 'DATABASE_URL', 'A PostgreSQL connection URL is required.'); }
const origins = [];
for (const key of ['APP_URL', 'NEXT_PUBLIC_SITE_URL']) {
  try { const url = new URL(value(key)); if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) throw new Error(); origins.push(url.origin); add('ok', key, 'Public HTTPS origin configured.'); }
  catch { add('error', key, 'Production requires a public HTTPS URL without embedded credentials.'); }
}
if (origins.length === 2 && origins[0] !== origins[1]) add('error', 'PUBLIC_ORIGINS', 'APP_URL and NEXT_PUBLIC_SITE_URL must match for this deployment.');
if (value('DATABASE_SSL_REJECT_UNAUTHORIZED') === 'false') add('error', 'DATABASE_TLS', 'Do not disable certificate verification; supply the provider CA instead.');
if (value('SESSION_COOKIE_SECURE') === 'false') add('error', 'SESSION_COOKIE_SECURE', 'Secure cookies must remain enabled in production.');
for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'TAP_SECRET_KEY', 'TAP_WEBHOOK_SECRET']) add(placeholder(value(key)) ? 'warning' : 'ok', key, placeholder(value(key)) ? 'Provider configuration is missing; related feature cannot be considered ready.' : 'Configured; provider verification is still required.');
if (!value('MALWARE_SCAN_URL') || value('MALWARE_SCAN_TOKEN').length < 32) add('warning', 'MALWARE_SCAN', 'Configure the scanner and its >=32 character token. Production attachments stay pending while scanning is unavailable.');
else {
  try { const url = new URL(value('MALWARE_SCAN_URL')); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(); add(url.protocol === 'https:' ? 'ok' : 'warning', 'MALWARE_SCAN_URL', url.protocol === 'https:' ? 'Scanner endpoint configured; perform a real engine test.' : 'HTTP is suitable only on a trusted private network/loopback; use TLS for public transit.'); }
  catch { add('error', 'MALWARE_SCAN_URL', 'Invalid scanner URL.'); }
}
const fps = value('ANDROID_SHA256_FINGERPRINTS').split(/[,\s]+/).filter(Boolean);
add(fps.length && fps.every(fp => /^(?:[\da-f]{2}:){31}[\da-f]{2}$/i.test(fp)) ? 'ok' : 'warning', 'ANDROID_SHA256_FINGERPRINTS', fps.length ? 'Fingerprint format checked; confirm it is the Play App Signing certificate.' : 'Android App Links need the actual signing SHA-256 fingerprints.');
const applePrefix = value('APPLE_APP_ID_PREFIX') || value('APPLE_TEAM_ID');
add(/^[A-Z0-9]{10}$/.test(applePrefix) ? 'ok' : 'warning', 'APPLE_APP_ID_PREFIX', 'Universal Links need the actual 10-character application identifier prefix.');
for (const file of ['drizzle/0028_catalog_deletion_ledger.sql', '.github/workflows/quality.yml', 'public/brand/mark-light.png', 'public/brand/sender-icon.png']) add(existsSync(path.join(root, file)) ? 'ok' : 'error', file, existsSync(path.join(root, file)) ? 'File present.' : 'Required release file is missing.');
if (existsSync(path.join(root, '.env.railway.generated'))) add('error', 'PACKAGED_SECRETS', 'Remove the generated secrets file from the distributable; keep production secrets in the hosting secret store.');
add('info', 'EXTERNAL_ACCEPTANCE', 'This check does not verify DNS/BIMI, Telegram settings, database migration, payment, email delivery, push notifications, or actual devices.');
if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: !results.some(r => r.level === 'error' || strict && r.level === 'warning'), results }, null, 2));
else { for (const result of results) console.log(`[${result.level.toUpperCase()}] ${result.key}: ${result.message}`); console.log('\nConfiguration only — not a security certificate or an end-to-end test.'); }
process.exitCode = results.some(r => r.level === 'error' || strict && r.level === 'warning') ? 1 : 0;
