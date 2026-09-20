import { processAppleRevocations } from "../lib/apple-account-tokens";
import { expireInstructorDocuments } from "@/lib/instructor-retention";
import { expireStudyUploads } from "@/lib/study-resumable-upload";
import { setTimeout as sleep } from "node:timers/promises";
import { getDb, closeDb } from "../db";
import { expireResumableVideos } from "../lib/resumable-video-upload";
import { processStorageCleanupBatch, storageCleanupSummary } from "../lib/storage-cleanup";

const stopping = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => stopping.abort());
const once = process.argv.includes("--once");
let failures = 0;
try {
  const db = getDb();
  // Missing migrations fail startup; they must not leave a silently dead worker.
  console.info(JSON.stringify({ event: "storage.cleanup.started", ...await storageCleanupSummary(db) }));
  do {
    try {
      const apple = await processAppleRevocations({ signal: stopping.signal });
      if (apple.attempted) console.info(JSON.stringify({ event: "apple.revocation.batch", ...apple }));
      await expireResumableVideos(db);
      await expireStudyUploads(db);
      await expireInstructorDocuments(db);
      const result = await processStorageCleanupBatch(db, { limit: 5, signal: stopping.signal });
      failures = 0;
      if (result.claimed) console.info(JSON.stringify({ event: "storage.cleanup.batch", claimed: result.claimed, completed: result.completed, failed: result.failed.length, lost: result.lost }));
      const summary = await storageCleanupSummary(db);
      if (summary.blocked || summary.overdue) console.warn(JSON.stringify({ event: "storage.cleanup.attention", ...summary }));
      if (!once && !stopping.signal.aborted) await sleep(result.claimed ? 100 : 5000, undefined, { signal: stopping.signal });
    } catch {
      if (stopping.signal.aborted) break;
      console.error(JSON.stringify({ event: "storage.cleanup.database_unavailable", consecutiveFailures: ++failures }));
      if (once || failures >= 3) throw new Error("Storage cleanup worker cannot reach its durable queue");
      await sleep(1000, undefined, { signal: stopping.signal }).catch(() => undefined);
    }
  } while (!once && !stopping.signal.aborted);
} finally { await closeDb(); }
