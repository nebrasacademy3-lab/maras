// Integration smoke tests require an existing Next production build.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const integration = new Set(['smoke.test.mjs', 'seo-production-smoke.test.mjs']);
const files = readdirSync(new URL('../tests/', import.meta.url)).filter(file => file.endsWith('.test.mjs') && !integration.has(file)).sort().map(file => `tests/${file}`);
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, stdio: 'inherit' });
if (run.error) console.error(run.error.message);
process.exitCode = run.status ?? 1;
