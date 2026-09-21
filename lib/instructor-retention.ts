import { and, eq, lte, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { instructorDocuments, instructorProfiles } from "@/db/instructor-schema";
import { auditLogs } from "@/db/schema";
import { enqueueStorageCleanupTx } from "@/lib/storage-cleanup";
import type { StorageProvider } from "@/lib/storage";
/** Physical deletion uses the durable outbox; an unavailable object store is retried. */
export async function expireInstructorDocuments(db:ReturnType<typeof getDb>,limit=20){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new RangeError("Invalid document expiry batch");
 const now=new Date().toISOString();
 const candidates=await db.selectDistinct({userId:instructorDocuments.userId}).from(instructorDocuments).where(lte(instructorDocuments.expiresAt,now)).limit(limit);
 let expired=0;
 for(const {userId} of candidates){
  expired+=await db.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor:"+userId}))`);
   const docs=await tx.select().from(instructorDocuments).where(and(eq(instructorDocuments.userId,userId),lte(instructorDocuments.expiresAt,now))).limit(30).for("update");
   if(!docs.length)return 0;
   await enqueueStorageCleanupTx(tx,docs.map(doc=>({key:doc.objectKey,provider:doc.storageProvider as StorageProvider,source:"instructor-document-expired"})));
   for(const doc of docs)await tx.delete(instructorDocuments).where(eq(instructorDocuments.id,doc.id));
   await tx.update(instructorProfiles).set({revision:sql`${instructorProfiles.revision}+1`,updatedAt:now}).where(eq(instructorProfiles.userId,userId));
   await tx.insert(auditLogs).values({actorEmail:"system:instructor-retention",action:"instructor.documents.expired",entityType:"instructor_profile",entityId:String(userId),afterJson:JSON.stringify({documentIds:docs.map(doc=>doc.id),count:docs.length})});
   return docs.length;
  });
 }
 return expired;
}
