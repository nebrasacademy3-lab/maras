import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiConversations, aiFileJobs, aiFiles, users } from "@/db/schema";
import { AiPlatformError } from "@/lib/ai-platform";
import { resolveAiSource } from "@/lib/ai-course-source";
import { studySourceFingerprint } from "@/lib/study-processing-plan";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type StudyJobControl = "pause" | "resume" | "cancel";
async function settleStoppedUsage(tx: Tx, job: typeof aiFileJobs.$inferSelect, code: string) {
  if (!job.usageEventId) return;
  await tx.execute(sql`UPDATE ai_usage_events SET status=CASE WHEN EXISTS (SELECT 1 FROM study_job_attempts WHERE job_id=${job.id} AND billable=true) THEN 'billable_failed' ELSE 'failed' END,
    input_tokens=least(100000000,coalesce((SELECT sum(input_tokens) FROM study_job_attempts WHERE job_id=${job.id}),0)),
    output_tokens=least(100000000,coalesce((SELECT sum(output_tokens) FROM study_job_attempts WHERE job_id=${job.id}),0)),error_code=${code}
    WHERE id=${job.usageEventId} AND user_id=${job.userId} AND status='processing'`);
}
/** Idempotent owner controls. Pausing permits the current validated part to be saved,
 * but schedules no new part. Cancellation immediately fences publication; provider
 * cancellation/billing cannot be guaranteed after a request has been dispatched. */
export async function controlStudyJob(input: { id: string; user: {id: number; email: string}; client: "web" | "app"; action: StudyJobControl }) {
  if (!/^[a-f0-9-]{36}$/.test(input.id) || !["pause", "resume", "cancel"].includes(input.action)) throw new AiPlatformError("AI_JOB_CONTROL_INVALID", "طلب تحكم غير صالح.");
  const [reference] = await getDb().select().from(aiFileJobs).where(and(eq(aiFileJobs.id,input.id),eq(aiFileJobs.userId,input.user.id))).limit(1);
  if (!reference) throw new AiPlatformError("AI_JOB_NOT_FOUND", "الطلب غير موجود.", 404);
  return getDb().transaction(async tx => {
    // Match the publication lock order; source entitlement is checked again in
    // this transaction, not just in the browser or before acquiring the job lock.
    const [user] = await tx.select({id:users.id}).from(users).where(and(eq(users.id,input.user.id),eq(users.status,"active"))).limit(1).for("share");
    const [conversation] = await tx.select({id:aiConversations.id}).from(aiConversations).where(and(eq(aiConversations.id,reference.conversationId),eq(aiConversations.userId,input.user.id),eq(aiConversations.status,"active"))).limit(1).for("share");
    const [file] = await tx.select().from(aiFiles).where(and(eq(aiFiles.id,reference.fileId),eq(aiFiles.userId,input.user.id))).limit(1).for("share");
    if (!user || !conversation || !file) throw new AiPlatformError("AI_JOB_NOT_FOUND", "الطلب غير متاح.", 404);
    const source = await resolveAiSource(file,input.user,input.client,tx,true);
    const [job] = await tx.select().from(aiFileJobs).where(and(eq(aiFileJobs.id,input.id),eq(aiFileJobs.userId,input.user.id))).limit(1).for("update");
    if (!job || job.fileId !== reference.fileId || job.conversationId !== reference.conversationId) throw new AiPlatformError("AI_JOB_NOT_FOUND", "الطلب غير موجود.", 404);
    if (job.processingVersion !== 2) throw new AiPlatformError("AI_JOB_LEGACY", "الطلب السابق يستخدم مسار المعالجة القديم ولا يدعم تحكم الأجزاء.",409);
    if (["succeeded","failed","cancelled"].includes(job.status)) return job;
    if (!["queued","processing","paused"].includes(job.status)) throw new AiPlatformError("AI_JOB_STATE", "حالة الطلب غير قابلة للتحكم.",409);
    if (input.action === "resume" && (Date.now()-Date.parse(job.createdAt)>7*86400_000 || job.sourceFingerprint!==studySourceFingerprint(source))) throw new AiPlatformError("AI_JOB_RESUME_INVALID", "انتهت نافذة الاستكمال أو تغير المصدر؛ لم نمزج نسختين.",409);
    const now=new Date().toISOString(); let progress: Record<string,unknown>={}; try {progress=JSON.parse(job.progressJson || "{}");} catch { /* legacy optional progress */ }
    const active = job.status === "processing" && !!job.leaseUntil && Date.parse(job.leaseUntil)>Date.now();
    const status = input.action === "cancel" ? "cancelled" : input.action === "pause" ? active ? "processing" : "paused" : active ? "processing" : "queued";
    const phase = input.action === "cancel" ? "cancelled" : input.action === "pause" ? active ? "pausing" : "paused" : "processing";
    const [updated]=await tx.update(aiFileJobs).set({status,pauseRequested:input.action==="pause",availableAt:now,updatedAt:now,
      ...(!active || input.action==="cancel" ? {leaseOwner:null,leaseUntil:null} : {}),
      errorCode:input.action==="cancel" ? "AI_JOB_CANCELLED" : null,
      errorMessage:input.action==="cancel" ? "أُلغي الطلب. الأجزاء المعتمدة محفوظة مؤقتًا؛ قد يكون الطلب الجاري للمزوّد قد استهلك حصة." : null,
      progressJson:JSON.stringify({...progress,phase,percent:Math.min(99,Number(progress.percent)||0)}),
    }).where(eq(aiFileJobs.id,job.id)).returning();
    if (input.action==="cancel") await settleStoppedUsage(tx,job,"AI_JOB_CANCELLED");
    return updated;
  });
}
/** Paused requests cannot hold queue capacity and quota reservations indefinitely. */
export async function expirePausedStudyJobs() {
  await getDb().transaction(async tx=>{
    const jobs=await tx.select().from(aiFileJobs).where(and(eq(aiFileJobs.processingVersion,2),eq(aiFileJobs.status,"paused"),sql`${aiFileJobs.createdAt}::timestamptz <= clock_timestamp() - interval '7 days'`)).limit(100).for("update",{skipLocked:true});
    for(const job of jobs) {
      const now=new Date().toISOString();
      await tx.update(aiFileJobs).set({status:"failed",pauseRequested:false,errorCode:"AI_QUEUE_EXPIRED",errorMessage:"انتهت نافذة استكمال الطلب (7 أيام). لم يبدأ توليد جديد.",leaseOwner:null,leaseUntil:null,updatedAt:now}).where(eq(aiFileJobs.id,job.id));
      await settleStoppedUsage(tx,job,"AI_QUEUE_EXPIRED");
    }
  });
}
