import { sql } from "drizzle-orm";
import { boolean, foreignKey, index, integer, pgTable, primaryKey, real, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  phone: text("phone"),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("student"),
  emailVerifiedAt: text("email_verified_at"),
  phoneVerifiedAt: text("phone_verified_at"),
  universitySlug: text("university_slug"),
  specialty: text("specialty"),
  academicLevel: text("academic_level"),
  profileCompletedAt: text("profile_completed_at"),
  onboardingCompletedAt: text("onboarding_completed_at"),
  lastLoginAt: text("last_login_at"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("users_email_unique").on(table.email), uniqueIndex("users_phone_unique").on(table.phone)]);

export const courseRequests = pgTable("course_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  university: text("university").notNull(),
  universitySlug: text("university_slug"),
  specialty: text("specialty").notNull(),
  courseName: text("course_name").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  notes: text("notes").notNull().default(""),
  courseUrl: text("course_url"),
  notify: boolean("notify").notNull().default(true),
  status: text("status").notNull().default("new"),
  assignedSupervisorId: integer("assigned_supervisor_id"),
  preparedCourseSlug: text("prepared_course_slug"),
  attachmentsCount: integer("attachments_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("course_requests_course_idx").on(table.courseName), index("course_requests_status_idx").on(table.status), index("course_requests_user_idx").on(table.userId), index("course_requests_supervisor_idx").on(table.assignedSupervisorId, table.status)]);

export const courseRequestFiles = pgTable("course_request_files", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  userId: integer("user_id").notNull(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  scanStatus: text("scan_status").notNull().default("pending"),
  scanProvider: text("scan_provider"),
  scannedAt: text("scanned_at"),
  scanError: text("scan_error"),
  quarantineReason: text("quarantine_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("course_request_files_object_unique").on(table.objectKey), index("course_request_files_request_idx").on(table.requestId)]);

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull(),
  userEmail: text("user_email"),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("normal"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  contactChannel: text("contact_channel").notNull().default("in_app"),
  status: text("status").notNull().default("new"),
  assignedTo: text("assigned_to"),
  tagsJson: text("tags_json").notNull().default("[]"),
  firstResponseAt: text("first_response_at"),
  resolvedAt: text("resolved_at"),
  satisfactionRating: integer("satisfaction_rating"),
  satisfactionComment: text("satisfaction_comment"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("support_ticket_number_unique").on(table.ticketNumber), index("support_status_idx").on(table.status), index("support_user_idx").on(table.userEmail)]);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  courseSlug: text("course_slug").notNull(),
  subtotal: real("subtotal").notNull(),
  discount: real("discount").notNull().default(0),
  couponCode: text("coupon_code"),
  total: real("total").notNull(),
  currency: text("currency").notNull().default("SAR"),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method").notNull().default("tap"),
  checkoutKey: text("checkout_key"),
  checkoutUrl: text("checkout_url"),
  tapChargeId: text("tap_charge_id"),
  bundleSlug: text("bundle_slug"),
  subtotalMinor: integer("subtotal_minor"),
  discountMinor: integer("discount_minor"),
  taxAmountMinor: integer("tax_amount_minor"),
  totalMinor: integer("total_minor"),
  providerFeeMinor: integer("provider_fee_minor"),
  settledNetMinor: integer("settled_net_minor"),
  settlementStatus: text("settlement_status").notNull().default("unreconciled"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  paidAt: text("paid_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("orders_number_unique").on(table.orderNumber), uniqueIndex("orders_checkout_key_unique").on(table.checkoutKey), index("orders_customer_idx").on(table.customerEmail), index("orders_status_idx").on(table.status), uniqueIndex("orders_tap_charge_unique").on(table.tapChargeId)]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  courseSlug: text("course_slug").notNull(),
  unitPrice: real("unit_price").notNull(),
  discount: real("discount").notNull().default(0),
  total: real("total").notNull(),
  accessDurationDays: integer("access_duration_days").notNull().default(90),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("order_items_order_course_unique").on(table.orderNumber, table.courseSlug), index("order_items_order_idx").on(table.orderNumber), index("order_items_course_idx").on(table.courseSlug)]);

export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("tap"),
  providerEventId: text("provider_event_id"),
  orderNumber: text("order_number"),
  chargeId: text("charge_id"),
  objectType: text("object_type"),
  eventType: text("event_type"),
  amountMinor: integer("amount_minor"),
  currency: text("currency"),
  signatureVerified: boolean("signature_verified").notNull().default(false),
  processedAt: text("processed_at"),
  status: text("status").notNull(),
  payload: text("payload").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("payment_events_provider_event_unique").on(table.providerEventId), index("payment_events_charge_idx").on(table.chargeId), index("payment_events_order_idx").on(table.orderNumber)]);

export const courseAccess = pgTable("course_access", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  source: text("source").notNull().default("purchase"),
  orderNumber: text("order_number"),
  startsAt: text("starts_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  expiresAt: text("expires_at"),
  suspendedAt: text("suspended_at"),
  suspensionReason: text("suspension_reason"),
  revokedAt: text("revoked_at"),
  revocationReason: text("revocation_reason"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("course_access_user_course_unique").on(table.userEmail, table.courseSlug), index("course_access_course_idx").on(table.courseSlug)]);

export const courseAccessEvents = pgTable("course_access_events", {
  id: serial("id").primaryKey(),
  eventKey: text("event_key").notNull(),
  accessId: integer("access_id"),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  action: text("action").notNull(),
  actorEmail: text("actor_email"),
  reason: text("reason"),
  orderNumber: text("order_number"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("course_access_events_key_unique").on(table.eventKey), index("course_access_events_access_idx").on(table.userEmail, table.courseSlug, table.createdAt)]);

export const lessonProgress = pgTable("lesson_progress", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  lessonId: text("lesson_id").notNull(),
  watchedSeconds: integer("watched_seconds").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("lesson_progress_unique").on(table.userEmail, table.lessonId), index("lesson_progress_course_idx").on(table.courseSlug)]);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("audit_actor_idx").on(table.actorEmail), index("audit_entity_idx").on(table.entityType, table.entityId)]);

export const videoAssets = pgTable("video_assets", {
  id: serial("id").primaryKey(),
  courseSlug: text("course_slug").notNull(),
  lessonId: text("lesson_id").notNull(),
  objectKey: text("object_key").notNull(),
  storageProvider: text("storage_provider").notNull().default("local"),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").notNull().default("uploading"),
  durationSeconds: integer("duration_seconds"),
  processingStatus: text("processing_status").notNull().default("queued"),
  processingProgress: integer("processing_progress").notNull().default(0),
  processingError: text("processing_error"),
  sourceWidth: integer("source_width"),
  sourceHeight: integer("source_height"),
  hlsMasterObjectKey: text("hls_master_object_key"),
  thumbnailObjectKey: text("thumbnail_object_key"),
  derivativesPrefix: text("derivatives_prefix"),
  processedAt: text("processed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("video_object_key_unique").on(table.objectKey), index("video_lesson_idx").on(table.courseSlug, table.lessonId), index("video_processing_status_idx").on(table.processingStatus, table.updatedAt)]);

export const videoRenditions = pgTable("video_renditions", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  qualityLabel: text("quality_label").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bitrateKbps: integer("bitrate_kbps").notNull(),
  codec: text("codec").notNull().default("h264"),
  audioCodec: text("audio_codec").notNull().default("aac"),
  manifestObjectKey: text("manifest_object_key").notNull(),
  segmentPrefix: text("segment_prefix").notNull(),
  status: text("status").notNull().default("processing"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("video_renditions_asset_quality_unique").on(table.assetId, table.qualityLabel),
  index("video_renditions_asset_status_idx").on(table.assetId, table.status),
  foreignKey({ name: "video_renditions_asset_fk", columns: [table.assetId], foreignColumns: [videoAssets.id] }).onDelete("cascade"),
]);

export const videoProcessingJobs = pgTable("video_processing_jobs", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: text("next_attempt_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  lockedAt: text("locked_at"),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("video_processing_jobs_asset_unique").on(table.assetId),
  index("video_processing_jobs_claim_idx").on(table.status, table.nextAttemptAt, table.lockedAt),
  foreignKey({ name: "video_processing_jobs_asset_fk", columns: [table.assetId], foreignColumns: [videoAssets.id] }).onDelete("cascade"),
]);

export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  anonymousId: text("anonymous_id"),
  userEmail: text("user_email"),
  courseSlug: text("course_slug"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("analytics_event_idx").on(table.event), index("analytics_course_idx").on(table.courseSlug)]);

export const catalogInstitutions = pgTable("catalog_institutions", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull().default(""),
  region: text("region").notNull(),
  type: text("type").notNull(),
  logoUrl: text("logo_url"),
  domain: text("domain"),
  directorySourceUrl: text("directory_source_url"),
  verificationStatus: text("verification_status").notNull().default("pending-review"),
  aliasesJson: text("aliases_json").notNull().default("[]"),
  status: text("status").notNull().default("published"),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("catalog_institutions_region_idx").on(table.region), index("catalog_institutions_status_idx").on(table.status)]);

export const catalogSpecialties = pgTable("catalog_specialties", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sourceUrl: text("source_url"),
  verifiedAt: text("verified_at"),
  verificationStatus: text("verification_status").notNull().default("pending-review"),
  faculty: text("faculty"),
  degree: text("degree"),
  status: text("status").notNull().default("published"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("catalog_specialties_name_unique").on(table.name)]);

export const institutionSpecialties = pgTable("institution_specialties", {
  id: serial("id").primaryKey(),
  institutionSlug: text("institution_slug").notNull(),
  specialtySlug: text("specialty_slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("published"),
}, (table) => [
  uniqueIndex("institution_specialties_unique").on(table.institutionSlug, table.specialtySlug),
  index("institution_specialties_lookup_idx").on(table.institutionSlug, table.status),
  foreignKey({ name: "institution_specialties_institution_fk", columns: [table.institutionSlug], foreignColumns: [catalogInstitutions.slug] }),
  foreignKey({ name: "institution_specialties_specialty_fk", columns: [table.specialtySlug], foreignColumns: [catalogSpecialties.slug] }),
]);

export const catalogCourses = pgTable("catalog_courses", {
  slug: text("slug").primaryKey(),
  institutionSlug: text("institution_slug").notNull(),
  specialtySlug: text("specialty_slug").notNull(),
  audienceScope: text("audience_scope").notNull().default("specialty"),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull().default(""),
  code: text("code"),
  description: text("description").notNull().default(""),
  coverImageUrl: text("cover_image_url"),
  price: real("price").notNull().default(0),
  oldPrice: real("old_price"),
  accessLabel: text("access_label").notNull().default("90 يومًا"),
  accessDurationDays: integer("access_duration_days").notNull().default(90),
  sourceUrl: text("source_url"),
  verifiedAt: text("verified_at"),
  status: text("status").notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  coverTheme: text("cover_theme").notNull().default("blue-violet"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  index("catalog_courses_institution_idx").on(table.institutionSlug),
  index("catalog_courses_specialty_idx").on(table.specialtySlug),
  index("catalog_courses_status_idx").on(table.status),
  foreignKey({ name: "catalog_courses_institution_fk", columns: [table.institutionSlug], foreignColumns: [catalogInstitutions.slug] }),
  foreignKey({ name: "catalog_courses_specialty_fk", columns: [table.specialtySlug], foreignColumns: [catalogSpecialties.slug] }),
  foreignKey({ name: "catalog_courses_institution_specialty_fk", columns: [table.institutionSlug, table.specialtySlug], foreignColumns: [institutionSpecialties.institutionSlug, institutionSpecialties.specialtySlug] }),
]);

export const courseResources = pgTable("course_resources", {
  id: serial("id").primaryKey(),
  courseSlug: text("course_slug").notNull().references(() => catalogCourses.slug, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  studentVisible: boolean("student_visible").notNull().default(false),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  scanStatus: text("scan_status").notNull().default("pending"),
  scanProvider: text("scan_provider"),
  scannedAt: text("scanned_at"),
  scanError: text("scan_error"),
  quarantineReason: text("quarantine_reason"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("course_resources_object_unique").on(table.objectKey),
  index("course_resources_course_idx").on(table.courseSlug, table.status, table.studentVisible, table.sortOrder),
  index("course_resources_scan_idx").on(table.scanStatus, table.status),
]);

export const courseUnitsDb = pgTable("course_units", {
  id: serial("id").primaryKey(),
  courseSlug: text("course_slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("course_units_course_idx").on(table.courseSlug, table.position)]);

export const lessonsDb = pgTable("lessons", {
  id: text("id").primaryKey(),
  courseSlug: text("course_slug").notNull(),
  unitId: integer("unit_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  freePreview: boolean("free_preview").notNull().default(false),
  status: text("status").notNull().default("draft"),
  videoAssetId: integer("video_asset_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("lessons_unit_idx").on(table.unitId, table.position), index("lessons_course_idx").on(table.courseSlug)]);

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("roles_key_unique").on(table.key)]);

export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  roleId: integer("role_id").notNull(),
  grantedBy: text("granted_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("user_roles_unique").on(table.userId, table.roleId), index("user_roles_role_idx").on(table.roleId)]);

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull(),
  permission: text("permission").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("role_permissions_unique").on(table.roleId, table.permission)]);

export const authSessions = pgTable("auth_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceId: text("device_id"),
  deviceLabel: text("device_label"),
  platform: text("platform").notNull().default("web"),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("auth_sessions_token_unique").on(table.tokenHash), index("auth_sessions_user_idx").on(table.userId), index("auth_sessions_device_idx").on(table.userId, table.deviceId, table.revokedAt)]);

export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowExpiresAt: text("window_expires_at").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
});

export const syncRevisions = pgTable("sync_revisions", {
  channel: text("channel").notNull(),
  scopeKey: text("scope_key").notNull().default("*"),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  primaryKey({ name: "sync_revisions_pk", columns: [table.channel, table.scopeKey] }),
  index("sync_revisions_channel_idx").on(table.channel, table.updatedAt),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("password_reset_token_unique").on(table.tokenHash), index("password_reset_user_idx").on(table.userId, table.expiresAt)]);

export const supervisorAssignments = pgTable("supervisor_assignments", {
  id: serial("id").primaryKey(),
  supervisorId: integer("supervisor_id").notNull(),
  institutionSlug: text("institution_slug"),
  specialty: text("specialty"),
  active: boolean("active").notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("supervisor_assignments_unique").on(table.supervisorId, table.institutionSlug, table.specialty), index("supervisor_assignments_user_idx").on(table.supervisorId, table.active), index("supervisor_assignments_scope_idx").on(table.institutionSlug, table.specialty)]);

export const otpChallenges = pgTable("otp_challenges", {
  id: serial("id").primaryKey(),
  destinationHash: text("destination_hash").notNull(),
  channel: text("channel").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("otp_destination_idx").on(table.destinationHash, table.expiresAt)]);

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("favorites_user_course_unique").on(table.userEmail, table.courseSlug)]);

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("cart_items_user_course_unique").on(table.userEmail, table.courseSlug), index("cart_items_user_idx").on(table.userEmail, table.createdAt)]);

export const lessonNotes = pgTable("lesson_notes", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  lessonId: text("lesson_id").notNull(),
  body: text("body").notNull().default(""),
  timestampSeconds: integer("timestamp_seconds").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("lesson_notes_user_lesson_idx").on(table.userEmail, table.lessonId), index("lesson_notes_lesson_time_idx").on(table.lessonId, table.timestampSeconds)]);

export const courseReviews = pgTable("course_reviews", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("course_reviews_user_course_unique").on(table.userEmail, table.courseSlug), index("course_reviews_status_idx").on(table.status), index("course_reviews_course_status_idx").on(table.courseSlug, table.status)]);

export const notificationsDb = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email"),
  audience: text("audience").notNull().default("user"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  actionUrl: text("action_url"),
  actionLabel: text("action_label"),
  presentation: text("presentation").notNull().default("inbox"),
  template: text("template").notNull().default("general"),
  dedupeKey: text("dedupe_key"),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  pushStatus: text("push_status").notNull().default("pending"),
  pushAttempts: integer("push_attempts").notNull().default(0),
  pushClaimedAt: text("push_claimed_at"),
  pushLastError: text("push_last_error"),
  pushDeliveredAt: text("push_delivered_at"),
  startsAt: text("starts_at"),
  expiresAt: text("expires_at"),
  dismissible: boolean("dismissible").notNull().default(true),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("notifications_dedupe_key_unique").on(table.dedupeKey), index("notifications_user_idx").on(table.userEmail, table.readAt), index("notifications_audience_idx").on(table.audience), index("notifications_push_dispatch_idx").on(table.pushEnabled, table.pushStatus, table.pushClaimedAt, table.startsAt)]);

export const notificationReads = pgTable("notification_reads", {
  notificationId: integer("notification_id").notNull().references(() => notificationsDb.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: text("read_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [primaryKey({ columns: [table.notificationId, table.userId] }), index("notification_reads_user_idx").on(table.userId, table.readAt)]);

export const pushDevices = pgTable("push_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  deviceId: text("device_id"),
  platform: text("platform").notNull(),
  deviceLabel: text("device_label"),
  status: text("status").notNull().default("active"),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("push_devices_token_unique").on(table.token), index("push_devices_user_idx").on(table.userId, table.status), index("push_devices_device_idx").on(table.userId, table.deviceId, table.status)]);

export const couponsDb = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  type: text("type").notNull().default("percent"),
  value: real("value").notNull(),
  courseSlug: text("course_slug"),
  ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull().default("campaign"),
  sourceKey: text("source_key"),
  title: text("title"),
  assignedBy: text("assigned_by"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  startsAt: text("starts_at"),
  expiresAt: text("expires_at"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("coupons_code_unique").on(table.code),
  uniqueIndex("coupons_source_key_unique").on(table.sourceKey),
  index("coupons_status_idx").on(table.status),
  index("coupons_owner_idx").on(table.ownerUserId, table.status),
]);

export const referralProgramSettings = pgTable("referral_program_settings", {
  id: serial("id").primaryKey(),
  programKey: text("program_key").notNull().default("default"),
  enabled: boolean("enabled").notNull().default(true),
  qualificationEvent: text("qualification_event").notNull().default("first_paid_order"),
  title: text("title").notNull().default("شارك مراس واكسب هداياك"),
  description: text("description").notNull().default("شارك رابطك الخاص، وكل تسجيل مؤهل يقربك من مكافأة جديدة."),
  terms: text("terms").notNull().default("تُحتسب الحسابات الجديدة الحقيقية فقط، وتخضع الحالات المتكررة أو غير الطبيعية للمراجعة."),
  maxQualifiedPerIpPerDay: integer("max_qualified_per_ip_per_day").notNull().default(3),
  defaultCouponValidityDays: integer("default_coupon_validity_days").notNull().default(90),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("referral_program_key_unique").on(table.programKey)]);

export const referralCodes = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  status: text("status").notNull().default("active"),
  shareCount: integer("share_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("referral_codes_user_unique").on(table.userId),
  uniqueIndex("referral_codes_code_unique").on(table.code),
  index("referral_codes_status_idx").on(table.status),
]);

export const referralTiers = pgTable("referral_tiers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  requiredReferrals: integer("required_referrals").notNull(),
  rewardType: text("reward_type").notNull().default("coupon_percent"),
  rewardValue: real("reward_value").notNull().default(0),
  rewardDurationDays: integer("reward_duration_days"),
  couponValidityDays: integer("coupon_validity_days"),
  courseSlug: text("course_slug"),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("referral_tiers_requirement_unique").on(table.requiredReferrals),
  index("referral_tiers_enabled_idx").on(table.enabled, table.sortOrder),
]);

export const referralAttributions = pgTable("referral_attributions", {
  id: serial("id").primaryKey(),
  referralCodeId: integer("referral_code_id").notNull().references(() => referralCodes.id, { onDelete: "cascade" }),
  referrerUserId: integer("referrer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referredUserId: integer("referred_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  qualificationEvent: text("qualification_event").notNull().default("first_paid_order"),
  ipHash: text("ip_hash"),
  deviceHash: text("device_hash"),
  reviewReason: text("review_reason"),
  qualifiedAt: text("qualified_at"),
  reviewedAt: text("reviewed_at"),
  reviewedBy: text("reviewed_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("referral_attributions_referred_unique").on(table.referredUserId),
  index("referral_attributions_referrer_idx").on(table.referrerUserId, table.status, table.createdAt),
  index("referral_attributions_ip_idx").on(table.referrerUserId, table.ipHash, table.createdAt),
  index("referral_attributions_device_status_idx").on(table.deviceHash, table.status),
  index("referral_attributions_ip_created_status_idx").on(table.ipHash, table.createdAt, table.status),
]);

export const userRewards = pgTable("user_rewards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referralTierId: integer("referral_tier_id").references(() => referralTiers.id, { onDelete: "set null" }),
  couponId: integer("coupon_id").references(() => couponsDb.id, { onDelete: "set null" }),
  sourceType: text("source_type").notNull().default("referral_tier"),
  sourceKey: text("source_key").notNull(),
  rewardType: text("reward_type").notNull(),
  rewardValue: real("reward_value").notNull().default(0),
  benefitPayloadJson: text("benefit_payload_json").notNull().default("{}"),
  status: text("status").notNull().default("active"),
  grantedBy: text("granted_by"),
  note: text("note"),
  issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  expiresAt: text("expires_at"),
  redeemedAt: text("redeemed_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("user_rewards_source_unique").on(table.sourceKey),
  index("user_rewards_user_idx").on(table.userId, table.status, table.issuedAt),
  index("user_rewards_type_idx").on(table.rewardType, table.status, table.expiresAt),
]);

export const couponUses = pgTable("coupon_uses", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => couponsDb.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderNumber: text("order_number").notNull(),
  status: text("status").notNull().default("reserved"),
  reservedAt: text("reserved_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  reservationExpiresAt: text("reservation_expires_at").notNull(),
  redeemedAt: text("redeemed_at"),
  releasedAt: text("released_at"),
}, (table) => [
  uniqueIndex("coupon_uses_order_unique").on(table.orderNumber),
  index("coupon_uses_coupon_status_idx").on(table.couponId, table.status),
  index("coupon_uses_user_idx").on(table.userId, table.status),
]);

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  orderNumber: text("order_number").notNull(),
  customerEmail: text("customer_email").notNull(),
  total: real("total").notNull(),
  taxAmount: real("tax_amount").notNull().default(0),
  currency: text("currency").notNull().default("SAR"),
  issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  pdfObjectKey: text("pdf_object_key"),
  status: text("status").notNull().default("issued"),
  version: integer("version").notNull().default(1),
  subtotalMinor: integer("subtotal_minor"),
  discountMinor: integer("discount_minor"),
  taxAmountMinor: integer("tax_amount_minor"),
  totalMinor: integer("total_minor"),
  snapshotJson: text("snapshot_json"),
  voidedAt: text("voided_at"),
}, (table) => [uniqueIndex("invoices_number_unique").on(table.invoiceNumber), uniqueIndex("invoices_order_unique").on(table.orderNumber)]);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  category: text("category").notNull().default("general"),
  isPublic: boolean("is_public").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("platform_settings_category_idx").on(table.category, table.isPublic)]);

export const platformPartners = pgTable("platform_partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("partner"),
  description: text("description").notNull().default(""),
  logoObjectKey: text("logo_object_key"),
  logoUrl: text("logo_url"),
  logoContentType: text("logo_content_type"),
  destinationUrl: text("destination_url"),
  credentialNumber: text("credential_number"),
  verificationUrl: text("verification_url"),
  rightsConfirmed: boolean("rights_confirmed").notNull().default(false),
  rightsReference: text("rights_reference"),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  index("platform_partners_status_order_idx").on(table.status, table.sortOrder),
]);

export const supportReplies = pgTable("support_replies", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  authorEmail: text("author_email").notNull(),
  authorRole: text("author_role").notNull().default("student"),
  body: text("body").notNull().default(""),
  internal: boolean("internal").notNull().default(false),
  replyToId: integer("reply_to_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("support_replies_ticket_idx").on(table.ticketId, table.createdAt), index("support_replies_author_idx").on(table.authorEmail, table.createdAt), index("support_replies_reply_to_idx").on(table.replyToId)]);

export const supportReplyFiles = pgTable("support_reply_files", {
  id: serial("id").primaryKey(),
  replyId: integer("reply_id").notNull(),
  ticketId: integer("ticket_id").notNull(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  scanStatus: text("scan_status").notNull().default("pending"),
  scanProvider: text("scan_provider"),
  scannedAt: text("scanned_at"),
  scanError: text("scan_error"),
  quarantineReason: text("quarantine_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("support_reply_files_object_unique").on(table.objectKey), index("support_reply_files_reply_idx").on(table.replyId), index("support_reply_files_ticket_idx").on(table.ticketId)]);

export const courseWaitlist = pgTable("course_waitlist", {
  id: serial("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  source: text("source").notNull().default("course_page"),
  status: text("status").notNull().default("active"),
  notifiedAt: text("notified_at"),
  convertedAt: text("converted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("course_waitlist_user_course_unique").on(table.userEmail, table.courseSlug), index("course_waitlist_course_status_idx").on(table.courseSlug, table.status)]);

export const learningTracks = pgTable("learning_tracks", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("skills"),
  iconKey: text("icon_key").notNull().default("sparkles"),
  accent: text("accent").notNull().default("blue"),
  status: text("status").notNull().default("draft"),
  ctaLabel: text("cta_label").notNull().default("أبلغني عند الإطلاق"),
  destination: text("destination"),
  position: integer("position").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  showInterestCount: boolean("show_interest_count").notNull().default(false),
  releaseVersion: integer("release_version").notNull().default(0),
  launchAt: text("launch_at"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("learning_tracks_slug_unique").on(table.slug), index("learning_tracks_public_idx").on(table.status, table.position, table.id)]);

export const learningTrackInterests = pgTable("learning_track_interests", {
  id: serial("id").primaryKey(),
  trackId: integer("track_id").notNull().references(() => learningTracks.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  source: text("source").notNull().default("homepage"),
  lastNotifiedVersion: integer("last_notified_version").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [
  uniqueIndex("learning_track_interests_track_user_unique").on(table.trackId, table.userId),
  index("learning_track_interests_track_status_idx").on(table.trackId, table.status, table.id),
  index("learning_track_interests_user_status_idx").on(table.userId, table.status),
  index("learning_track_interests_active_notify_idx").on(table.trackId, table.lastNotifiedVersion, table.id).where(sql`${table.status} = 'active'`),
]);

export const courseBundles = pgTable("course_bundles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  institutionSlug: text("institution_slug"),
  specialtySlug: text("specialty_slug"),
  discountType: text("discount_type").notNull().default("percent"),
  discountValue: real("discount_value").notNull().default(0),
  status: text("status").notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  startsAt: text("starts_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("course_bundles_slug_unique").on(table.slug), index("course_bundles_status_idx").on(table.status, table.startsAt, table.expiresAt)]);

export const courseBundleItems = pgTable("course_bundle_items", {
  id: serial("id").primaryKey(),
  bundleId: integer("bundle_id").notNull(),
  courseSlug: text("course_slug").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("course_bundle_items_unique").on(table.bundleId, table.courseSlug), index("course_bundle_items_bundle_idx").on(table.bundleId, table.position), foreignKey({ name: "course_bundle_items_bundle_fk", columns: [table.bundleId], foreignColumns: [courseBundles.id] }).onDelete("cascade")]);

export const refundRequests = pgTable("refund_requests", {
  id: serial("id").primaryKey(),
  requestNumber: text("request_number").notNull(),
  orderNumber: text("order_number").notNull(),
  requestedByEmail: text("requested_by_email").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("SAR"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  providerRefundId: text("provider_refund_id"),
  approvedAt: text("approved_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("refund_requests_number_unique").on(table.requestNumber), index("refund_requests_order_idx").on(table.orderNumber), index("refund_requests_status_idx").on(table.status, table.createdAt)]);

export const adminApprovals = pgTable("admin_approvals", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  approverEmail: text("approver_email").notNull(),
  decision: text("decision").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("admin_approvals_unique").on(table.entityType, table.entityId, table.action, table.approverEmail), index("admin_approvals_entity_idx").on(table.entityType, table.entityId)]);

export const creditNotes = pgTable("credit_notes", {
  id: serial("id").primaryKey(),
  creditNoteNumber: text("credit_note_number").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  orderNumber: text("order_number").notNull(),
  refundRequestNumber: text("refund_request_number"),
  amountMinor: integer("amount_minor").notNull(),
  taxAmountMinor: integer("tax_amount_minor").notNull().default(0),
  currency: text("currency").notNull().default("SAR"),
  reason: text("reason").notNull(),
  snapshotJson: text("snapshot_json"),
  pdfObjectKey: text("pdf_object_key"),
  issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("credit_notes_number_unique").on(table.creditNoteNumber), index("credit_notes_order_idx").on(table.orderNumber)]);

export const paymentSettlements = pgTable("payment_settlements", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("tap"),
  providerSettlementId: text("provider_settlement_id").notNull(),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  currency: text("currency").notNull().default("SAR"),
  grossMinor: integer("gross_minor").notNull().default(0),
  refundMinor: integer("refund_minor").notNull().default(0),
  feeMinor: integer("fee_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  netMinor: integer("net_minor").notNull().default(0),
  status: text("status").notNull().default("imported"),
  importedBy: text("imported_by"),
  reconciledAt: text("reconciled_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("payment_settlements_provider_unique").on(table.provider, table.providerSettlementId), index("payment_settlements_status_idx").on(table.status, table.createdAt)]);

export const paymentSettlementLines = pgTable("payment_settlement_lines", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull(),
  orderNumber: text("order_number"),
  providerTransactionId: text("provider_transaction_id").notNull(),
  grossMinor: integer("gross_minor").notNull().default(0),
  feeMinor: integer("fee_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  netMinor: integer("net_minor").notNull().default(0),
  status: text("status").notNull().default("unmatched"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("payment_settlement_lines_provider_unique").on(table.settlementId, table.providerTransactionId), index("payment_settlement_lines_order_idx").on(table.orderNumber), foreignKey({ name: "payment_settlement_lines_settlement_fk", columns: [table.settlementId], foreignColumns: [paymentSettlements.id] }).onDelete("cascade")]);

export const adminMfaFactors = pgTable("admin_mfa_factors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull().default("totp"),
  label: text("label").notNull().default("Authenticator"),
  secretEncrypted: text("secret_encrypted"),
  credentialId: text("credential_id"),
  publicKeyJson: text("public_key_json"),
  counter: integer("counter").notNull().default(0),
  verifiedAt: text("verified_at"),
  disabledAt: text("disabled_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("admin_mfa_factors_credential_unique").on(table.credentialId), index("admin_mfa_factors_user_idx").on(table.userId, table.disabledAt)]);

export const aiApiKeys = pgTable("ai_api_keys", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  projectLabel: text("project_label"),
  encryptedKey: text("encrypted_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  priority: integer("priority").notNull().default(100),
  status: text("status").notNull().default("active"),
  cooldownUntil: text("cooldown_until"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastUsedAt: text("last_used_at"),
  lastSuccessAt: text("last_success_at"),
  lastErrorCode: text("last_error_code"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("ai_api_keys_fingerprint_unique").on(table.fingerprint), index("ai_api_keys_rotation_idx").on(table.status, table.priority, table.cooldownUntil, table.lastUsedAt)]);

export const aiServiceSettings = pgTable("ai_service_settings", {
  service: text("service").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  model: text("model").notNull().default("gemini-2.5-flash"),
  freeMonthlyLimit: integer("free_monthly_limit").notNull().default(0),
  subscriberMonthlyLimit: integer("subscriber_monthly_limit").notNull().default(0),
  maxOutputTokens: integer("max_output_tokens").notNull().default(4096),
  maxFileBytes: integer("max_file_bytes").notNull().default(20971520),
  temperature: real("temperature").notNull().default(0.2),
  instructions: text("instructions").notNull().default(""),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("ai_service_settings_enabled_idx").on(table.enabled)]);

export const aiEntitlements = pgTable("ai_entitlements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  externalRef: text("external_ref"),
  status: text("status").notNull().default("active"),
  startsAt: text("starts_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  expiresAt: text("expires_at"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("ai_entitlements_source_unique").on(table.userId, table.source, table.externalRef), index("ai_entitlements_user_status_idx").on(table.userId, table.status, table.expiresAt)]);

export const aiSubscriptionOrders = pgTable("ai_subscription_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  amount: real("amount").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("SAR"),
  status: text("status").notNull().default("pending"),
  checkoutKey: text("checkout_key").notNull(),
  checkoutUrl: text("checkout_url"),
  tapChargeId: text("tap_charge_id"),
  paidAt: text("paid_at"),
  entitlementExpiresAt: text("entitlement_expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("ai_subscription_orders_number_unique").on(table.orderNumber), uniqueIndex("ai_subscription_orders_checkout_unique").on(table.checkoutKey), uniqueIndex("ai_subscription_orders_tap_unique").on(table.tapChargeId), index("ai_subscription_orders_user_idx").on(table.userId, table.createdAt), index("ai_subscription_orders_status_idx").on(table.status, table.updatedAt)]);

export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("محادثة جديدة"),
  kind: text("kind").notNull().default("chat"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("ai_conversations_user_idx").on(table.userId, table.status, table.updatedAt)]);

export const aiFiles = pgTable("ai_files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").references(() => aiConversations.id, { onDelete: "set null" }),
  objectKey: text("object_key").notNull(),
  storageProvider: text("storage_provider").notNull().default("local"),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").notNull().default("ready"),
  scanStatus: text("scan_status").notNull().default("pending"),
  scanProvider: text("scan_provider"),
  scannedAt: text("scanned_at"),
  scanError: text("scan_error"),
  quarantineReason: text("quarantine_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("ai_files_object_unique").on(table.objectKey), index("ai_files_user_idx").on(table.userId, table.createdAt), index("ai_files_conversation_idx").on(table.conversationId, table.createdAt)]);

export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  service: text("service").notNull().default("chat"),
  content: text("content").notNull(),
  fileId: integer("file_id").references(() => aiFiles.id, { onDelete: "set null" }),
  model: text("model"),
  usageJson: text("usage_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("ai_messages_conversation_idx").on(table.conversationId, table.createdAt), index("ai_messages_user_idx").on(table.userId, table.createdAt)]);

export const aiUsageEvents = pgTable("ai_usage_events", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  service: text("service").notNull(),
  keyId: integer("key_id").references(() => aiApiKeys.id, { onDelete: "set null" }),
  conversationId: integer("conversation_id").references(() => aiConversations.id, { onDelete: "set null" }),
  fileId: integer("file_id").references(() => aiFiles.id, { onDelete: "set null" }),
  model: text("model"),
  status: text("status").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("ai_usage_events_request_unique").on(table.requestId), index("ai_usage_events_user_month_idx").on(table.userId, table.service, table.createdAt), index("ai_usage_events_key_idx").on(table.keyId, table.createdAt)]);

export const aiArtifacts = pgTable("ai_artifacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").references(() => aiConversations.id, { onDelete: "set null" }),
  fileId: integer("file_id").notNull().references(() => aiFiles.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  metadataJson: text("metadata_json"),
  model: text("model"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("ai_artifacts_user_idx").on(table.userId, table.createdAt), index("ai_artifacts_file_idx").on(table.fileId, table.kind, table.createdAt)]);

export const aiQuizzes = pgTable("ai_quizzes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").references(() => aiConversations.id, { onDelete: "set null" }),
  fileId: integer("file_id").notNull().references(() => aiFiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  language: text("language").notNull().default("ar"),
  questionsJson: text("questions_json").notNull(),
  model: text("model"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("ai_quizzes_user_idx").on(table.userId, table.createdAt), index("ai_quizzes_file_idx").on(table.fileId, table.createdAt)]);

export const aiQuizAttempts = pgTable("ai_quiz_attempts", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => aiQuizzes.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  answersJson: text("answers_json").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("ai_quiz_attempts_quiz_idx").on(table.quizId, table.userId, table.createdAt)]);
