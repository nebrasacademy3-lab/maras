import { closeDb } from "../db";
import { runFileScanBatch } from "../lib/file-scan-queue";
const once = process.argv.includes("--once");
let stopped = false;
process.once("SIGTERM", () => { stopped = true; });
process.once("SIGINT", () => { stopped = true; });
try {
  do {
    const summary = await runFileScanBatch(10);
    console.log(JSON.stringify({ event: "files.scan", ...summary }));
    if (!once && !stopped) await new Promise(resolve => setTimeout(resolve, 30_000));
  } while (!once && !stopped);
} finally { await closeDb(); }
