import { closeDb } from "../db";
import { readGeminiControlToken } from "../lib/gemini-control-files";
import { runGeminiProjectRefreshOnce } from "../lib/gemini-project-refresh";

const stop = new AbortController();
for (const name of ["SIGTERM", "SIGINT"]) process.on(name, () => stop.abort());
const pause = () => new Promise<void>(resolve => {
  if (stop.signal.aborted) return resolve();
  const finish = () => { clearTimeout(timer); stop.signal.removeEventListener("abort", finish); resolve(); };
  const timer = setTimeout(finish, 10000);
  stop.signal.addEventListener("abort", finish, { once: true });
});
try {
  if (process.env.GEMINI_PROJECT_REFRESH_ENABLED?.trim().toLowerCase() !== "true") throw new Error("disabled");
  const tokenFile = process.env.GEMINI_CONTROL_PLANE_TOKEN_FILE || "";
  // Reject an unsafe source at startup rather than launching a misleading healthy worker.
  const startupDeadline = setTimeout(() => {
    console.error('{"event":"gemini.refresh.configuration-rejected"}'); process.exit(78);
  }, 15000);
  try { await readGeminiControlToken(tokenFile); }
  finally { clearTimeout(startupDeadline); }
  do {
    // Covers database stalls too. The supervisor treats a nonzero worker exit as unhealthy.
    const deadline = setTimeout(() => {
      console.error('{"event":"gemini.refresh.watchdog","code":"DEADLINE"}');
      stop.abort(); process.exit(1);
    }, 40000);
    let worked = false;
    try {
      const result = await runGeminiProjectRefreshOnce(tokenFile, stop.signal);
      worked = result.worked;
      if (worked) console.info(JSON.stringify({ event: "gemini.refresh", ...result }));
    } catch {
      if (!stop.signal.aborted) console.error('{"event":"gemini.refresh.unavailable"}');
    } finally { clearTimeout(deadline); }
    if (process.argv.includes("--once") || stop.signal.aborted) break;
    if (!worked) await pause();
  } while (!stop.signal.aborted);
} catch {
  console.error('{"event":"gemini.refresh.configuration-rejected"}'); process.exitCode = 78;
} finally { await closeDb().catch(() => undefined); }
