/** Safe opt-in GET-only load probe. It never runs against the platform's production domains. */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
const origin = new URL(process.env.LOAD_TEST_ORIGIN || "http://127.0.0.1:3100");
if (process.env.ALLOW_STAGING_LOAD_TEST !== "true") throw new Error("Explicit ALLOW_STAGING_LOAD_TEST=true required");
if (["marasalelm.com", "www.marasalelm.com", "marase.up.railway.app"].includes(origin.hostname) || !(["127.0.0.1", "localhost"].includes(origin.hostname) || /(^|[.-])(staging|qa|test)([.-]|$)/.test(origin.hostname))) throw new Error("Only explicit staging/QA or loopback hosts are allowed");
const concurrency = Math.max(1, Math.min(500, Number(process.env.LOAD_TEST_CONCURRENCY) || 10));
const total = Math.max(concurrency, Math.min(20_000, Number(process.env.LOAD_TEST_REQUESTS) || 100));
const times = [], statuses = {}; let cursor = 0, errors = 0;
const start = performance.now();
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor++ < total) {
    const then = performance.now();
    try {
      const response = await fetch(new URL("/courses", origin), { redirect: "error", signal: AbortSignal.timeout(15_000) });
      await response.arrayBuffer(); statuses[response.status] = (statuses[response.status] || 0) + 1;
      if (!response.ok) errors++;
    } catch { errors++; statuses.network = (statuses.network || 0) + 1; }
    times.push(performance.now() - then);
  }
}));
times.sort((a, b) => a - b);
const report = { origin: origin.origin, concurrency, requests: times.length, errorRate: errors / times.length, durationSeconds: (performance.now() - start) / 1000, p50Ms: times[Math.floor(times.length * .5)], p95Ms: times[Math.min(times.length - 1, Math.floor(times.length * .95))], statuses, scope: "GET /courses only; not a video, Gemini or full-platform capacity certification" };
writeFileSync(".data-staging-load-result.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
if (errors / times.length > .01) process.exitCode = 1;
