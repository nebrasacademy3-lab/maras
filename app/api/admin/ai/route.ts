import { asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiApiKeys, aiEntitlements, aiServiceSettings, aiSubscriptionOrders, aiUsageEvents, auditLogs, platformSettings, users } from "@/db/schema";
import { cleanText, isUniqueConstraintError, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest, validEmail } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { aiKeyFingerprint, decryptAiApiKey, encryptAiApiKey, maskAiKey, validGeminiApiKey } from "@/lib/ai-keys";
import { AI_SERVICES, isAiService } from "@/lib/ai-contracts";
import { DEFAULT_AI_SETTINGS, getAiMonthlyPrice, getAiServiceSettings } from "@/lib/ai-platform";
import { ADMIN_PERMISSIONS, hasPermission } from "@/lib/permissions";
import { createAndSendNotification } from "@/lib/notifications";
import { observeRequest } from "@/lib/observability";

export const dynamic = "force-dynamic";

async function adminGuard(request: Request, mutation: boolean) {
  const user = await getSessionUser(request);
  if (!user || !await hasPermission(user, ADMIN_PERMISSIONS.AI_MANAGE)) return { user: null, response: jsonError("غير مصرح بإدارة أدوات مراس", 403) };
  if (mutation && !sameOriginRequest(request)) return { user: null, response: jsonError("تعذر التحقق من مصدر الطلب", 403) };
  if (!await checkRateLimit(mutation ? "admin-ai-write" : "admin-ai-read", `user:${user.id}`, mutation ? 50 : 120, 60)) return { user: null, response: jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429) };
  if (mutation) {
    try { await requireAdminStepUp(request, user); }
    catch (error) { return { user: null, response: error instanceof AdminMfaError ? jsonError(error.message, error.status, error.code) : jsonError("مطلوب تحقق إداري إضافي", 403) }; }
  }
  return { user, response: null };
}

function safeJson(value: unknown) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

async function audit(request: Request, actor: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
  await getDb().insert(auditLogs).values({ actorEmail: actor, action, entityType, entityId, beforeJson: before == null ? null : safeJson(before), afterJson: after == null ? null : safeJson(after), ipAddress: clientIp(request), createdAt: new Date().toISOString() });
}

function keyPayload(row: typeof aiApiKeys.$inferSelect) {
  let masked = "مفتاح مشفر";
  try { masked = maskAiKey(decryptAiApiKey(row.encryptedKey)); } catch { masked = "تعذر فك المفتاح"; }
  return { id: row.id, label: row.label, projectLabel: row.projectLabel, maskedKey: masked, fingerprint: row.fingerprint.slice(0, 12), priority: row.priority, status: row.status, cooldownUntil: row.cooldownUntil, consecutiveFailures: row.consecutiveFailures, lastUsedAt: row.lastUsedAt, lastSuccessAt: row.lastSuccessAt, lastErrorCode: row.lastErrorCode, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function GET(request: Request) {
  return observeRequest(request, "admin.ai.read", async () => {
    const guarded = await adminGuard(request, false);
    if (guarded.response) return guarded.response;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    const [settings, price, keys, entitlements, usage, subscriptionOrders, subscriptionTotals] = await Promise.all([
      getAiServiceSettings(),
      getAiMonthlyPrice(),
      getDb().select().from(aiApiKeys).orderBy(asc(aiApiKeys.priority), asc(aiApiKeys.label)),
      getDb().select({ entitlement: aiEntitlements, email: users.email, fullName: users.fullName }).from(aiEntitlements).innerJoin(users, eq(aiEntitlements.userId, users.id)).orderBy(desc(aiEntitlements.createdAt)).limit(300),
      getDb().select({ service: aiUsageEvents.service, status: aiUsageEvents.status, total: count() }).from(aiUsageEvents).where(gte(aiUsageEvents.createdAt, since)).groupBy(aiUsageEvents.service, aiUsageEvents.status),
      getDb().select({ id: aiSubscriptionOrders.id, orderNumber: aiSubscriptionOrders.orderNumber, userId: aiSubscriptionOrders.userId, customerEmail: aiSubscriptionOrders.customerEmail, customerName: aiSubscriptionOrders.customerName, amount: aiSubscriptionOrders.amount, currency: aiSubscriptionOrders.currency, status: aiSubscriptionOrders.status, paidAt: aiSubscriptionOrders.paidAt, entitlementExpiresAt: aiSubscriptionOrders.entitlementExpiresAt, createdAt: aiSubscriptionOrders.createdAt }).from(aiSubscriptionOrders).orderBy(desc(aiSubscriptionOrders.createdAt)).limit(200),
      getDb().select({ status: aiSubscriptionOrders.status, total: count(), amount: sql<number>`coalesce(sum(${aiSubscriptionOrders.amount}), 0)::float` }).from(aiSubscriptionOrders).groupBy(aiSubscriptionOrders.status),
    ]);
    const environmentKeyCount = [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY].filter(Boolean).join(",").split(/[\r\n,;]+/).map(validGeminiApiKey).filter(Boolean).length;
    return Response.json({
      ok: true,
      monthlyPrice: price,
      currency: "SAR",
      settings: AI_SERVICES.map((service) => settings[service]),
      keys: keys.map(keyPayload),
      environmentKeyCount,
      entitlements: entitlements.map((row) => ({ ...row.entitlement, email: row.email, fullName: row.fullName })),
      usage: usage.map((row) => ({ service: row.service, status: row.status, total: Number(row.total) })),
      subscriptionOrders,
      subscriptionSummary: subscriptionTotals.map((row) => ({ status: row.status, total: Number(row.total), amount: Number(row.amount || 0) })),
    }, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  });
}

export async function POST(request: Request) {
  return observeRequest(request, "admin.ai.write", async () => {
    const guarded = await adminGuard(request, true);
    if (guarded.response || !guarded.user) return guarded.response;
    let payload: Record<string, unknown>;
    try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الإدارة غير صالحة"); }
    const action = cleanText(payload.action, 40);
    const db = getDb();
    const now = new Date().toISOString();
    try {
      if (action === "saveService") {
        if (!isAiService(payload.service)) return jsonError("الخدمة غير صالحة");
        const fallback = DEFAULT_AI_SETTINGS[payload.service];
        const model = cleanText(payload.model, 100);
        if (!/^[a-zA-Z0-9._-]{2,100}$/.test(model)) return jsonError("اسم نموذج الخدمة غير صالح");
        const values = {
          service: payload.service,
          enabled: payload.enabled === true,
          model,
          freeMonthlyLimit: Math.max(0, Math.min(100_000, Math.floor(Number(payload.freeMonthlyLimit)) || 0)),
          subscriberMonthlyLimit: Math.max(0, Math.min(100_000, Math.floor(Number(payload.subscriberMonthlyLimit)) || 0)),
          maxOutputTokens: Math.max(256, Math.min(65_536, Math.floor(Number(payload.maxOutputTokens)) || fallback.maxOutputTokens)),
          maxFileBytes: Math.max(256 * 1024, Math.min(50 * 1024 * 1024, Math.floor(Number(payload.maxFileBytes)) || fallback.maxFileBytes)),
          temperature: Math.max(0, Math.min(1, Number(payload.temperature) || 0)),
          instructions: cleanText(payload.instructions, 4_000),
          updatedBy: guarded.user.email,
          updatedAt: now,
        };
        const [before] = await db.select().from(aiServiceSettings).where(eq(aiServiceSettings.service, payload.service)).limit(1);
        const [row] = await db.insert(aiServiceSettings).values(values).onConflictDoUpdate({ target: aiServiceSettings.service, set: values }).returning();
        await audit(request, guarded.user.email, "update", "ai_service_setting", payload.service, before, row);
        return Response.json({ ok: true, setting: row }, { headers: { "cache-control": "no-store" } });
      }
      if (action === "addKey") {
        const apiKey = validGeminiApiKey(payload.apiKey);
        const label = cleanText(payload.label, 100);
        if (!apiKey || label.length < 2) return jsonError("أدخل اسمًا ومفتاح مزود الخدمة صالحًا");
        const [row] = await db.insert(aiApiKeys).values({ label, projectLabel: cleanText(payload.projectLabel, 120) || null, encryptedKey: encryptAiApiKey(apiKey), fingerprint: aiKeyFingerprint(apiKey), priority: Math.max(1, Math.min(10_000, Math.floor(Number(payload.priority)) || 100)), status: "active", createdBy: guarded.user.email, createdAt: now, updatedAt: now }).returning();
        await audit(request, guarded.user.email, "create", "ai_api_key", String(row.id), null, { ...keyPayload(row), encryptedKey: undefined });
        return Response.json({ ok: true, key: keyPayload(row) }, { status: 201, headers: { "cache-control": "no-store" } });
      }
      if (action === "updateKey") {
        const id = Math.floor(Number(payload.id));
        const status = payload.status === "active" ? "active" : payload.status === "disabled" ? "disabled" : "";
        if (!id || !status) return jsonError("بيانات المفتاح غير صالحة");
        const [before] = await db.select().from(aiApiKeys).where(eq(aiApiKeys.id, id)).limit(1);
        if (!before) return jsonError("المفتاح غير موجود", 404);
        const [row] = await db.update(aiApiKeys).set({ label: cleanText(payload.label, 100) || before.label, projectLabel: cleanText(payload.projectLabel, 120) || null, priority: Math.max(1, Math.min(10_000, Math.floor(Number(payload.priority)) || before.priority)), status, cooldownUntil: status === "active" ? null : before.cooldownUntil, consecutiveFailures: status === "active" ? 0 : before.consecutiveFailures, lastErrorCode: status === "active" ? null : before.lastErrorCode, updatedAt: now }).where(eq(aiApiKeys.id, id)).returning();
        await audit(request, guarded.user.email, "update", "ai_api_key", String(id), keyPayload(before), keyPayload(row));
        return Response.json({ ok: true, key: keyPayload(row) }, { headers: { "cache-control": "no-store" } });
      }
      if (action === "setSubscription") {
        const price = Number(payload.monthlyPrice);
        if (!Number.isFinite(price) || price < 1 || price > 10_000) return jsonError("سعر الاشتراك غير صالح");
        const [before] = await db.select().from(platformSettings).where(eq(platformSettings.key, "ai_monthly_price_sar")).limit(1);
        const values = { key: "ai_monthly_price_sar", value: String(Math.round(price * 100) / 100), category: "ai", isPublic: true, updatedBy: guarded.user.email, updatedAt: now };
        const [row] = await db.insert(platformSettings).values(values).onConflictDoUpdate({ target: platformSettings.key, set: values }).returning();
        await audit(request, guarded.user.email, "update", "platform_setting", row.key, before, row);
        return Response.json({ ok: true, monthlyPrice: Number(row.value) }, { headers: { "cache-control": "no-store" } });
      }
      if (action === "grantEntitlement") {
        const email = cleanText(payload.email, 180).toLowerCase();
        if (!validEmail(email)) return jsonError("البريد الإلكتروني غير صالح");
        const [student] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
        if (!student) return jsonError("المستخدم غير موجود", 404);
        const source = payload.source === "paid" || payload.source === "gift" || payload.source === "referral" ? payload.source : "admin";
        const months = Math.max(1, Math.min(36, Math.floor(Number(payload.months)) || 1));
        const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60_000).toISOString();
        const [row] = await db.insert(aiEntitlements).values({ userId: student.id, source, externalRef: crypto.randomUUID(), status: "active", startsAt: now, expiresAt, createdBy: guarded.user.email, createdAt: now, updatedAt: now }).returning();
        await audit(request, guarded.user.email, "create", "ai_entitlement", String(row.id), null, row);
        await createAndSendNotification({ values: { userEmail: student.email, audience: "student", title: "تم تفعيل أدوات مراس", body: `أصبح اشتراك أدوات مراس متاحًا لك لمدة ${months} ${months === 1 ? "شهر" : "أشهر"}.`, actionUrl: "/study-tools", actionLabel: "فتح أدوات مراس", template: "ai_entitlement" }, target: { userEmail: student.email }, data: { route: "/study-tools" } });
        return Response.json({ ok: true, entitlement: row }, { status: 201, headers: { "cache-control": "no-store" } });
      }
      if (action === "updateEntitlement") {
        const id = Math.floor(Number(payload.id));
        const status = payload.status === "active" ? "active" : payload.status === "revoked" ? "revoked" : "";
        if (!id || !status) return jsonError("بيانات الاستحقاق غير صالحة");
        const [before] = await db.select().from(aiEntitlements).where(eq(aiEntitlements.id, id)).limit(1);
        if (!before) return jsonError("الاستحقاق غير موجود", 404);
        const [row] = await db.update(aiEntitlements).set({ status, updatedAt: now }).where(eq(aiEntitlements.id, id)).returning();
        await audit(request, guarded.user.email, "update", "ai_entitlement", String(id), before, row);
        return Response.json({ ok: true, entitlement: row }, { headers: { "cache-control": "no-store" } });
      }
      return jsonError("الإجراء الإداري غير معروف");
    } catch (error) {
      if (isUniqueConstraintError(error)) return jsonError("هذا السجل موجود مسبقًا", 409);
      return jsonError("تعذر حفظ إعدادات أدوات مراس", 500);
    }
  });
}
