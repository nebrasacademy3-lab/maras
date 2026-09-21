/** Fail closed before a Railway web deploy. Reads CI metadata, never app secrets/data. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const CI_REPOSITORY = "nebrasacademy3-lab/maras";
export const REQUIRED_CI = [".github/workflows/quality.yml", ".github/workflows/dependency-security.yml"];
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export function evaluateCiRuns(payload, commit) {
  if (!payload || !Array.isArray(payload.workflow_runs)) throw new Error("CI response is not a workflow inventory");
  const checks = REQUIRED_CI.map(path => {
    const candidates = payload.workflow_runs.filter(run => run && run.path === path && run.head_sha === commit && run.head_branch === "main" && run.event === "push" && Number.isSafeInteger(run.id) && run.id > 0);
    candidates.sort((a, b) => b.id - a.id);
    const latest = candidates[0];
    const state = !latest || latest.status !== "completed" ? "pending" : latest.conclusion === "success" ? "passed" : "failed";
    return { path, state, runId: latest?.id ?? null };
  });
  return { ready: checks.every(check => check.state === "passed"), failed: checks.some(check => check.state === "failed"), checks };
}
async function boundedJson(response) {
  if (!response.body) throw new Error("CI response has no body");
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("CI response exceeds the allowed size"); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("CI response is not valid JSON"); }
  } finally { reader.releaseLock(); }
}

// Only the explicitly configured, read-only deployment credential may be sent,
// and only to the fixed GitHub API origin below. Never follow redirects or log it.
function ciHeaders(env) {
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "maras-release-gate/1.1", "cache-control": "no-cache" };
  const token = env.DEPLOY_GITHUB_TOKEN?.trim() || "";
  if (token && (token.length > 4096 || /[^\x21-\x7e]/.test(token))) throw new Error("Invalid deployment CI credential; invalid format; deployment blocked");
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function transientDelay(response, attempt, currentTime) {
  const rateLimited = response.status === 429 || response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"));
  if (!rateLimited && !(response.status >= 500 && response.status <= 599)) return null;
  // Secondary limits require at least a minute; subsequent retries back off.
  let delay = rateLimited ? Math.min(60000 * 2 ** attempt, 300000) : Math.min(2000 * 2 ** attempt, 30000);
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const value = /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - currentTime;
    if (Number.isFinite(value) && value > 0) delay = Math.max(delay, value);
  }
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000 - currentTime + 1000;
    if (Number.isFinite(reset) && reset > 0) delay = Math.max(delay, reset);
  }
  return delay;
}

export async function requireSuccessfulCi({ env = process.env, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, log = message => console.log(message), maxAttempts = 31 } = {}) {
  const commit = env.RAILWAY_GIT_COMMIT_SHA || "";
  if (!/^[a-f0-9]{40}$/.test(commit) || env.RAILWAY_GIT_BRANCH !== "main") throw new Error("GitHub main-branch deployment metadata is required");
  if (env.RAILWAY_GIT_REPO_OWNER && env.RAILWAY_GIT_REPO_OWNER !== "nebrasacademy3-lab" || env.RAILWAY_GIT_REPO_NAME && env.RAILWAY_GIT_REPO_NAME !== "maras") throw new Error("Deployment repository does not match the release gate");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 31) throw new Error("Invalid CI verification limit");
  const endpoint = new URL(`https://api.github.com/repos/${CI_REPOSITORY}/actions/runs`);
  endpoint.searchParams.set("head_sha", commit); endpoint.searchParams.set("event", "push"); endpoint.searchParams.set("branch", "main"); endpoint.searchParams.set("per_page", "100");
  const headers = ciHeaders(env);
  const deadline = now() + 10 * 60 * 1000;
  const retry = async (attempt, delay, reason, httpStatus) => {
    // Do not shorten a server-requested wait just to squeeze in another request.
    if (attempt + 1 >= maxAttempts || delay >= deadline - now()) return false;
    log(JSON.stringify({ event: "deployment.ci.retry", attempt: attempt + 1, reason, ...(httpStatus ? { httpStatus } : {}), retryMs: delay }));
    await pause(delay);
    return now() < deadline;
  };
  for (let attempt = 0; attempt < maxAttempts && now() < deadline; attempt++) {
    let response;
    try {
      response = await fetcher(endpoint, { method: "GET", redirect: "error", credentials: "omit", signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - now()))), headers });
    } catch {
      if (await retry(attempt, Math.min(2000 * 2 ** attempt, 30000), "network")) continue;
      throw new Error("Cannot verify CI through the GitHub API; deployment blocked");
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      const delay = transientDelay(response, attempt, now());
      if (delay !== null && await retry(attempt, delay, "http", response.status)) continue;
      if (response.status === 401 || response.status === 404) throw new Error(`GitHub CI access denied or repository unavailable (HTTP ${response.status}). Configure DEPLOY_GITHUB_TOKEN with Actions:read access to this repository; deployment blocked`);
      throw new Error(`GitHub CI metadata is unavailable or rate-limited (HTTP ${response.status}); deployment blocked`);
    }
    const status = evaluateCiRuns(await boundedJson(response), commit);
    log(JSON.stringify({ event: "deployment.ci.gate", commit, checks: status.checks }));
    if (status.failed) throw new Error("A required CI workflow did not succeed; deployment blocked");
    if (status.ready) return status;
    if (attempt + 1 < maxAttempts && now() < deadline) await pause(Math.min(20000, deadline - now()));
  }
  throw new Error("Required CI did not finish within the verification window; deployment blocked");
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await requireSuccessfulCi(); }
  catch (error) { console.error(error instanceof Error ? error.message : "CI verification failed; deployment blocked"); process.exitCode = 1; }
}
