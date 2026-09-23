import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, catalogCourses, courseResources, courseUnitsDb, lessonsDb, notificationsDb, users, videoAssets } from "@/db/schema";
import { instructorAssignments, instructorContracts, instructorLessons, instructorProfiles, instructorUnits } from "@/db/instructor-schema";
import { cleanText } from "@/lib/api";
import { InstructorError } from "@/lib/instructor-security";
import { isInstructorAssignmentEditable } from "@/lib/instructor-policy";
import { instructorRevision, type InstructorTransaction } from "@/lib/instructor-onboarding";
import { collectVideoCleanup } from "@/lib/admin-deletion";
import { enqueueStorageCleanupTx } from "@/lib/storage-cleanup";
import type { CleanupTarget } from "@/lib/storage-cleanup-policy";

type Database = ReturnType<typeof getDb> | InstructorTransaction;
export type InstructorAssignment = typeof instructorAssignments.$inferSelect;
export function instructorAssignmentId(value: unknown) {
 const number = typeof value === "number" ? value : typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : NaN;
 if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw new InstructorError("معرّف المهمة غير صالح", 400);
 return number;
}
export function instructorVideoNamespace(assignmentId: number, lessonId: number) { return { courseSlug: "instructor-" + assignmentId, lessonId: "draft-" + lessonId }; }
export async function authorizedInstructorAssignment(db: Database, id: number, ownerId: number | null, options: { lock?: boolean; expectedRevision?: unknown; mutable?: boolean; requireActive?: boolean } = {}) {
 const where = ownerId === null ? eq(instructorAssignments.id, id) : and(eq(instructorAssignments.id, id), eq(instructorAssignments.userId, ownerId));
 let [assignment] = await db.select().from(instructorAssignments).where(where).limit(1);
 if (!assignment) throw new InstructorError("المهمة غير موجودة", 404);
 if (options.lock) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor:" + assignment.userId}))`);
  [assignment] = await db.select().from(instructorAssignments).where(where).limit(1).for("update");
  if (!assignment) throw new InstructorError("المهمة غير موجودة", 404);
 }
 if (options.expectedRevision !== undefined && instructorRevision(options.expectedRevision) !== assignment.revision) throw new InstructorError("تغيّرت المهمة. حدّثها قبل حفظ التعديل", 409, "INSTRUCTOR_CONFLICT");
 if (options.mutable && !isInstructorAssignmentEditable(assignment.status)) throw new InstructorError("المهمة لا تقبل التعديل في حالتها الحالية", 409, "INSTRUCTOR_ASSIGNMENT_LOCKED");
 if (options.requireActive !== false) {
  const [profile] = await db.select({ status: instructorProfiles.status }).from(instructorProfiles).where(eq(instructorProfiles.userId, assignment.userId)).limit(1);
  const accountQuery = db.select({ role: users.role, status: users.status, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, assignment.userId)).limit(1);
  const [account] = await (options.lock ? accountQuery.for("share") : accountQuery);
  const [contract] = await db.select({ userId: instructorContracts.userId, status: instructorContracts.status }).from(instructorContracts).where(eq(instructorContracts.id, assignment.contractId)).limit(1);
  if (!account || account.role !== "instructor" || account.status !== "active" || !account.emailVerifiedAt || profile?.status !== "approved" || contract?.status !== "signed" || contract.userId !== assignment.userId || assignment.status === "cancelled") throw new InstructorError("المهمة تتطلب حسابًا معتمدًا وعقد عمل ساريًا", 403, "INSTRUCTOR_CONTRACT_REQUIRED");
 }
 return assignment;
}
/** Called under the assignment lock; importing once preserves instructor edits and deletions. */
export async function importAssignedCourseStructure(tx: InstructorTransaction, assignment: InstructorAssignment) {
 if (assignment.structureImportedAt || !isInstructorAssignmentEditable(assignment.status)) return assignment;
 const units = await tx.select().from(courseUnitsDb).where(eq(courseUnitsDb.courseSlug, assignment.courseSlug)).orderBy(asc(courseUnitsDb.position), asc(courseUnitsDb.id));
 const sourceLessons = await tx.select().from(lessonsDb).where(eq(lessonsDb.courseSlug, assignment.courseSlug)).orderBy(asc(lessonsDb.position), asc(lessonsDb.id));
 const now = new Date().toISOString();
 for (const unit of units) {
  const [draftUnit] = await tx.insert(instructorUnits).values({ assignmentId: assignment.id, sourceUnitId: unit.id, title: unit.title, description: unit.description, position: unit.position }).returning();
  const lessons = sourceLessons.filter(lesson => lesson.unitId === unit.id);
  if (lessons.length) await tx.insert(instructorLessons).values(lessons.map(lesson => ({ unitId: draftUnit.id, sourceLessonId: lesson.id, title: lesson.title, description: lesson.description, position: lesson.position, createdAt: now, updatedAt: now })));
 }
 await tx.update(instructorAssignments).set({ structureImportedAt: now }).where(eq(instructorAssignments.id, assignment.id));
 return { ...assignment, structureImportedAt: now };
}
export async function instructorAssignmentDetail(db: Database, assignment: InstructorAssignment) {
 const [course] = await db.select({ title: catalogCourses.title }).from(catalogCourses).where(eq(catalogCourses.slug, assignment.courseSlug)).limit(1);
 const units = await db.select().from(instructorUnits).where(eq(instructorUnits.assignmentId, assignment.id)).orderBy(asc(instructorUnits.position), asc(instructorUnits.id));
 const lessons = units.length ? await db.select().from(instructorLessons).where(inArray(instructorLessons.unitId, units.map(unit => unit.id))).orderBy(asc(instructorLessons.position), asc(instructorLessons.id)) : [];
 const sourceIds = lessons.map(lesson => lesson.sourceLessonId).filter((id): id is string => Boolean(id));
 const sources = sourceIds.length ? await db.select().from(lessonsDb).where(and(eq(lessonsDb.courseSlug, assignment.courseSlug), inArray(lessonsDb.id, sourceIds))) : [];
 const assetIds = lessons.map(lesson => lesson.videoAssetId).filter((id): id is number => id !== null);
 const assets = assetIds.length ? await db.select({ id: videoAssets.id, status: videoAssets.status, processingStatus: videoAssets.processingStatus, processingProgress: videoAssets.processingProgress, durationSeconds: videoAssets.durationSeconds }).from(videoAssets).where(inArray(videoAssets.id, assetIds)) : [];
 const resources = await db.select({ id: courseResources.id, title: courseResources.title, originalName: courseResources.originalName, contentType: courseResources.contentType, sizeBytes: courseResources.sizeBytes }).from(courseResources).where(and(eq(courseResources.courseSlug, assignment.courseSlug), eq(courseResources.status, "active"), eq(courseResources.scanStatus, "clean"))).orderBy(asc(courseResources.sortOrder), asc(courseResources.id));
 return { assignment: { ...assignment, courseTitle: course?.title || assignment.courseSlug }, units: units.map(unit => ({ ...unit, lessons: lessons.filter(lesson => lesson.unitId === unit.id).map(lesson => ({ id: lesson.id, sourceLessonId: lesson.sourceLessonId, existingVideo: assignment.status === "published" || sources.some(source => source.id === lesson.sourceLessonId && source.videoAssetId !== null), title: lesson.title, description: lesson.description, position: lesson.position, video: assignment.status === "published" ? null : assets.find(asset => asset.id === lesson.videoAssetId) || null })) })), resources: resources.map(resource => ({ ...resource, url: "/api/instructor/assignments/" + assignment.id + "/resources/" + resource.id })) };
}
export async function instructorAssignmentSummaries(db: Database, userId: number) {
 const assignments = await db.select().from(instructorAssignments).where(eq(instructorAssignments.userId, userId)).orderBy(asc(instructorAssignments.id)).limit(100);
 const slugs = [...new Set(assignments.map(row => row.courseSlug))];
 const courses = slugs.length ? await db.select({ slug: catalogCourses.slug, title: catalogCourses.title }).from(catalogCourses).where(inArray(catalogCourses.slug, slugs)) : [];
 return assignments.map(assignment => ({ ...assignment, courseTitle: courses.find(course => course.slug === assignment.courseSlug)?.title || assignment.courseSlug }));
}
function contentFields(body: Record<string, unknown>) {
 const title = cleanText(body.title, 200), description = cleanText(body.description, 4000), position = body.position === undefined ? 0 : body.position;
 if (title.length < 2 || typeof position !== "number" || !Number.isSafeInteger(position) || position < 0 || position > 10000) throw new InstructorError("أدخل عنوانًا صحيحًا وترتيبًا صالحًا");
 return { title, description, position };
}
export async function assertDraftAsset(tx: Database, assignment: InstructorAssignment, lessonId: number, assetId: number) {
 const namespace = instructorVideoNamespace(assignment.id, lessonId);
 const [asset] = await tx.select().from(videoAssets).where(and(eq(videoAssets.id, assetId), eq(videoAssets.courseSlug, namespace.courseSlug), eq(videoAssets.lessonId, namespace.lessonId))).limit(1);
 if (!asset) throw new InstructorError("الفيديو لا يتبع مسودة الدرس", 409);
 const [published] = await tx.select({ id: lessonsDb.id }).from(lessonsDb).where(eq(lessonsDb.videoAssetId, assetId)).limit(1);
 if (published) throw new InstructorError("الفيديو مرتبط بمحتوى منشور ولا يمكن استبداله", 409);
 return asset;
}
async function deleteDraftAssets(tx: InstructorTransaction, assignment: InstructorAssignment, lessons: Array<typeof instructorLessons.$inferSelect>) {
 const cleanup: CleanupTarget[] = [];
 for (const lesson of lessons) if (lesson.videoAssetId) collectVideoCleanup(await assertDraftAsset(tx, assignment, lesson.id, lesson.videoAssetId), cleanup);
 await enqueueStorageCleanupTx(tx, cleanup);
 for (const lesson of lessons) {
  await tx.delete(instructorLessons).where(eq(instructorLessons.id, lesson.id));
  if (lesson.videoAssetId) await tx.delete(videoAssets).where(eq(videoAssets.id, lesson.videoAssetId));
 }
}
export async function assignmentReadyContent(tx: Database, assignment: InstructorAssignment) {
 const units = await tx.select().from(instructorUnits).where(eq(instructorUnits.assignmentId, assignment.id)).orderBy(asc(instructorUnits.position), asc(instructorUnits.id));
 if (!units.length) throw new InstructorError("أضف وحدة ودروسها أولًا", 409);
 const rows: Array<{ unit: typeof instructorUnits.$inferSelect; lessons: Array<{ lesson: typeof instructorLessons.$inferSelect; asset: typeof videoAssets.$inferSelect | null }> }> = [];
 for (const unit of units) {
  const lessons = await tx.select().from(instructorLessons).where(eq(instructorLessons.unitId, unit.id)).orderBy(asc(instructorLessons.position), asc(instructorLessons.id));
  if (!lessons.length) throw new InstructorError("كل وحدة يجب أن تحتوي درسًا واحدًا على الأقل", 409);
  const ready = [];
  for (const lesson of lessons) {
   if (lesson.sourceLessonId) {
    const [source] = await tx.select().from(lessonsDb).where(and(eq(lessonsDb.id, lesson.sourceLessonId), eq(lessonsDb.courseSlug, assignment.courseSlug), eq(lessonsDb.unitId, unit.sourceUnitId!))).limit(1);
    if (!source) throw new InstructorError("تغير هيكل المادة الأصلية. اطلب من الإدارة مراجعة الربط قبل النشر", 409, "INSTRUCTOR_SOURCE_CHANGED");
    if (source.videoAssetId) {
     if (lesson.videoAssetId) throw new InstructorError("أضافت الإدارة فيديو لهذا الدرس؛ لا يمكن استبداله من التكليف", 409, "INSTRUCTOR_SOURCE_CHANGED");
     ready.push({ lesson, asset: null }); continue;
    }
   }
   if (!lesson.videoAssetId) throw new InstructorError("أكمل فيديو كل درس قبل الإرسال", 409);
   const asset = await assertDraftAsset(tx, assignment, lesson.id, lesson.videoAssetId);
   if (asset.status !== "ready" || asset.processingStatus !== "ready" || !asset.hlsMasterObjectKey || !asset.durationSeconds || asset.durationSeconds < 1) throw new InstructorError("انتظر اكتمال معالجة جميع الفيديوهات قبل الإرسال أو النشر", 409, "INSTRUCTOR_VIDEOS_NOT_READY");
   ready.push({ lesson, asset });
  }
  rows.push({ unit, lessons: ready });
 }
 return rows;
}
export async function editInstructorAssignment(tx: InstructorTransaction, userId: number, id: number, body: Record<string, unknown>) {
 const assignment = await authorizedInstructorAssignment(tx, id, userId, { lock: true, expectedRevision: instructorRevision(body.expectedRevision), mutable: true });
 if (body.videoAssetId !== undefined || body.objectKey !== undefined || body.status !== undefined || body.publish !== undefined) throw new InstructorError("لا يمكن ضبط صلاحيات النشر أو الفيديو من بيانات الدرس", 400);
 const units = await tx.select().from(instructorUnits).where(eq(instructorUnits.assignmentId, id));
 const now = new Date().toISOString(); let resultId: number | undefined;
 if (body.action === "saveUnit") {
  const fields = contentFields(body);
  if (body.id !== undefined) { const unitId = instructorAssignmentId(body.id); if (!units.some(unit => unit.id === unitId)) throw new InstructorError("الوحدة غير موجودة", 404); await tx.update(instructorUnits).set(fields).where(eq(instructorUnits.id, unitId)); resultId = unitId; }
  else { if (units.length >= 100) throw new InstructorError("الحد الأقصى 100 وحدة", 409); const [unit] = await tx.insert(instructorUnits).values({ assignmentId: id, ...fields }).returning({ id: instructorUnits.id }); resultId = unit.id; }
 } else if (body.action === "saveLesson") {
  const unitId = instructorAssignmentId(body.unitId); if (!units.some(unit => unit.id === unitId)) throw new InstructorError("الوحدة غير موجودة في المهمة", 404);
  const fields = contentFields(body);
  if (body.id !== undefined) { const lessonId = instructorAssignmentId(body.id); const [lesson] = await tx.select().from(instructorLessons).where(and(eq(instructorLessons.id, lessonId), eq(instructorLessons.unitId, unitId))).limit(1); if (!lesson) throw new InstructorError("الدرس غير موجود", 404); await tx.update(instructorLessons).set({ ...fields, updatedAt: now }).where(eq(instructorLessons.id, lessonId)); resultId = lessonId; }
  else { const lessons = await tx.select({ id: instructorLessons.id }).from(instructorLessons).where(inArray(instructorLessons.unitId, units.map(unit => unit.id))); if (lessons.length >= 500) throw new InstructorError("الحد الأقصى 500 درس للمهمة", 409); const [lesson] = await tx.insert(instructorLessons).values({ unitId, ...fields, createdAt: now, updatedAt: now }).returning({ id: instructorLessons.id }); resultId = lesson.id; }
 } else if (body.action === "deleteUnit") {
  const unitId = instructorAssignmentId(body.id); if (!units.some(unit => unit.id === unitId)) throw new InstructorError("الوحدة غير موجودة", 404);
  if (units.find(unit => unit.id === unitId)?.sourceUnitId) throw new InstructorError("الوحدة من خطة المادة المعتمدة؛ يمكن تعديلها وإضافة دروس إليها، وحذفها من الإدارة فقط", 403);
  const lessons = await tx.select().from(instructorLessons).where(eq(instructorLessons.unitId, unitId)); await deleteDraftAssets(tx, assignment, lessons); await tx.delete(instructorUnits).where(eq(instructorUnits.id, unitId));
 } else if (body.action === "deleteLesson") {
  const lessonId = instructorAssignmentId(body.id); const [lesson] = units.length ? await tx.select().from(instructorLessons).where(and(eq(instructorLessons.id, lessonId), inArray(instructorLessons.unitId, units.map(unit => unit.id)))).limit(1) : [];
  if (!lesson) throw new InstructorError("الدرس غير موجود", 404); if (lesson.sourceLessonId) throw new InstructorError("الدرس من خطة المادة المعتمدة؛ يمكن تعديله وإضافة الفيديو، وحذفه من الإدارة فقط", 403); await deleteDraftAssets(tx, assignment, [lesson]);
 } else if (body.action === "submit") {
  await assignmentReadyContent(tx, assignment);
  const [owner] = await tx.select({ id: users.id }).from(users).where(and(eq(users.isPlatformOwner, true), eq(users.status, "active"), eq(users.role, "admin"))).limit(1);
  if (owner) await tx.insert(notificationsDb).values({ targetUserId: owner.id, userEmail: null, audience: "admin", title: "شرح جديد جاهز للمراجعة", body: "أرسل أحد الشارحين مهمة مكتملة لمراجعتك", actionUrl: "/admin/instructors", dedupeKey: "instructor-assignment:" + id + ":submit:" + assignment.revision, createdAt: now });
 } else throw new InstructorError("الإجراء غير صالح");
 const revision = assignment.revision + 1, status = body.action === "submit" ? "submitted" : "in_progress";
 await tx.update(instructorAssignments).set({ revision, status, ...(body.action === "submit" ? { submittedAt: now } : {}), updatedAt: now }).where(eq(instructorAssignments.id, id));
 await tx.insert(auditLogs).values({ actorEmail: "user-id:" + userId, action: "instructor_assignment_" + String(body.action), entityType: "instructor_assignment", entityId: String(id), afterJson: JSON.stringify({ revision, status, targetId: resultId }), createdAt: now });
 return { revision, status, ...(resultId ? { id: resultId } : {}) };
}
export async function publishInstructorAssignment(tx: InstructorTransaction, assignment: InstructorAssignment) {
 if (assignment.status === "published") return { reused: true, revision: assignment.revision };
 if (assignment.status !== "submitted") throw new InstructorError("يلزم إرسال المهمة للمراجعة قبل النشر", 409);
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor-publish-course:" + assignment.courseSlug}))`);
 const [course] = await tx.select({ slug: catalogCourses.slug }).from(catalogCourses).where(eq(catalogCourses.slug, assignment.courseSlug)).limit(1).for("update");
 if (!course) throw new InstructorError("المادة غير موجودة", 404);
 const content = await assignmentReadyContent(tx, assignment);
 const existingUnits = await tx.select({ position: courseUnitsDb.position }).from(courseUnitsDb).where(eq(courseUnitsDb.courseSlug, assignment.courseSlug));
 let position = existingUnits.reduce((maximum, unit) => Math.max(maximum, unit.position), -1) + 1;
 const now = new Date().toISOString();
 for (const { unit, lessons } of content) {
  let publishedUnitId: number;
  if (unit.sourceUnitId) {
   const [sourceUnit] = await tx.select().from(courseUnitsDb).where(and(eq(courseUnitsDb.id, unit.sourceUnitId), eq(courseUnitsDb.courseSlug, assignment.courseSlug))).limit(1).for("update");
   if (!sourceUnit) throw new InstructorError("الوحدة الأصلية لم تعد متاحة. راجع خطة المادة", 409, "INSTRUCTOR_SOURCE_CHANGED");
   publishedUnitId = sourceUnit.id;
   await tx.update(courseUnitsDb).set({ title: unit.title, description: unit.description, position: unit.position, status: "published", updatedAt: now }).where(eq(courseUnitsDb.id, sourceUnit.id));
  } else {
   const [created] = await tx.insert(courseUnitsDb).values({ courseSlug: assignment.courseSlug, title: unit.title, description: unit.description, position: position++, status: "published", createdAt: now, updatedAt: now }).returning({ id: courseUnitsDb.id });
   publishedUnitId = created.id;
  }
  const publishedLessons = await tx.select({ position: lessonsDb.position }).from(lessonsDb).where(and(eq(lessonsDb.courseSlug, assignment.courseSlug), eq(lessonsDb.unitId, publishedUnitId)));
  let lessonPosition = publishedLessons.reduce((max, lesson) => Math.max(max, lesson.position), -1) + 1;
  for (const { lesson, asset } of lessons) {
   if (!asset) {
    const [source] = lesson.sourceLessonId ? await tx.select().from(lessonsDb).where(and(eq(lessonsDb.id, lesson.sourceLessonId), eq(lessonsDb.courseSlug, assignment.courseSlug), eq(lessonsDb.unitId, publishedUnitId))).limit(1).for("update") : [];
    if (!source || !source.videoAssetId) throw new InstructorError("تغير الفيديو المعتمد أثناء المراجعة؛ راجع الدرس قبل النشر", 409, "INSTRUCTOR_SOURCE_CHANGED");
    // Review approves metadata edits while preserving the existing video and access flag.
    await tx.update(lessonsDb).set({ title: lesson.title, description: lesson.description, position: lesson.position, status: "published", updatedAt: now }).where(eq(lessonsDb.id, source.id));
    continue;
   }
   const publishedId = lesson.sourceLessonId || "instructor-" + assignment.id + "-lesson-" + lesson.id;
   const values = { title: lesson.title, description: lesson.description, status: "published", videoAssetId: asset.id, durationSeconds: asset.durationSeconds || 0, updatedAt: now };
   if (lesson.sourceLessonId) {
    const [source] = await tx.select().from(lessonsDb).where(and(eq(lessonsDb.id, publishedId), eq(lessonsDb.courseSlug, assignment.courseSlug), eq(lessonsDb.unitId, publishedUnitId))).limit(1).for("update");
    if (!source || source.videoAssetId) throw new InstructorError("تغير فيديو الدرس الأصلي أثناء المراجعة؛ لم يتم استبداله", 409, "INSTRUCTOR_SOURCE_CHANGED");
    await tx.update(lessonsDb).set({ ...values, position: lesson.position }).where(eq(lessonsDb.id, publishedId));
   } else await tx.insert(lessonsDb).values({ ...values, id: publishedId, courseSlug: assignment.courseSlug, unitId: publishedUnitId, position: lessonPosition++, freePreview: false, createdAt: now });
   await tx.update(videoAssets).set({ courseSlug: assignment.courseSlug, lessonId: publishedId, updatedAt: now }).where(eq(videoAssets.id, asset.id));
  }
 }
 const revision = assignment.revision + 1;
 await tx.update(instructorAssignments).set({ status: "published", publishedAt: now, revision, updatedAt: now }).where(eq(instructorAssignments.id, assignment.id));
 await tx.update(catalogCourses).set({ updatedAt: now }).where(eq(catalogCourses.slug, assignment.courseSlug));
 return { reused: false, revision };
}
export async function createInstructorAssignment(tx: InstructorTransaction, actorId: number, body: Record<string, unknown>) {
 const userId = instructorAssignmentId(body.userId), contractId = instructorAssignmentId(body.contractId), courseSlug = cleanText(body.courseSlug, 120), instructions = cleanText(body.instructions, 6000);
 if (!courseSlug) throw new InstructorError("اختر المادة المراد إسنادها");
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor:" + userId}))`);
 const [account] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("share");
 const [profile] = await tx.select().from(instructorProfiles).where(eq(instructorProfiles.userId, userId)).limit(1);
 const [contract] = await tx.select().from(instructorContracts).where(and(eq(instructorContracts.id, contractId), eq(instructorContracts.userId, userId))).limit(1);
 if (account?.role !== "instructor" || account.status !== "active" || !account.emailVerifiedAt || profile?.status !== "approved" || contract?.status !== "signed") throw new InstructorError("يلزم حساب شارح معتمد وعقد عمل موقّع وساري", 409);
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor-publish-course:" + courseSlug}))`);
 const [course] = await tx.select({ slug: catalogCourses.slug }).from(catalogCourses).where(eq(catalogCourses.slug, courseSlug)).limit(1).for("share");
 if (!course) throw new InstructorError("المادة غير موجودة", 404);
 const assignments = await tx.select({ status: instructorAssignments.status }).from(instructorAssignments).where(eq(instructorAssignments.courseSlug, courseSlug));
 if (assignments.some(row => row.status !== "cancelled")) throw new InstructorError("المادة مسندة بالفعل؛ راجع المهمة الحالية", 409);
 const now = new Date().toISOString();
 const [assignment] = await tx.insert(instructorAssignments).values({ userId, contractId, courseSlug, instructions, assignedBy: actorId, status: "assigned", revision: 1, createdAt: now, updatedAt: now }).returning();
 await importAssignedCourseStructure(tx, assignment);
 await tx.insert(notificationsDb).values({ targetUserId: userId, userEmail: null, audience: "user", title: "مادة جديدة لشرحها", body: "أسندت الإدارة مادة جديدة إليك. راجع الملفات والتعليمات من لوحة الشارح", actionUrl: "/instructor", dedupeKey: "instructor-assignment:" + assignment.id + ":assigned", createdAt: now });
 await tx.insert(auditLogs).values({ actorEmail: "user-id:" + actorId, action: "instructor_assignment_create", entityType: "instructor_assignment", entityId: String(assignment.id), afterJson: JSON.stringify({ userId, courseSlug, contractId }), createdAt: now });
 return assignment;
}
export async function reviewInstructorAssignment(tx: InstructorTransaction, actorId: number, id: number, body: Record<string, unknown>) {
 const reason = cleanText(body.reason, 3000), action = body.action;
 if (!["return_changes", "publish", "cancel"].includes(String(action)) || reason.length < 5) throw new InstructorError("أدخل الإجراء وسبب المراجعة بوضوح");
 const assignment = await authorizedInstructorAssignment(tx, id, null, { lock: true, expectedRevision: instructorRevision(body.expectedRevision), requireActive: action === "publish" });
 let result: { revision: number; reused?: boolean }, status: string;
 if (action === "publish") { result = await publishInstructorAssignment(tx, assignment); status = "published"; }
 else {
  if (assignment.status === "published" || assignment.status === "cancelled" || (action === "return_changes" && assignment.status !== "submitted")) throw new InstructorError("حالة المهمة لا تسمح بهذا الإجراء", 409);
  status = action === "cancel" ? "cancelled" : "changes_requested"; result = { revision: assignment.revision + 1 };
  await tx.update(instructorAssignments).set({ status, revision: result.revision, reviewNotes: reason, updatedAt: new Date().toISOString() }).where(eq(instructorAssignments.id, id));
 }
 if (!result.reused) {
  const now = new Date().toISOString();
  if (action === "publish") await tx.update(instructorAssignments).set({ reviewNotes: reason }).where(eq(instructorAssignments.id, id));
  await tx.insert(auditLogs).values({ actorEmail: "user-id:" + actorId, action: "instructor_assignment_" + action, entityType: "instructor_assignment", entityId: String(id), afterJson: JSON.stringify({ status, revision: result.revision, reason }), createdAt: now });
  await tx.insert(notificationsDb).values({ targetUserId: assignment.userId, userEmail: null, audience: "user", title: action === "publish" ? "تم اعتماد الشرح ونشره" : action === "cancel" ? "أُلغيت مهمة الشرح" : "ملاحظات على شرح المادة", body: reason, actionUrl: "/instructor", dedupeKey: "instructor-assignment:" + id + ":review:" + result.revision, createdAt: now });
 }
 return { ...result, status };
}
