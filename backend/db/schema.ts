import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  phone: text("phone"),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("student"),
  emailVerifiedAt: text("email_verified_at"),
  phoneVerifiedAt: text("phone_verified_at"),
  universitySlug: text("university_slug"),
  specialty: text("specialty"),
  profileCompletedAt: text("profile_completed_at"),
  onboardingCompletedAt: text("onboarding_completed_at"),
  lastLoginAt: text("last_login_at"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("users_email_unique").on(table.email), uniqueIndex("users_phone_unique").on(table.phone)]);

export const courseRequests = sqliteTable("course_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  university: text("university").notNull(),
  universitySlug: text("university_slug"),
  specialty: text("specialty").notNull(),
  courseName: text("course_name").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  notes: text("notes").notNull().default(""),
  notify: integer("notify", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("new"),
  assignedSupervisorId: integer("assigned_supervisor_id"),
  attachmentsCount: integer("attachments_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("course_requests_course_idx").on(table.courseName), index("course_requests_status_idx").on(table.status), index("course_requests_user_idx").on(table.userId), index("course_requests_supervisor_idx").on(table.assignedSupervisorId, table.status)]);

export const courseRequestFiles = sqliteTable("course_request_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id").notNull(),
  userId: integer("user_id").notNull(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("course_request_files_object_unique").on(table.objectKey), index("course_request_files_request_idx").on(table.requestId)]);

export const supportTickets = sqliteTable("support_tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketNumber: text("ticket_number").notNull(),
  userEmail: text("user_email"),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("normal"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  assignedTo: text("assigned_to"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("support_ticket_number_unique").on(table.ticketNumber), index("support_status_idx").on(table.status)]);

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  tapChargeId: text("tap_charge_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  paidAt: text("paid_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("orders_number_unique").on(table.orderNumber), index("orders_customer_idx").on(table.customerEmail), index("orders_status_idx").on(table.status), uniqueIndex("orders_tap_charge_unique").on(table.tapChargeId)]);

export const paymentEvents = sqliteTable("payment_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().default("tap"),
  providerEventId: text("provider_event_id"),
  orderNumber: text("order_number"),
  chargeId: text("charge_id"),
  status: text("status").notNull(),
  payload: text("payload").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("payment_events_provider_event_unique").on(table.providerEventId), index("payment_events_charge_idx").on(table.chargeId), index("payment_events_order_idx").on(table.orderNumber)]);

export const courseAccess = sqliteTable("course_access", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  source: text("source").notNull().default("purchase"),
  orderNumber: text("order_number"),
  startsAt: text("starts_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at"),
  revokedAt: text("revoked_at"),
}, (table) => [uniqueIndex("course_access_user_course_unique").on(table.userEmail, table.courseSlug), index("course_access_course_idx").on(table.courseSlug)]);

export const lessonProgress = sqliteTable("lesson_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  lessonId: text("lesson_id").notNull(),
  watchedSeconds: integer("watched_seconds").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("lesson_progress_unique").on(table.userEmail, table.lessonId), index("lesson_progress_course_idx").on(table.courseSlug)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_actor_idx").on(table.actorEmail), index("audit_entity_idx").on(table.entityType, table.entityId)]);

export const videoAssets = sqliteTable("video_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseSlug: text("course_slug").notNull(),
  lessonId: text("lesson_id").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").notNull().default("uploading"),
  durationSeconds: integer("duration_seconds"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("video_object_key_unique").on(table.objectKey), index("video_lesson_idx").on(table.courseSlug, table.lessonId)]);

export const analyticsEvents = sqliteTable("analytics_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  event: text("event").notNull(),
  anonymousId: text("anonymous_id"),
  userEmail: text("user_email"),
  courseSlug: text("course_slug"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("analytics_event_idx").on(table.event), index("analytics_course_idx").on(table.courseSlug)]);

export const catalogInstitutions = sqliteTable("catalog_institutions", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull().default(""),
  region: text("region").notNull(),
  type: text("type").notNull(),
  logoUrl: text("logo_url"),
  domain: text("domain"),
  status: text("status").notNull().default("published"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("catalog_institutions_region_idx").on(table.region), index("catalog_institutions_status_idx").on(table.status)]);

export const catalogSpecialties = sqliteTable("catalog_specialties", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("published"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("catalog_specialties_name_unique").on(table.name)]);

export const institutionSpecialties = sqliteTable("institution_specialties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  institutionSlug: text("institution_slug").notNull(),
  specialtySlug: text("specialty_slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("published"),
}, (table) => [uniqueIndex("institution_specialties_unique").on(table.institutionSlug, table.specialtySlug), index("institution_specialties_lookup_idx").on(table.institutionSlug, table.status)]);

export const catalogCourses = sqliteTable("catalog_courses", {
  slug: text("slug").primaryKey(),
  institutionSlug: text("institution_slug").notNull(),
  specialtySlug: text("specialty_slug").notNull(),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull().default(""),
  code: text("code"),
  description: text("description").notNull().default(""),
  price: real("price").notNull().default(0),
  oldPrice: real("old_price"),
  accessLabel: text("access_label").notNull().default("90 يومًا"),
  status: text("status").notNull().default("draft"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  coverTheme: text("cover_theme").notNull().default("blue-violet"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("catalog_courses_institution_idx").on(table.institutionSlug), index("catalog_courses_specialty_idx").on(table.specialtySlug), index("catalog_courses_status_idx").on(table.status)]);

export const courseUnitsDb = sqliteTable("course_units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseSlug: text("course_slug").notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("course_units_course_idx").on(table.courseSlug, table.position)]);

export const lessonsDb = sqliteTable("lessons", {
  id: text("id").primaryKey(),
  courseSlug: text("course_slug").notNull(),
  unitId: integer("unit_id").notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  freePreview: integer("free_preview", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("draft"),
  videoAssetId: integer("video_asset_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("lessons_unit_idx").on(table.unitId, table.position), index("lessons_course_idx").on(table.courseSlug)]);

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("roles_key_unique").on(table.key)]);

export const userRoles = sqliteTable("user_roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  roleId: integer("role_id").notNull(),
  grantedBy: text("granted_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("user_roles_unique").on(table.userId, table.roleId), index("user_roles_role_idx").on(table.roleId)]);

export const rolePermissions = sqliteTable("role_permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roleId: integer("role_id").notNull(),
  permission: text("permission").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("role_permissions_unique").on(table.roleId, table.permission)]);

export const authSessions = sqliteTable("auth_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("auth_sessions_token_unique").on(table.tokenHash), index("auth_sessions_user_idx").on(table.userId)]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowExpiresAt: text("window_expires_at").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("password_reset_token_unique").on(table.tokenHash), index("password_reset_user_idx").on(table.userId, table.expiresAt)]);

export const supervisorAssignments = sqliteTable("supervisor_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supervisorId: integer("supervisor_id").notNull(),
  institutionSlug: text("institution_slug"),
  specialty: text("specialty"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("supervisor_assignments_unique").on(table.supervisorId, table.institutionSlug, table.specialty), index("supervisor_assignments_user_idx").on(table.supervisorId, table.active), index("supervisor_assignments_scope_idx").on(table.institutionSlug, table.specialty)]);

export const otpChallenges = sqliteTable("otp_challenges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  destinationHash: text("destination_hash").notNull(),
  channel: text("channel").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("otp_destination_idx").on(table.destinationHash, table.expiresAt)]);

export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("favorites_user_course_unique").on(table.userEmail, table.courseSlug)]);

export const lessonNotes = sqliteTable("lesson_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  lessonId: text("lesson_id").notNull(),
  body: text("body").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("lesson_notes_user_lesson_unique").on(table.userEmail, table.lessonId)]);

export const courseReviews = sqliteTable("course_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  courseSlug: text("course_slug").notNull(),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("course_reviews_user_course_unique").on(table.userEmail, table.courseSlug), index("course_reviews_status_idx").on(table.status)]);

export const notificationsDb = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email"),
  audience: text("audience").notNull().default("user"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  actionUrl: text("action_url"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("notifications_user_idx").on(table.userEmail, table.readAt), index("notifications_audience_idx").on(table.audience)]);

export const pushDevices = sqliteTable("push_devices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  platform: text("platform").notNull(),
  deviceLabel: text("device_label"),
  status: text("status").notNull().default("active"),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("push_devices_token_unique").on(table.token), index("push_devices_user_idx").on(table.userId, table.status)]);

export const couponsDb = sqliteTable("coupons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  type: text("type").notNull().default("percent"),
  value: real("value").notNull(),
  courseSlug: text("course_slug"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  startsAt: text("starts_at"),
  expiresAt: text("expires_at"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("coupons_code_unique").on(table.code), index("coupons_status_idx").on(table.status)]);

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull(),
  orderNumber: text("order_number").notNull(),
  customerEmail: text("customer_email").notNull(),
  total: real("total").notNull(),
  taxAmount: real("tax_amount").notNull().default(0),
  currency: text("currency").notNull().default("SAR"),
  issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  pdfObjectKey: text("pdf_object_key"),
}, (table) => [uniqueIndex("invoices_number_unique").on(table.invoiceNumber), uniqueIndex("invoices_order_unique").on(table.orderNumber)]);

export const platformSettings = sqliteTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  category: text("category").notNull().default("general"),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("platform_settings_category_idx").on(table.category, table.isPublic)]);

export const supportReplies = sqliteTable("support_replies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull(),
  authorEmail: text("author_email").notNull(),
  body: text("body").notNull(),
  internal: integer("internal", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("support_replies_ticket_idx").on(table.ticketId, table.createdAt)]);
