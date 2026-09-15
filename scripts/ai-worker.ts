import { closeDb } from "../db/index";
import { pruneAiWork, runAiFileJobOnce } from "../lib/ai-file-jobs";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
const once = process.argv.includes("--once");
let loops = 0;
async function main() {
  do {
    let worked = false;
    try {
      worked = await runAiFileJobOnce();
      if (++loops % 60 === 0) await pruneAiWork();
    } catch {
      // Never log uploaded content, credentials, or raw provider/database responses.
      console.error("[ai-worker] Processing unavailable; retrying with a bounded delay.");
    }
    if (!once && !stopping) await new Promise(resolve => setTimeout(resolve, worked ? 250 : 3000));
  } while (!once && !stopping);
}
try { await main(); } finally { await closeDb().catch(() => undefined); }
