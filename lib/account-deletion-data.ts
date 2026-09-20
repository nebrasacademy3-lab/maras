import { and, eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { accountMfaChallenges, accountMfaRecoveryCodes, adminMfaFactors, aiArtifacts, aiConversations, aiEntitlements, aiFileJobs, aiFiles, aiMessages, aiQuizAttempts, aiQuizzes, authDevices, emailChangeRequests, emailVerificationCodes, notificationReads, oauthExchanges, oauthIdentities } from "@/db/schema";
import { appleAccountTokens } from "@/db/oauth-privacy-schema";
import { instructorDocuments, instructorProfiles } from "@/db/instructor-schema";
import { studyUploadSessions } from "@/db/study-upload-schema";
import type { CleanupTarget } from "@/lib/storage-cleanup-policy";
type Transaction=Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export async function removeAccountPrivateData(tx: Transaction,userId:number,now:string) {
  const apple=await tx.select({id:oauthIdentities.id}).from(oauthIdentities).where(and(eq(oauthIdentities.userId,userId),eq(oauthIdentities.provider,"apple"))).limit(1);
  const tokens=await tx.select({userId:appleAccountTokens.userId}).from(appleAccountTokens).where(eq(appleAccountTokens.userId,userId)).limit(1);
  await tx.update(appleAccountTokens).set({status:"pending",nextRetryAt:now,updatedAt:now}).where(eq(appleAccountTokens.userId,userId));
  const files=await tx.select({objectKey:aiFiles.objectKey,storageProvider:aiFiles.storageProvider,sourceResourceId:aiFiles.sourceResourceId}).from(aiFiles).where(eq(aiFiles.userId,userId));
  const documents=await tx.select({objectKey:instructorDocuments.objectKey,storageProvider:instructorDocuments.storageProvider}).from(instructorDocuments).where(eq(instructorDocuments.userId,userId));
  const targets:CleanupTarget[]=[...files.filter(file=>!file.sourceResourceId),...documents].map(file=>({key:file.objectKey,provider:file.storageProvider as "local"|"s3",source:"account-deletion"}));
  // Worker inventory survives; expiring active uploads prevents accepting further parts.
  await tx.update(studyUploadSessions).set({expiresAt:new Date(now),updatedAt:new Date(now)}).where(eq(studyUploadSessions.ownerId,userId));
  await tx.delete(aiFileJobs).where(eq(aiFileJobs.userId,userId));
  await tx.delete(aiQuizAttempts).where(eq(aiQuizAttempts.userId,userId));
  await tx.delete(aiQuizzes).where(eq(aiQuizzes.userId,userId));
  await tx.delete(aiArtifacts).where(eq(aiArtifacts.userId,userId));
  await tx.delete(aiMessages).where(eq(aiMessages.userId,userId));
  await tx.delete(aiFiles).where(eq(aiFiles.userId,userId));
  await tx.delete(aiConversations).where(eq(aiConversations.userId,userId));
  await tx.delete(aiEntitlements).where(eq(aiEntitlements.userId,userId));
  await tx.delete(instructorDocuments).where(eq(instructorDocuments.userId,userId));
  // Signed agreements and delivered work retain their immutable contractual snapshots.
  await tx.update(instructorProfiles).set({addressEncrypted:"",bankEncrypted:null,bio:"",teachingSubjects:"",specialty:"",qualification:"",reviewNotes:"",status:"suspended",updatedAt:now}).where(eq(instructorProfiles.userId,userId));
  await tx.delete(oauthIdentities).where(eq(oauthIdentities.userId,userId));
  await tx.delete(oauthExchanges).where(eq(oauthExchanges.userId,userId));
  await tx.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId,userId));
  await tx.delete(emailChangeRequests).where(eq(emailChangeRequests.userId,userId));
  await tx.delete(accountMfaChallenges).where(eq(accountMfaChallenges.userId,userId));
  await tx.delete(accountMfaRecoveryCodes).where(eq(accountMfaRecoveryCodes.userId,userId));
  await tx.delete(adminMfaFactors).where(eq(adminMfaFactors.userId,userId));
  await tx.delete(authDevices).where(eq(authDevices.userId,userId));
  await tx.delete(notificationReads).where(eq(notificationReads.userId,userId));
  return {targets,appleManualRevocationRequired:Boolean(apple.length&&!tokens.length)};
}
