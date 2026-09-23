import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, serial, text, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { users, catalogCourses, videoAssets } from "./schema";

// Instructor content is isolated from the published catalog until owner review.
export const instructorProfiles = pgTable("instructor_profiles", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "restrict" }),
  country: text("country").notNull(),
  gender: text("gender").notNull(),
  qualification: text("qualification").notNull(),
  specialty: text("specialty").notNull(),
  addressEncrypted: text("address_encrypted").notNull(),
  bio: text("bio").notNull().default(""),
  teachingSubjects: text("teaching_subjects").notNull().default(""),
  compensationModel: text("compensation_model").notNull().default("hourly"),
  status: text("status").notNull().default("draft"),
  reviewNotes: text("review_notes").notNull().default(""),
  bankEncrypted: text("bank_encrypted"),
  submittedAt: text("submitted_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: text("reviewed_at"),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, t => [index("instructor_profiles_status_idx").on(t.status, t.createdAt), check("instructor_profile_status_check", sql`${t.status} IN ('draft','submitted','changes_requested','approved','rejected','suspended')`), check("instructor_compensation_check", sql`${t.compensationModel} IN ('hourly','course')`), check("instructor_gender_check", sql`${t.gender} IN ('male','female')`), check("instructor_profile_revision_check", sql`${t.revision} > 0`)]);

export const instructorDocuments = pgTable("instructor_documents", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => instructorProfiles.userId, { onDelete: "restrict" }),
  kind: text("kind").notNull(), objectKey: text("object_key").notNull(), storageProvider: text("storage_provider").notNull(),
  originalName: text("original_name").notNull(), contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(), expiresAt: text("expires_at"), identityLegalBasis: text("identity_legal_basis"), scanStatus: text("scan_status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, t => [index("instructor_documents_owner_idx").on(t.userId, t.kind), index("instructor_documents_expiry_idx").on(t.expiresAt).where(sql`${t.expiresAt} IS NOT NULL`), check("instructor_document_provider_check", sql`${t.storageProvider} IN ('local','s3')`), check("instructor_document_scan_check", sql`${t.scanStatus} IN ('pending','clean','quarantined')`), uniqueIndex("instructor_document_object_unique").on(t.objectKey), check("instructor_document_kind_check", sql`${t.kind} IN ('identity_front','identity_back','passport','selfie','cv','certificate')`), check("instructor_document_size_check", sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 10485760`)]);

export const instructorContracts = pgTable("instructor_contracts", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => instructorProfiles.userId, { onDelete: "restrict" }),
  version: integer("version").notNull(), status: text("status").notNull().default("draft"),
  title: text("title").notNull(), termsAr: text("terms_ar").notNull(), termsEn: text("terms_en").notNull(),
  compensationModel: text("compensation_model").notNull(), rateHalalas: integer("rate_halalas").notNull(),
  employmentJson: text("employment_json").notNull().default("{}"),
  trialDays: integer("trial_days").notNull().default(30),
  trialTermsAr: text("trial_terms_ar").notNull(), trialTermsEn: text("trial_terms_en").notNull(),
  organizationJson: text("organization_json").notNull(), instructorJson: text("instructor_json").notNull(),
  contentHash: text("content_hash"), signatureJson: text("signature_json"), signatureHash: text("signature_hash"),
  signedIp: text("signed_ip"), signedUserAgent: text("signed_user_agent"),
  createdBy: integer("created_by").notNull().references(() => users.id), offeredAt: text("offered_at"), signedAt: text("signed_at"),
  revision: integer("revision").notNull().default(1), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, t => [unique("instructor_contract_owner_unique").on(t.id,t.userId), check("instructor_contract_version_check", sql`${t.version} > 0`), check("instructor_contract_revision_check", sql`${t.revision} > 0`), check("instructor_contract_trial_check", sql`${t.trialDays} BETWEEN 0 AND 180`), check("instructor_signed_evidence_check", sql`${t.status} NOT IN ('signed','terminated') OR (${t.contentHash} IS NOT NULL AND ${t.signatureJson} IS NOT NULL AND ${t.signatureHash} IS NOT NULL AND ${t.signedAt} IS NOT NULL)`), uniqueIndex("instructor_contract_version_unique").on(t.userId, t.version), index("instructor_contract_status_idx").on(t.userId, t.status), uniqueIndex("instructor_contract_active_unique").on(t.userId).where(sql`${t.status} = 'signed'`), check("instructor_contract_status_check", sql`${t.status} IN ('draft','offered','signed','withdrawn','terminated')`), check("instructor_contract_rate_check", sql`${t.rateHalalas} > 0 AND ${t.rateHalalas} <= 100000000`), check("instructor_contract_model_check", sql`${t.compensationModel} IN ('hourly','course')`)]);

export const instructorAssignments = pgTable("instructor_assignments", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => instructorProfiles.userId, { onDelete: "restrict" }),
  courseSlug: text("course_slug").notNull().references(() => catalogCourses.slug, { onDelete: "restrict" }),
  contractId: integer("contract_id").notNull(),
  assignedBy: integer("assigned_by").notNull().references(() => users.id), status: text("status").notNull().default("assigned"),
  instructions: text("instructions").notNull().default(""), reviewNotes: text("review_notes").notNull().default(""),
  structureImportedAt: text("structure_imported_at"),
  revision: integer("revision").notNull().default(1), submittedAt: text("submitted_at"), publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, t => [foreignKey({name:"instructor_assignment_contract_owner_fk",columns:[t.contractId,t.userId],foreignColumns:[instructorContracts.id,instructorContracts.userId]}).onDelete("restrict"), check("instructor_assignment_revision_check", sql`${t.revision} > 0`), index("instructor_assignments_owner_idx").on(t.userId, t.status), uniqueIndex("instructor_assignment_course_unique").on(t.courseSlug).where(sql`${t.status} <> 'cancelled'`), check("instructor_assignment_status_check", sql`${t.status} IN ('assigned','in_progress','submitted','changes_requested','published','cancelled')`)]);

export const instructorUnits = pgTable("instructor_units", {
  id: serial("id").primaryKey(), assignmentId: integer("assignment_id").notNull().references(() => instructorAssignments.id, { onDelete: "cascade" }),
  sourceUnitId: integer("source_unit_id"),
  title: text("title").notNull(), description: text("description").notNull().default(""), position: integer("position").notNull().default(0),
}, t => [index("instructor_units_assignment_idx").on(t.assignmentId, t.position), uniqueIndex("instructor_units_source_unique").on(t.assignmentId, t.sourceUnitId), check("instructor_unit_position_check", sql`${t.position} >= 0`)]);

export const instructorLessons = pgTable("instructor_lessons", {
  id: serial("id").primaryKey(), unitId: integer("unit_id").notNull().references(() => instructorUnits.id, { onDelete: "cascade" }),
  sourceLessonId: text("source_lesson_id"),
  title: text("title").notNull(), description: text("description").notNull().default(""), position: integer("position").notNull().default(0),
  videoAssetId: integer("video_asset_id").references(() => videoAssets.id, { onDelete: "restrict" }),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, t => [index("instructor_lessons_unit_idx").on(t.unitId, t.position), uniqueIndex("instructor_lessons_source_unique").on(t.unitId, t.sourceLessonId), check("instructor_lesson_position_check", sql`${t.position} >= 0`), check("instructor_lesson_duration_check", sql`${t.durationSeconds} >= 0`)]);
