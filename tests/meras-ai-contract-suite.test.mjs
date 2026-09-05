import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const absolute = (path) => join(root, ...path.split("/"));
function source(path) {
  const file = absolute(path);
  assert.ok(existsSync(file), `Required contract file is missing: ${path}`);
  return readFileSync(file, "utf8");
}
function functionBody(text, name, nextName) {
  const start = text.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Function ${name} is missing`);
  const end = nextName ? text.indexOf(`function ${nextName}`, start + 1) : text.length;
  return text.slice(start, end === -1 ? text.length : end);
}
function walk(directory, depth = 0) {
  if (!existsSync(directory) || depth > 8) return [];
  const result = [];
  for (const entry of readdirSync(directory)) {
    if (["node_modules", ".next", ".git", "build", "dist"].includes(entry)) continue;
    const path = join(directory, entry);
    let info;
    try { info = statSync(path); } catch { continue; }
    if (info.isDirectory()) result.push(...walk(path, depth + 1));
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry)) result.push(path);
  }
  return result;
}
function projectSources() {
  return ["app", "components", "lib", "mobile", "apps", "src"].flatMap((path) => walk(absolute(path))).map((path) => ({ path: relative(root, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }));
}

test("Gemini keys are server-only and encrypted with authenticated encryption", () => {
  const keys = source("lib/ai-keys.ts");
  assert.match(keys, /import\s+["']server-only["']/);
  assert.match(keys, /AI_KEYS_ENCRYPTION_KEY/);
  assert.match(keys, /aes-256-gcm/i);
  assert.match(keys, /createCipheriv/);
  assert.match(keys, /getAuthTag/);
  assert.match(keys, /setAuthTag/);
  assert.match(keys, /timingSafeEqual|fingerprint/i);
  assert.match(keys, /mask/i);
});

test("Gemini rotation never leaks keys and has bounded failover", () => {
  const gemini = source("lib/gemini.ts");
  assert.match(gemini, /import\s+["']server-only["']/);
  assert.match(gemini, /["']x-goog-api-key["']\s*:/i);
  assert.doesNotMatch(gemini, /[?&]key=/i);
  assert.match(gemini, /cooldown/i);
  assert.match(gemini, /429/);
  assert.match(gemini, /408/);
  assert.match(gemini, /status\s*>?=\s*500|5\d\d/);
  assert.match(gemini, /(?:MAX_(?:KEY_)?ATTEMPTS|MAX_PROVIDER_ATTEMPTS)\s*=\s*[123]\b|\.slice\(0,\s*[123]\)/);
  assert.match(gemini, /overall.*(?:deadline|timeout)|deadlineAt|requestDeadline/i);
  assert.doesNotMatch(gemini, /throw[^\n]*(?:await\s+)?response\.(?:text|json)\(\)|message\s*:\s*(?:await\s+)?response\.(?:text|json)\(\)/);
});

test("AI files accept only safe faithfully supported types", () => {
  const files = source("lib/ai-files.ts");
  assert.match(files, /application\/pdf/);
  assert.match(files, /image\//);
  assert.match(files, /text\//);
  assert.doesNotMatch(files, /vnd\.openxmlformats-officedocument|application\/msword|application\/vnd\.ms-powerpoint/i);
  assert.match(files, /signature|magic|header/i);
  assert.match(files, /PDF.*(?:recommended|best)|export.*PDF|PDF.*export/i);
});

test("upload enforces entitlement hard size quota concurrency and provider scan", () => {
  const route = source("app/api/ai/files/route.ts");
  const combined = `${route}\n${source("lib/ai-files.ts")}\n${source("lib/ai-platform.ts")}`;
  assert.match(route, /getAiUsageStatuses|assertAiServiceAvailable|beginAiUsage/);
  assert.match(combined, /20\s*\*\s*1024\s*\*\s*1024|20_000_000|AI_(?:HARD_)?MAX_FILE_BYTES/);
  assert.match(combined, /(?:storage|upload).*(?:quota|limit).*(?:bytes|size)|AI_STORAGE_MAX_BYTES/i);
  assert.match(combined, /(?:storage|upload).*(?:quota|limit).*(?:count|files)|AI_STORAGE_MAX_FILES/i);
  assert.match(combined, /semaphore|uploadSlot|activeUploads|maxConcurrent/i);
  assert.match(route, /scanStoredFile\([\s\S]{0,500}storageProvider|scanStoredFile\([\s\S]{0,500}provider\s*:/);
  const availability = route.search(/getAiUsageStatuses|assertAiServiceAvailable|beginAiUsage/);
  const persistence = route.search(/uploadFile|putObject|storeFile|storage\.put|insert\(aiFiles\)/);
  assert.ok(availability >= 0 && persistence >= 0 && availability < persistence);
});

test("provider failures have billable semantics and expiring leases", () => {
  const combined = `${source("lib/ai-platform.ts")}\n${source("db/schema.ts")}\n${source("lib/ai-generation.ts")}\n${source("app/api/ai/files/[id]/actions/route.ts")}\n${source("app/api/ai/conversations/[id]/messages/route.ts")}`;
  assert.match(combined, /billable_failed/);
  assert.match(combined, /lease|processingExpiresAt|processing_expires_at|reservationExpiresAt/i);
  assert.match(combined, /providerStarted|requestSent|billable\s*:/i);
});

test("conversation PATCH and DELETE are authenticated same-origin and limited", () => {
  const route = source("app/api/ai/conversations/[id]/route.ts");
  assert.match(route, /requireAuth|currentUser|getCurrentUser|session/i);
  assert.match(route, /sameOrigin|assertSameOrigin|origin/i);
  assert.ok((route.match(/rateLimit|checkRateLimit|consumeRateLimit|enforceRateLimit/g) || []).length >= 2);
  assert.match(route, /export\s+async\s+function\s+PATCH/);
  assert.match(route, /export\s+async\s+function\s+DELETE/);
});

test("AI checkout uses server price and idempotency", () => {
  const checkout = source("app/api/ai/subscription/checkout/route.ts");
  assert.match(checkout, /getAiMonthlyPrice/);
  assert.doesNotMatch(checkout, /body\.(?:amount|price)|input\.(?:amount|price)/);
  assert.match(checkout, /Idempotency-Key|idempotency/i);
  assert.match(checkout, /checkoutKey/);
  assert.match(checkout, /pg_advisory_xact_lock/);
  assert.match(checkout, /product\s*:\s*["']meras-ai["']/);
  assert.match(checkout, /ai_order_number/);
  assert.match(checkout, /\/study-tools\/subscribe/);
});

test("Tap state machine cannot resurrect refunded AI access", () => {
  const webhook = source("app/api/webhooks/tap/route.ts");
  assert.match(webhook, /handleAiSubscriptionCharge/);
  assert.match(webhook, /metadata\?\.product[\s\S]{0,120}["']meras-ai["']/);
  assert.match(webhook, /amountMatches/);
  assert.match(webhook, /currencyMatches/);
  assert.match(webhook, /emailMatches/);
  assert.match(webhook, /current\.status\s*===\s*["']refunded["'][\s\S]{0,180}return|includes\(current\.status\)[\s\S]{0,180}return/);
  assert.match(webhook, /startsAt\s*:\s*base/);
  const refundBody = functionBody(webhook, "handleRefundWebhook", "plusCalendarMonth");
  assert.match(refundBody, /aiSubscriptionOrders/);
  assert.match(refundBody, /aiEntitlements[\s\S]{0,500}(?:revoked|status\s*:\s*["']revoked["'])/);
  const refundAccounting = `${refundBody}\n${source("lib/refunds.ts")}`;
  assert.match(refundAccounting, /paymentEvents[\s\S]*(?:sum|refundedAmountMinor)/i);
});

test("student and admin web pages implement the stable contract", () => {
  const student = `${source("app/meras-ai/page.tsx")}\n${source("components/meras-ai-workspace.tsx")}\n${source("components/ai-subscription-checkout.tsx")}`;
  const admin = `${source("app/admin/ai/page.tsx")}\n${source("components/admin-ai-center.tsx")}`;
  assert.match(student, /\/api\/ai\/status/);
  assert.match(student, /\/api\/ai\/conversations/);
  assert.match(student, /\/api\/ai\/files/);
  for (const action of ["summary", "translation", "quiz"]) assert.match(student, new RegExp(action));
  assert.match(student, /dir\s*=\s*["']rtl["']|direction\s*:\s*["']?rtl/i);
  assert.match(student, /PDF/);
  assert.match(admin, /\/api\/admin\/ai/);
  for (const action of ["saveService", "addKey", "updateKey", "grantEntitlement", "updateEntitlement"]) assert.match(admin, new RegExp(action));
  assert.doesNotMatch(admin, /encryptedKey|ciphertext|authTag/);
});

test("mobile exposes AI status history actions quiz and deep links", () => {
  const sources = projectSources().filter(({ path }) => /mobile|native|expo/i.test(path));
  assert.ok(sources.length, "No mobile application sources were found");
  const combined = sources.map(({ path, text }) => `\n/* ${path} */\n${text}`).join("\n");
  assert.match(combined, /\/api\/ai\/status/);
  assert.match(combined, /\/api\/ai\/conversations/);
  assert.match(combined, /\/api\/ai\/files/);
  for (const action of ["summary", "translation", "quiz"]) assert.match(combined, new RegExp(action));
  assert.match(combined, /\/meras-ai\/subscribe|meras-ai.*subscribe|deepLinks\.subscribe/i);
  assert.match(combined, /deepLink|actionUrl|route/i);
});

test("AI environment variables are documented without live keys", () => {
  const env = source(".env.example");
  const railway = source("RAILWAY_VARIABLES.example");
  for (const name of ["GEMINI_API_KEYS", "AI_KEYS_ENCRYPTION_KEY", "AI_MONTHLY_PRICE_SAR", "AI_MAX_STORED_BYTES_PER_USER", "AI_MAX_STORED_FILES_PER_USER", "AI_MAX_CONCURRENT_FILE_ACTIONS"]) {
    assert.match(env, new RegExp(`^${name}=`, "m"));
    assert.match(railway, new RegExp(`^${name}=`, "m"));
  }
  assert.doesNotMatch(`${env}\n${railway}`, /AIza[0-9A-Za-z_-]{25,}/);
});
