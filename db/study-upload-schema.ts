import { integer, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
/** Owner and conversation tombstones intentionally survive account deletion.
 * Cleanup must not lose its durable storage inventory through a cascading FK. */
export const studyUploadSessions = pgTable("study_upload_sessions", {
  id: text("id").primaryKey(), ownerId: integer("owner_id").notNull(), requestKey: text("request_key").notNull(),
  conversationId: integer("conversation_id"), fileId: integer("file_id"),
  originalName: text("original_name").notNull(), contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(),
  hashesJson: text("hashes_json").notNull(), receivedJson: text("received_json").notNull().default("[]"),
  objectKey: text("object_key").notNull(), provider: text("provider").notNull(), locationFingerprint: text("location_fingerprint").notNull(),
  status: text("status").notNull().default("open"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("study_upload_owner_request_uq").on(table.ownerId, table.requestKey), index("study_upload_expiry_idx").on(table.status, table.expiresAt)]);
