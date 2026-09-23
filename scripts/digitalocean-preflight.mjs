import { X509Certificate } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const services = new Set(["web", "video-worker", "ai-worker", "file-scan-worker", "cleanup-worker", "migrate"]);
const configured = value => typeof value === "string" && value.trim() !== "" && !/REPLACE_SECRET_|__[^_]+__/.test(value);

export function digitalOceanPreflight(env = process.env, service = "web") {
  const errors = [];
  const requireSetting = (key) => { if (!configured(env[key])) errors.push(key); };
  if (!services.has(service)) errors.push("SERVICE");
  if (env.HOSTING_PLATFORM !== "digitalocean-app-platform") errors.push("HOSTING_PLATFORM");
  requireSetting("DATABASE_URL");
  if (env.DATABASE_SSL !== "true") errors.push("DATABASE_SSL");
  if (env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "true") errors.push("DATABASE_SSL_REJECT_UNAUTHORIZED");
  try {
    const url = new URL(env.DATABASE_URL || "");
    const modes = url.searchParams.getAll("sslmode");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname
        || modes.length > 1 || modes.some(mode => !["require", "verify-full"].includes(mode))) errors.push("DATABASE_URL_TLS");
  } catch { errors.push("DATABASE_URL_TLS"); }
  try { new X509Certificate(env.DATABASE_CA_CERT || ""); }
  catch { errors.push("DATABASE_CA_CERT"); }

  if (service !== "migrate") {
    for (const key of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) requireSetting(key);
    const region = env.S3_REGION?.trim() || "";
    if (!/^[a-z]{2,5}\d+$/.test(region)) errors.push("S3_REGION_FORMAT");
    try {
      const endpoint = new URL(env.S3_ENDPOINT || "");
      if (endpoint.href !== `https://${region}.digitaloceanspaces.com/`) errors.push("S3_ENDPOINT_FORMAT");
    } catch { errors.push("S3_ENDPOINT_FORMAT"); }
    if (env.S3_FORCE_PATH_STYLE !== "true" && env.S3_FORCE_PATH_STYLE !== "false") errors.push("S3_FORCE_PATH_STYLE");
    if (env.RUN_DB_MIGRATIONS !== "false") errors.push("RUN_DB_MIGRATIONS");
    if (env.AUTO_SEED_CATALOG !== "false") errors.push("AUTO_SEED_CATALOG");
  }
  if (service === "web") {
    for (const key of ["APP_URL", "NEXT_PUBLIC_SITE_URL", "SESSION_SECRET", "ADMIN_API_TOKEN", "ADMIN_UPLOAD_TOKEN", "VIDEO_SIGNING_SECRET", "MALWARE_SCAN_TOKEN"]) requireSetting(key);
    for (const key of ["SESSION_SECRET", "ADMIN_API_TOKEN", "ADMIN_UPLOAD_TOKEN", "VIDEO_SIGNING_SECRET", "MALWARE_SCAN_TOKEN"]) {
      if ((env[key]?.trim().length || 0) < 32) errors.push(key + "_LENGTH");
    }
    if (env.SESSION_COOKIE_SECURE !== "true") errors.push("SESSION_COOKIE_SECURE");
    try {
      const app = new URL(env.APP_URL || "");
      const site = new URL(env.NEXT_PUBLIC_SITE_URL || "");
      if (app.protocol !== "https:" || site.protocol !== "https:" || app.origin !== site.origin || app.pathname !== "/" || site.pathname !== "/") errors.push("PUBLIC_ORIGIN");
    } catch { errors.push("PUBLIC_ORIGIN"); }
    for (const key of ["AI_WORKER_ENABLED", "VIDEO_WORKER_ENABLED", "STORAGE_CLEANUP_WORKER_ENABLED", "FILE_SCAN_SCHEDULER_ENABLED"]) {
      if (env[key] !== "false") errors.push(key);
    }
    if (env.MALWARE_SCAN_URL !== "http://scanner:3001/scan") errors.push("MALWARE_SCAN_URL");
  }
  if (errors.length) throw new Error([...new Set(errors)].join(", "));
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    digitalOceanPreflight(process.env, process.argv[2]);
    console.info("DigitalOcean configuration is valid.");
  } catch (error) {
    // Only setting names are logged, never credentials, URLs or PEM contents.
    console.error(`[fatal] DigitalOcean configuration invalid: ${error.message}`);
    process.exitCode = 78;
  }
}
