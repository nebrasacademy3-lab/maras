/** Run only against the dedicated loopback CI PostgreSQL service; never load application secrets. */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, openSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
const url = process.env.QA_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/maras_qa") throw new Error("QA_DATABASE_URL must be dedicated loopback maras_qa");
if (process.env.DATABASE_URL || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || process.env.S3_BUCKET || process.env.BUCKET) throw new Error("Do not supply production credentials");
mkdirSync(".data", { recursive: true }); writeFileSync(".data/qa-database.json", JSON.stringify({ url }));
const env = { ...process.env, DATABASE_URL: url, DATABASE_SSL: "false", APP_URL: "http://127.0.0.1:3100", NEXT_PUBLIC_SITE_URL: "https://maras-qa.example", UPLOAD_DIR: `${process.cwd()}/.data/uploads`, SESSION_COOKIE_SECURE: "false", SESSION_SECRET: "synthetic-local-ci-session-only-do-not-reuse", VIDEO_SIGNING_SECRET: "synthetic-local-ci-video-only-do-not-reuse", AUTO_SEED_CATALOG: "false", RUN_DB_MIGRATIONS: "false", AI_WORKER_ENABLED: "false", VIDEO_WORKER_ENABLED: "false", FILE_SCAN_SCHEDULER_ENABLED: "false", LIFECYCLE_SCHEDULER_ENABLED: "false", GEMINI_API_KEY: "", GEMINI_API_KEYS: "", OPENAI_API_KEY: "", RESEND_API_KEY: "", TAP_SECRET_KEY: "" };
const run = (args, settings = env) => new Promise((resolve, reject) => { const child = spawn(process.execPath, args, { env: settings, stdio: "inherit" }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Command ${args[0]} exited ${code}`))); });
const pool = new pg.Pool({ connectionString: url });
try { await migrate(drizzle(pool), { migrationsFolder: "./drizzle" }); } finally { await pool.end(); }
await run(["scripts/qa-seed.mjs"]);
await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-study-tools.ts"]);
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { env, stdio: ["ignore", openSync(".data/study-server.log", "w"), "inherit"] });
const worker = spawn(process.execPath, ["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/ai-worker.ts"], { env, stdio: ["ignore", openSync(".data/study-worker.log", "w"), "inherit"] });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { await fetch("http://127.0.0.1:3100/login", { signal: AbortSignal.timeout(2000) }); ready = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
  if (!ready) throw new Error("Synthetic web server did not start");
  await run(["scripts/qa-study-browser.mjs"]);
} finally { server.kill("SIGTERM"); worker.kill("SIGTERM"); }
