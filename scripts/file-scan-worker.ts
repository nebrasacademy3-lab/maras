import { closeDb } from "../db";
import { fileScanService } from "../lib/file-scan-queue";
import { scannerConfig } from "../lib/malware-scanner";
// One-shot worker for an external cron when the built-in scheduler is disabled.
async function main() {
  const config = scannerConfig();
  if (config.mode === "unconfigured" || config.mode === "invalid") throw new Error("No valid malware scanner configured");
  console.log(JSON.stringify(await fileScanService.runBatch({ limit: 40, budgetMs: 90_000 })));
}
main().catch(() => { console.error("File scan worker failed; check scanner, database and migration 0030."); process.exitCode = 1; }).finally(closeDb);
