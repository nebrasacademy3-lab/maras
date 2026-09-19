import { sql } from "drizzle-orm";
import { customType, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { aiArtifacts, users } from "./schema";
const bytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const studyPdfExports = pgTable("study_pdf_exports", {
  id: uuid("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  artifactId: integer("artifact_id").notNull().references(() => aiArtifacts.id, { onDelete: "cascade" }),
  inputDigest: text("input_digest").notNull(),
  sourceDigest: text("source_digest").notNull(),
  rendererVersion: text("renderer_version").notNull(),
  status: text("status").notNull().default("rendering"),
  owner: uuid("owner"),
  leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "string" }),
  data: bytes("data"),
  sha256: text("sha256"),
  errorCode: text("error_code"),
  attempts: integer("attempts").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()`),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().default(sql`clock_timestamp()`),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
}, table => [uniqueIndex("study_pdf_owner_input_unique").on(table.userId, table.artifactId, table.inputDigest), index("study_pdf_expiry_idx").on(table.expiresAt), index("study_pdf_rendering_idx").on(table.status, table.leaseUntil)]);
