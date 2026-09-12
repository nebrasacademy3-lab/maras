import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const template = readFileSync(new URL("../.env.staging.example", import.meta.url), "utf8");
const names = new Set(["POSTGRES_PASSWORD", "SESSION_SECRET", "ADMIN_API_TOKEN", "ADMIN_UPLOAD_TOKEN", "VIDEO_SIGNING_SECRET", "ADMIN_MFA_ENCRYPTION_KEY", "AI_KEYS_ENCRYPTION_KEY", "MALWARE_SCAN_TOKEN"]);
const content = template.split("\n").map(line => { const key = line.split("=")[0]; return names.has(key) ? key + "=" + randomBytes(32).toString("hex") : line; }).join("\n");
writeFileSync(new URL("../.env.staging", import.meta.url), content, { flag: "wx", mode: 0o600 });
console.log("Created local .env.staging. Secret values are not printed; do not commit this file.");
