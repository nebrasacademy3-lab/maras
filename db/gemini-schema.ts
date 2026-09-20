import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Verified control-plane evidence; never populated from projectLabel.
export const geminiProjects = pgTable("gemini_projects", {
  projectNumber: text("project_number").primaryKey(), projectId: text("project_id").notNull().unique(),
  planDigest: text("plan_digest"), billingState: text("billing_state").notNull(), evidenceDigest: text("evidence_digest").notNull(), revision: text("revision").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(), validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
}, t => [check("gemini_projects_plan_digest_check", sql`${t.planDigest} IS NULL OR ${t.planDigest} ~ '^[a-f0-9]{64}$'`), check("gemini_projects_project_number_check", sql`${t.projectNumber} ~ '^[1-9][0-9]{5,20}$'`), check("gemini_projects_billing_state_check", sql`${t.billingState} IN ('unlinked','linked','disabled')`), check("gemini_projects_evidence_digest_check", sql`${t.evidenceDigest} ~ '^[a-f0-9]{64}$'`), check("gemini_projects_check", sql`${t.validUntil} <= ${t.verifiedAt} + interval '15 minutes'`)]);
export const geminiProjectKeys = pgTable("gemini_project_keys", {
  fingerprint: text("fingerprint").primaryKey(), projectNumber: text("project_number").notNull().references(() => geminiProjects.projectNumber), resourceName: text("resource_name").notNull().unique(),
}, t => [index("gemini_project_keys_project_idx").on(t.projectNumber), check("gemini_project_keys_fingerprint_check", sql`${t.fingerprint} ~ '^[a-f0-9]{64}$'`)]);
export const geminiProjectLimits = pgTable("gemini_project_limits", {
  projectNumber: text("project_number").notNull().references(() => geminiProjects.projectNumber), model: text("model").notNull(),
  rpm: integer("rpm").notNull(), tpm: integer("tpm").notNull(), rpd: integer("rpd").notNull(), concurrent: integer("concurrent").notNull(),
  inputTokens: integer("input_tokens").notNull(), outputTokens: integer("output_tokens").notNull(), enabled: boolean("enabled").notNull().default(true), backoffUntil: timestamp("backoff_until", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.projectNumber, t.model] }),
  check("gemini_project_limits_rpm_check", sql`${t.rpm} BETWEEN 1 AND 6000`), check("gemini_project_limits_tpm_check", sql`${t.tpm} BETWEEN 1 AND 100000000`), check("gemini_project_limits_rpd_check", sql`${t.rpd} BETWEEN 1 AND 1000000`),
  check("gemini_project_limits_concurrent_check", sql`${t.concurrent} BETWEEN 1 AND 32 AND ${t.concurrent} <= ${t.rpm}`), check("gemini_project_limits_input_tokens_check", sql`${t.inputTokens} BETWEEN 1 AND 2000000 AND ${t.inputTokens} <= ${t.tpm}`), check("gemini_project_limits_output_tokens_check", sql`${t.outputTokens} BETWEEN 1 AND 65536`)]);
export const geminiProjectReservations = pgTable("gemini_project_reservations", {
  id: text("id").primaryKey(), projectNumber: text("project_number").notNull().references(() => geminiProjects.projectNumber), fingerprint: text("fingerprint").notNull(), model: text("model").notNull(), revision: text("revision").notNull(),
  inputTokens: integer("input_tokens").notNull(), state: text("state").notNull(), quotaDay: text("quota_day").notNull(), dispatchDay: text("dispatch_day"),
  activeUntil: timestamp("active_until", { withTimezone: true }).notNull(), windowUntil: timestamp("window_until", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
}, t => [index("gemini_reservations_quota_idx").on(t.projectNumber, t.model, t.windowUntil), index("gemini_reservations_day_idx").on(t.projectNumber, t.model, t.quotaDay), check("gemini_project_reservations_input_tokens_check", sql`${t.inputTokens} BETWEEN 0 AND 2000000`), check("gemini_project_reservations_state_check", sql`${t.state} IN ('counting','running','settled','uncertain')`)]);

// Non-secret, centrally registered plans. Credentials are read from a rotated private file.
export const geminiProjectRefresh = pgTable("gemini_project_refresh", {
  projectNumber: text("project_number").primaryKey().references(() => geminiProjects.projectNumber),
  planJson: text("plan_json").notNull(), planDigest: text("plan_digest").notNull(), planRevision: text("plan_revision").notNull(),
  enabled: boolean("enabled").notNull().default(false), state: text("state").notNull().default("disabled"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  leaseId: text("lease_id"), leaseUntil: timestamp("lease_until", { withTimezone: true }), failures: integer("failures").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }), lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
}, t => [index("gemini_refresh_due_idx").on(t.enabled, t.nextAttemptAt),
  check("gemini_project_refresh_plan_json_check", sql`octet_length(${t.planJson}) BETWEEN 1 AND 65536`),
  check("gemini_project_refresh_plan_digest_check", sql`${t.planDigest} ~ '^[a-f0-9]{64}$'`),
  check("gemini_project_refresh_state_check", sql`${t.state} IN ('disabled','verified','checking','failed')`),
  check("gemini_project_refresh_failures_check", sql`${t.failures} BETWEEN 0 AND 32`),
  check("gemini_project_refresh_last_error_check", sql`${t.lastError} IN ('TOKEN_UNAVAILABLE','VERIFICATION_FAILED','PLAN_INVALID')`),
  check("gemini_project_refresh_check", sql`(${t.leaseId} IS NULL) = (${t.leaseUntil} IS NULL)`),
  check("gemini_project_refresh_check1", sql`${t.enabled} OR (${t.state} = 'disabled' AND ${t.leaseId} IS NULL)`)]);
