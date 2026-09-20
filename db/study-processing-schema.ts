import { sql } from "drizzle-orm";
import { integer, text, pgTable, primaryKey, index, foreignKey, boolean } from "drizzle-orm/pg-core";
import { aiFileJobs } from "./schema";

export const studyJobPlans = pgTable("study_job_plans", {
  jobId: text("job_id").primaryKey().references(() => aiFileJobs.id, { onDelete: "cascade" }),
  planJson: text("plan_json").notNull(), sha256: text("sha256").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
});
export const studyJobParts = pgTable("study_job_parts", {
  jobId: text("job_id").notNull().references(() => aiFileJobs.id, { onDelete: "cascade" }),
  partId: text("part_id").notNull(), parentId: text("parent_id"), status: text("status").notNull().default("pending"),
  inputJson: text("input_json").notNull(), inputSha256: text("input_sha256").notNull(),
  resultJson: text("result_json"), resultSha256: text("result_sha256"), attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, table => [primaryKey({ columns: [table.jobId, table.partId] }), index("study_job_parts_pending_idx").on(table.jobId, table.status, table.partId)]);
export const studyJobAttempts = pgTable("study_job_attempts", {
  id: text("id").primaryKey(), jobId: text("job_id").notNull(), partId: text("part_id").notNull(),
  leaseOwner: text("lease_owner").notNull(), status: text("status").notNull().default("started"),
  billable: boolean("billable").notNull().default(true), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"),
  model: text("model").notNull(), keyId: integer("key_id"), errorCode: text("error_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, table => [foreignKey({ columns: [table.jobId, table.partId], foreignColumns: [studyJobParts.jobId, studyJobParts.partId] }).onDelete("cascade"), index("study_job_attempts_job_idx").on(table.jobId, table.status)]);
