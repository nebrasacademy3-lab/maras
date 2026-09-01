import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, platformSettings } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { complianceCatalog, complianceStatuses } from "@/lib/compliance-catalog";
import { ADMIN_PERMISSIONS, authorizePermission } from "@/lib/permissions";

const prefix = "compliance_";

export async function GET(request: Request) {
  if (!await authorizePermission(request, ADMIN_PERMISSIONS.COMPLIANCE_VIEW)) return jsonError("غير مصرح بعرض ملف الامتثال", 403);
  const rows = await getDb().select().from(platformSettings).where(eq(platformSettings.category, "compliance"));
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const items = complianceCatalog.map((item) => ({
    ...item,
    status: values[`${prefix}${item.key}_status`] || "not_started",
    owner: values[`${prefix}${item.key}_owner`] || "",
    evidence: values[`${prefix}${item.key}_evidence`] || "",
    reviewDate: values[`${prefix}${item.key}_review_date`] || "",
    notes: values[`${prefix}${item.key}_notes`] || "",
  }));
  const ready = items.filter((item) => ["ready", "verified"].includes(item.status)).length;
  return Response.json({ ok: true, disclaimer: "هذه أداة متابعة داخلية ولا تمثل اعتمادًا أو ترخيصًا من المركز الوطني للتعليم الإلكتروني.", progress: Math.round(ready / Math.max(1, items.length) * 100), items }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await authorizePermission(request, ADMIN_PERMISSIONS.COMPLIANCE_MANAGE);
  if (!user) return jsonError("غير مصرح بتحديث ملف الامتثال", 403);
  try {
    await requireAdminStepUp(request, user);
  } catch (error) {
    if (error instanceof AdminMfaError) {
      return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    throw error;
  }
  if (!await checkRateLimit("compliance-update", `admin:${user.id}`, 120, 60)) return jsonError("تحديثات كثيرة خلال وقت قصير", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الامتثال غير صالحة"); }
  const key = cleanText(payload.key, 80).replace(/[^a-z_]/g, "");
  const item = complianceCatalog.find((candidate) => candidate.key === key);
  if (!item) return jsonError("بند الامتثال غير موجود", 404);
  const status = cleanText(payload.status, 30);
  if (!complianceStatuses.includes(status as typeof complianceStatuses[number])) return jsonError("حالة الامتثال غير صالحة");
  const values = {
    [`${prefix}${key}_status`]: status,
    [`${prefix}${key}_owner`]: cleanText(payload.owner, 160),
    [`${prefix}${key}_evidence`]: cleanText(payload.evidence, 1_500),
    [`${prefix}${key}_review_date`]: cleanText(payload.reviewDate, 30),
    [`${prefix}${key}_notes`]: cleanText(payload.notes, 2_000),
  };
  const now = new Date().toISOString();
  await getDb().transaction(async (tx) => {
    for (const [settingKey, value] of Object.entries(values)) {
      await tx.insert(platformSettings).values({ key: settingKey, value, category: "compliance", isPublic: false, updatedBy: user.email, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value, category: "compliance", isPublic: false, updatedBy: user.email, updatedAt: now } });
    }
    await tx.insert(auditLogs).values({ actorEmail: user.email, action: "update", entityType: "compliance", entityId: key, afterJson: JSON.stringify(values), ipAddress: clientIp(request), createdAt: now });
  });
  return Response.json({ ok: true, item: item.title }, { headers: { "cache-control": "no-store" } });
}
