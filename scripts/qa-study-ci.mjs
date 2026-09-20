/** Run only against the dedicated loopback CI PostgreSQL service; never load application secrets. */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, openSync } from "node:fs";
import pg from "pg";
import { chromium } from "playwright-core";
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
const url = process.env.QA_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/maras_qa") throw new Error("QA_DATABASE_URL must be dedicated loopback maras_qa");
const forbidden = ["DATABASE_URL", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_FREE_API_KEY", "GEMINI_FREE_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "GOOGLE_API_KEY", "GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "GEMINI_CONTROL_PLANE_TOKEN_FILE", "GOOGLE_APPLICATION_CREDENTIALS", "S3_BUCKET", "BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "RESEND_API_KEY", "TAP_SECRET_KEY", "OPENAI_API_KEY", "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID"];
if (forbidden.some(name => process.env[name])) throw new Error("Do not supply production credentials or production environment markers");
mkdirSync(".data", { recursive: true }); writeFileSync(".data/qa-database.json", JSON.stringify({ url }));
const env = { ...process.env, STUDY_PDF_CHROMIUM_PATH: chromium.executablePath(), STUDY_PDF_QA_NO_SANDBOX: "true", MARAS_LOOPBACK_QA: "true", DATABASE_URL: url, DATABASE_SSL: "false", APP_URL: "http://127.0.0.1:3100", NEXT_PUBLIC_SITE_URL: "https://maras-qa.example", UPLOAD_DIR: `${process.cwd()}/.data/uploads`, SESSION_COOKIE_SECURE: "false", ADMIN_MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"), SESSION_SECRET: "synthetic-local-ci-session-only-do-not-reuse", VIDEO_SIGNING_SECRET: "synthetic-local-ci-video-only-do-not-reuse", AUTO_SEED_CATALOG: "false", RUN_DB_MIGRATIONS: "false", GEMINI_PROJECT_REFRESH_ENABLED: "false", AI_WORKER_ENABLED: "false", VIDEO_WORKER_ENABLED: "false", FILE_SCAN_SCHEDULER_ENABLED: "false", LIFECYCLE_SCHEDULER_ENABLED: "false", GEMINI_API_KEY: "", GEMINI_API_KEYS: "", OPENAI_API_KEY: "", RESEND_API_KEY: "", TAP_SECRET_KEY: "" };
const run = (args, settings = env) => new Promise((resolve, reject) => { const child = spawn(process.execPath, args, { env: settings, stdio: "inherit" }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Command ${args[0]} exited ${code}`))); });
const pool = new pg.Pool({ connectionString: url });
try { await migrate(drizzle(pool), { migrationsFolder: "./drizzle" }); } finally { await pool.end(); }
await run(["scripts/qa-order-ownership-migration.mjs"]);
await run(["scripts/qa-stable-user-ownership-migration.mjs"]);
await run(["--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", "scripts/qa-storage-cleanup.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-resumable-video.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", "scripts/qa-gemini-projects.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", "scripts/qa-gemini-refresh.ts"]);
await run(["scripts/qa-seed.mjs"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-study-upload.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-study-tools.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-study-output-access.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-study-pdf.ts"], { ...env, STUDY_PDF_CHROMIUM_PATH: chromium.executablePath() });
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-platform-security.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-device-return.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-admin-navigation-security.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-email-change.mjs"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-supervisor-data-scope.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-admin-stable-ownership.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-admin-media-deletion.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-order-ownership.ts"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-protected-video.ts", "--prepare"]);
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { env, stdio: ["ignore", openSync(".data/study-server.log", "w"), "inherit"] });
const worker = spawn(process.execPath, ["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/ai-worker.ts"], { env, stdio: ["ignore", openSync(".data/study-worker.log", "w"), "inherit"] });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { const response = await fetch("http://127.0.0.1:3100/login", { signal: AbortSignal.timeout(2000) }); if (response.ok) { ready = true; break; } } catch { /* isolated server may still be starting */ } await new Promise(r => setTimeout(r, 1000)); }
  if (!ready || server.exitCode !== null) throw new Error(`Synthetic server failed to own its listener: ${readFileSync(".data/study-server.log", "utf8").slice(-3000)}`);
  const qaResponse = await fetch("http://127.0.0.1:3100/", { signal: AbortSignal.timeout(5000) });
  const qaHeaders = qaResponse.headers;
  await qaResponse.body?.cancel();
  if (qaHeaders.get("cross-origin-resource-policy") !== "cross-origin"
      || qaHeaders.get("cross-origin-opener-policy") !== "unsafe-none"
      || qaHeaders.get("origin-agent-cluster") !== "?0"
      || qaHeaders.get("access-control-allow-origin") !== "http://127.0.0.1:3100"
      || !/connect-src[^;]*http:\/\/127\.0\.0\.1:3100/.test(qaHeaders.get("content-security-policy") || "")) {
    throw new Error("Loopback browser security profile was not baked into the QA build");
  }
  await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-protected-video.ts"]);
  await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-resumable-browser.mjs"]);
  await run(["scripts/qa-study-browser.mjs"]);
  await run(["scripts/qa-study-pdf-browser.mjs"]);
  await run(["scripts/qa-supervisor-browser.mjs"]);
  await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-platform-browser.mjs"]);
} finally { server.kill("SIGTERM"); worker.kill("SIGTERM"); }
