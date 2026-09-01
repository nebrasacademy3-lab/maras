import { closeDb } from "../db/index";
import { runVideoProcessingBatch, videoProcessingCapability } from "../lib/video-processing";

const pollMs = Math.max(1_000, Math.min(60_000, Number(process.env.VIDEO_WORKER_POLL_MS) || 5_000));
const batchSize = Math.max(1, Math.min(5, Number(process.env.VIDEO_WORKER_BATCH_SIZE) || 1));
const runOnce = process.argv.includes("--once") || process.env.VIDEO_WORKER_ONCE === "true";
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const capability = await videoProcessingCapability(true);
  if (!capability.available) {
    console.warn(`[video-worker] ${capability.message}`);
    if (runOnce) return;
  } else console.info("[video-worker] FFmpeg/FFprobe are ready; adaptive processing started.");

  do {
    try {
      const result = await runVideoProcessingBatch(batchSize);
      if (result.processed || result.failed) console.info(`[video-worker] processed=${result.processed} failed=${result.failed || 0}`);
    } catch (error) {
      console.error("[video-worker] batch failed", error instanceof Error ? error.message : String(error));
    }
    if (!runOnce && !stopping) await sleep(pollMs);
  } while (!runOnce && !stopping);
}

try { await main(); }
finally { await closeDb().catch(() => undefined); }
