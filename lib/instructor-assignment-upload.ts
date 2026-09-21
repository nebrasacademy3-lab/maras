import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { instructorAssignments, instructorLessons, instructorUnits } from "@/db/instructor-schema";
import { InstructorError } from "@/lib/instructor-security";
import { assertDraftAsset, authorizedInstructorAssignment, instructorAssignmentId } from "@/lib/instructor-assignments";
import type { ReauthorizeUpload, ResumableVideoTarget } from "@/lib/resumable-video-upload";
export function instructorAssignmentUploadAuthorization(db: ReturnType<typeof getDb>, userId: number, assignmentId: number): ReauthorizeUpload {
 return async (courseSlug, tx, lessonKey) => {
  if (courseSlug !== "instructor-" + assignmentId) throw new InstructorError("الرفع لا يتبع المهمة", 403);
  const connection = tx || db;
  await authorizedInstructorAssignment(connection, assignmentId, userId, { lock: Boolean(tx), mutable: true });
  if (lessonKey) {
   const match = /^draft-([1-9]\d*)$/.exec(lessonKey);
   if (!match) throw new InstructorError("مسار الدرس غير صالح", 403);
   const [lesson] = await connection.select({ unitId: instructorLessons.unitId }).from(instructorLessons).where(eq(instructorLessons.id, instructorAssignmentId(match[1]))).limit(1);
   const [unit] = lesson ? await connection.select({ id: instructorUnits.id }).from(instructorUnits).where(and(eq(instructorUnits.id, lesson.unitId), eq(instructorUnits.assignmentId, assignmentId))).limit(1) : [];
   if (!unit) throw new InstructorError("الدرس لم يعد موجودًا في المهمة", 404);
  }
  return userId;
 };
}
export function instructorAssignmentUploadTarget(assignmentId: number, expectedRevision: number): ResumableVideoTarget {
 return {
  async assertLesson(tx, ownerId, data) {
   const assignment = await authorizedInstructorAssignment(tx, assignmentId, ownerId, { lock: true, mutable: true, expectedRevision });
   const match = /^draft-([1-9]\d*)$/.exec(data.lessonId);
   if (data.courseSlug !== "instructor-" + assignmentId || !match) throw new InstructorError("الدرس لا يتبع المهمة", 403);
   const id = instructorAssignmentId(match[1]);
   const [lesson] = await tx.select().from(instructorLessons).where(eq(instructorLessons.id, id)).limit(1).for("update");
   const [unit] = lesson ? await tx.select().from(instructorUnits).where(and(eq(instructorUnits.id, lesson.unitId), eq(instructorUnits.assignmentId, assignmentId))).limit(1) : [];
   if (!lesson || !unit) throw new InstructorError("الدرس غير موجود في المهمة", 404);
   if (lesson.videoAssetId) await assertDraftAsset(tx, assignment, id, lesson.videoAssetId);
  },
  async assertReplacement(tx, ownerId, data, assetId) {
   const assignment = await authorizedInstructorAssignment(tx, assignmentId, ownerId, { mutable: true });
   const id = instructorAssignmentId(data.lessonId.replace(/^draft-/, ""));
   await assertDraftAsset(tx, assignment, id, assetId);
  },
  async linkAsset(tx, ownerId, data, assetId, durationSeconds) {
   const assignment = await authorizedInstructorAssignment(tx, assignmentId, ownerId, { mutable: true, expectedRevision });
   const lessonId = instructorAssignmentId(data.lessonId.replace(/^draft-/, "")), now = new Date().toISOString();
   await tx.update(instructorLessons).set({ videoAssetId: assetId, durationSeconds, updatedAt: now }).where(eq(instructorLessons.id, lessonId));
   await tx.update(instructorAssignments).set({ status: "in_progress", revision: assignment.revision + 1, updatedAt: now }).where(eq(instructorAssignments.id, assignmentId));
  },
 };
}
