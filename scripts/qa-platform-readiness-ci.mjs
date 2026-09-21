/** Isolated release acceptance: real PostgreSQL/routes/browser/PDF, synthetic accounts and providers only. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import pg from "pg";
import { chromium } from "playwright-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
const url = process.env.QA_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/maras_qa") throw new Error("Exact dedicated loopback QA database required");
const forbidden = ["DATABASE_URL", "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_FREE_API_KEYS", "GEMINI_PAID_API_KEYS", "GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "GEMINI_CONTROL_PLANE_TOKEN_FILE", "GOOGLE_APPLICATION_CREDENTIALS", "RESEND_API_KEY", "TAP_SECRET_KEY", "OPENAI_API_KEY", "INSTRUCTOR_DATA_ENCRYPTION_KEY", "OAUTH_TOKEN_ENCRYPTION_KEY", "SESSION_SECRET", "ADMIN_MFA_ENCRYPTION_KEY"];
if (forbidden.some(name => process.env[name])) throw new Error("Do not supply application credentials or production markers");
mkdirSync(".data", { recursive: true, mode: 0o700 });
const security = Object.fromEntries(["SESSION_SECRET", "ADMIN_MFA_ENCRYPTION_KEY", "INSTRUCTOR_DATA_ENCRYPTION_KEY"].map(name => [name, randomBytes(32).toString("hex")]));
writeFileSync(".data/qa-security.json", JSON.stringify(security), { mode: 0o600 });
writeFileSync(".data/qa-database.json", JSON.stringify({ url }), { mode: 0o600 });
const env = { ...process.env, ...security, DATABASE_URL: url, DATABASE_SSL: "false", APP_URL: "http://127.0.0.1:3100", NEXT_PUBLIC_SITE_URL: "https://maras-qa.example", SEO_TEST_ORIGIN: "https://maras-qa.example", UPLOAD_DIR: `${process.cwd()}/.data/uploads`, SESSION_COOKIE_SECURE: "false", MARAS_LOOPBACK_QA: "true", STUDY_PDF_CHROMIUM_PATH: chromium.executablePath(), STUDY_PDF_QA_NO_SANDBOX: "true", AUTO_SEED_CATALOG: "false", RUN_DB_MIGRATIONS: "false", AI_WORKER_ENABLED: "false", VIDEO_WORKER_ENABLED: "false", STORAGE_CLEANUP_WORKER_ENABLED: "false", GEMINI_PROJECT_REFRESH_ENABLED: "false", FILE_SCAN_SCHEDULER_ENABLED: "false", LIFECYCLE_SCHEDULER_ENABLED: "false" };
const run = (args, timeoutMs = 180000) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  child.once("error", error => { clearTimeout(timer); reject(error); });
  child.once("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Isolated acceptance failed: ${args.at(-1)} (${code})`)); });
});
const pool = new pg.Pool({ connectionString: url });
try { await migrate(drizzle(pool), { migrationsFolder: "./drizzle" }); } finally { await pool.end(); }
await run(["scripts/qa-seed.mjs"]);
const argv = ["--import", "./scripts/ai-worker-runtime.mjs", "--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx"];
await run([...argv, "scripts/qa-instructor-assignments.ts"]);
// The existing local tool writes a tracked historical report. Restore it byte-for-byte
// and upload only a freshly generated, validated copy tagged with this run's source.
const historicalPath = "verification/instructor-contracts-local.json";
const historicalBytes = readFileSync(historicalPath), startedAt = Date.now();
rmSync(".data/qa-instructor-contracts-report.json", { force: true });
try {
  await run([...argv, "scripts/qa-instructor-contracts.ts"]);
  const current = JSON.parse(readFileSync(historicalPath, "utf8"));
  assert.ok(current.ok === true && Array.isArray(current.checks) && current.checks.length > 0 && Date.parse(current.at) >= startedAt, "Fresh contract acceptance evidence is required");
  writeFileSync(".data/qa-instructor-contracts-report.json", JSON.stringify({ ...current, source: process.env.GITHUB_SHA || null, syntheticOnly: true }, null, 2));
} finally { writeFileSync(historicalPath, historicalBytes); }
await run([...argv, "scripts/qa-account-deletion.ts"]);
await run(["node_modules/next/dist/bin/next", "build"], 300000);
await run(["scripts/qa-instructor-browser.mjs"], 240000);
console.log("INSTRUCTOR_PRIVACY_ACCEPTANCE_OK: synthetic contracts, private uploads, migrations, account deletion and browser signing; no live transactions or native-device claims.");
