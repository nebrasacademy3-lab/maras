import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { appleAccountTokens } from "@/db/oauth-privacy-schema";
import { appleClientSecret } from "@/lib/oauth-provider";
function tokenKey() {
  const secret = process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim() || "";
  const raw = /^[a-f0-9]{64}$/i.test(secret) ? Buffer.from(secret, "hex") : /^[A-Za-z0-9+/]{43}=$/.test(secret) ? Buffer.from(secret, "base64") : null;
  if (!raw || raw.length !== 32) throw new Error("OAuth token encryption is not configured");
  return createHmac("sha256", raw).update("maras:apple-revocation:v1").digest();
}
const context = (userId: number, clientId: string) => Buffer.from(JSON.stringify(["apple-revocation-v1",userId,clientId]));
export function encryptAppleToken(token: string, userId: number, clientId: string) {
  if (!token || token.length > 8192 || !Number.isSafeInteger(userId) || userId < 1) throw new Error("Invalid Apple token");
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",tokenKey(),iv);cipher.setAAD(context(userId,clientId));
  const body=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),body.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
}
export function decryptAppleToken(value: string, userId: number, clientId: string) {
  const [version,nonce,body,tag,...extra]=value.split(".");
  if(value.length>12000||version!=="v1"||extra.length||![nonce,body,tag].every(v=>v&&/^[A-Za-z0-9_-]+$/.test(v)))throw new Error("Invalid encrypted Apple token");
  const iv=Buffer.from(nonce,"base64url"),authTag=Buffer.from(tag,"base64url");if(iv.length!==12||authTag.length!==16)throw new Error("Invalid Apple token envelope");
  const decipher=createDecipheriv("aes-256-gcm",tokenKey(),iv);decipher.setAAD(context(userId,clientId));decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(body,"base64url")),decipher.final()]).toString("utf8");
}
export async function revokeAppleToken(token: string, clientId: string, signal?: AbortSignal) {
  const response=await fetch("https://appleid.apple.com/auth/revoke",{method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.any([AbortSignal.timeout(12000),...(signal?[signal]:[])]),headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:await appleClientSecret(clientId),token,token_type_hint:"refresh_token"})});
  if(!response.ok)throw new Error("Apple revocation unavailable");
}
export async function processAppleRevocations(options: { userId?: number; signal?: AbortSignal } = {}) {
  const db=getDb(), now=new Date().toISOString();
  const rows=await db.select().from(appleAccountTokens).where(and(eq(appleAccountTokens.status,"pending"),lte(appleAccountTokens.nextRetryAt,now),options.userId?eq(appleAccountTokens.userId,options.userId):undefined)).limit(5);
  let completed=0;
  for(const row of rows){
    options.signal?.throwIfAborted();
    const unchanged=and(eq(appleAccountTokens.userId,row.userId),eq(appleAccountTokens.status,"pending"),eq(appleAccountTokens.ciphertext,row.ciphertext));
    try{await revokeAppleToken(decryptAppleToken(row.ciphertext,row.userId,row.clientId),row.clientId,options.signal);await db.delete(appleAccountTokens).where(unchanged);completed++;}
    catch{await db.update(appleAccountTokens).set({attempts:Math.min(1_000_000,row.attempts+1),nextRetryAt:new Date(Date.now()+Math.min(86400,60*2**Math.min(row.attempts,11))*1000).toISOString(),updatedAt:now}).where(unchanged);}
  }
  return { attempted:rows.length,completed,pending:rows.length-completed };
}
