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
  tapChargeId: text("tap_charge_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  paidAt: text("paid_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("orders_number_unique").on(table.orderNumber), index("orders_customer_idx").on(table.customerEmail), index("orders_status_idx").on(table.status), uniqueIndex("orders_tap_charge_unique").on(table.tapChargeId)]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  courseSlug: text("course_slug").notNull(),
  unitPrice: real("unit_price").notNull(),
  discount: real("discount").notNull().default(0),
  total: real("total").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("order_items_order_course_unique").on(table.orderNumber, table.courseSlug), index("order_items_order_idx").on(table.orderNumber), index("order_items_course_idx").on(table.courseSlug)]);

export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("tap"),
  providerEventId: text("provider_event_id"),
  orderNumber: text("order_number"),
  chargeId: text("charge_id"),
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
  revokedAt: text("revoked_at"),
}, (table) => [uniqueIndex("course_access_user_course_unique").on(table.userEmail, table.courseSlug), index("course_access_course_idx").on(table.courseSlug)]);

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
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").notNull().default("uploading"),
  durationSeconds: integer("duration_seconds"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("video_object_key_unique").on(table.objectKey), index("video_lesson_idx").on(table.courseSlug, table.lessonId)]);

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
  title: text("title").notNull(),
  titleEn: text("title_en").notNull().default(""),
  code: text("code"),
  description: text("description").notNull().default(""),
  coverImageUrl: text("cover_image_url"),
  price: real("price").notNull().default(0),
  oldPrice: real("old_price"),
  accessLabel: text("access_label").notNull().default("90 يومًا"),
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
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("auth_sessions_token_unique").on(table.tokenHash), index("auth_sessions_user_idx").on(table.userId)]);

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
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("lesson_notes_user_lesson_unique").on(table.userEmail, table.lessonId)]);

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
  pushEnabled: boolean("push_enabled").notNull().default(true),
  startsAt: text("starts_at"),
  expiresAt: text("expires_at"),
  dismissible: boolean("dismissible").notNull().default(true),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("notifications_user_idx").on(table.userEmail, table.readAt), index("notifications_audience_idx").on(table.audience)]);

export const pushDevices = pgTable("push_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  platform: text("platform").notNull(),
  deviceLabel: text("device_label"),
  status: text("status").notNull().default("active"),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("push_devices_token_unique").on(table.token), index("push_devices_user_idx").on(table.userId, table.status)]);

export const couponsDb = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  type: text("type").notNull().default("percent"),
  value: real("value").notNull(),
  courseSlug: text("course_slug"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  startsAt: text("starts_at"),
  expiresAt: text("expires_at"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("coupons_code_unique").on(table.code), index("coupons_status_idx").on(table.status)]);

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
}, (table) => [uniqueIndex("invoices_number_unique").on(table.invoiceNumber), uniqueIndex("invoices_order_unique").on(table.orderNumber)]);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  category: text("category").notNull().default("general"),
  isPublic: boolean("is_public").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("platform_settings_category_idx").on(table.category, table.isPublic)]);

export const supportReplies = pgTable("support_replies", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  authorEmail: text("author_email").notNull(),
  authorRole: text("author_role").notNull().default("student"),
  body: text("body").notNull().default(""),
  internal: boolean("internal").notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [index("support_replies_ticket_idx").on(table.ticketId, table.createdAt), index("support_replies_author_idx").on(table.authorEmail, table.createdAt)]);

export const supportReplyFiles = pgTable("support_reply_files", {
  id: serial("id").primaryKey(),
  replyId: integer("reply_id").notNull(),
  ticketId: integer("ticket_id").notNull(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP::text`),
}, (table) => [uniqueIndex("support_reply_files_object_unique").on(table.objectKey), index("support_reply_files_reply_idx").on(table.replyId), index("support_reply_files_ticket_idx").on(table.ticketId)]);
