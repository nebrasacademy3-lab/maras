import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
if(new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/maras_qa")) throw new Error("Local synthetic DB required");
const env = {...process.env, DATABASE_URL:url, APP_URL:"http://127.0.0.1:3100", NEXT_PUBLIC_SITE_URL:"https://maras-qa.example", NODE_ENV:"production", NEXT_TELEMETRY_DISABLED:"1", SEO_INDEXING_ENABLED:"true", INDEXNOW_ENABLED:"false", INDEXNOW_KEY:"", AUTO_SEED_CATALOG:"false", VIDEO_WORKER_ENABLED:"false", FILE_SCAN_SCHEDULER_ENABLED:"false", LIFECYCLE_SCHEDULER_ENABLED:"false", RUN_DB_MIGRATIONS:"false", TAP_SECRET_KEY:"", TAP_WEBHOOK_SECRET:"", RESEND_API_KEY:"", SMTP_HOST:"", GEMINI_API_KEY:"", GOOGLE_API_KEY:"", GEMINI_API_KEYS:"", REVENUECAT_SECRET_API_KEY:""};
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env,windowsHide:true,stdio:"inherit"});
child.on("exit",code=>process.exit(code||0));
