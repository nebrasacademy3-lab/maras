import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("paid Gemini fallback is fail-closed, free-first and budget-gated", () => {
  const gemini = source("lib/gemini.ts");
  const budget = source("lib/ai-paid-budget.ts");
  const keys = source("lib/ai-keys.ts");
  assert.match(gemini, /tier === "free"/);
  assert.match(gemini, /AI_QUOTA_EXHAUSTED/);
  assert.match(gemini, /allEligibleFreeExhausted/);
  assert.match(gemini, /reserveAiPaidBudget/);
  assert.match(gemini, /providerTier: tier/);
  assert.match(keys, /GEMINI_PAID_API_KEYS/);
  assert.match(keys, /geminiProjectTier/);
  assert.match(budget, /enabled: false/);
  assert.match(budget, /AI_PAID_FALLBACK_DISABLED/);
  assert.match(budget, /AI_PAID_BUDGET_EXHAUSTED/);
  assert.match(budget, /pg_advisory_xact_lock/);
  assert.match(budget, /ai_paid_budget/);
});

test("paid usage is auditable and bounded in the database contract", () => {
  const schema = source("db/schema.ts");
  const migration = source("drizzle/0034_ai_paid_budget.sql");
  const journal = source("drizzle/meta/_journal.json");
  assert.match(schema, /providerTier: text\("provider_tier"\)/);
  assert.match(migration, /provider_tier/);
  assert.match(migration, /provider_tier_check/);
  assert.match(journal, /0034_ai_paid_budget/);
  assert.match(source("lib/ai-platform.ts"), /providerTier\?: "free" \| "paid"/);
  assert.match(source("app/api/admin/ai/route.ts"), /setPaidFallback/);
});
