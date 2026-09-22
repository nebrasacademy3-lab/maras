import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { supportTickets } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { readBoundedJsonObject } from "@/lib/request-body";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const sources = new Set(["assistant", "message", "artifact", "quiz"]);
const reply = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers });
/** Accept a bounded user-submitted allegation, never fetch a URL or trust a supplied user ID. */
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return reply("مصدر الطلب غير مسموح", 403);
  try {
    if (!await checkRateLimit("ai-content-report-network", clientIp(request), 15, 3600)) return reply("بلغت حد البلاغات؛ حاول لاحقًا", 429);
    let value: Record<string, unknown>;
    try { value = await readBoundedJsonObject(request, 24 * 1024); } catch { return reply("بيانات البلاغ غير صالحة", 400); }
    const { source, reference, reason, excerpt } = value;
    if (typeof source !== "string" || !sources.has(source)
        || typeof reference !== "string" || !/^[a-zA-Z0-9:._-]{1,90}$/.test(reference)
        || typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500
        || typeof excerpt !== "string" || excerpt.length > 2000
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(reason + excerpt)) return reply("اكتب سببًا واضحًا ومختصرًا للبلاغ", 400);
    const user = await getSessionUser(request);
    if (user && !await checkRateLimit("ai-content-report-account", String(user.id), 10, 3600)) return reply("بلغت حد البلاغات لهذا الحساب", 429);
    const ticketNumber = `AI-${randomUUID()}`, now = new Date().toISOString();
    await getDb().insert(supportTickets).values({
      ticketNumber, userId: user?.id ?? null, userEmail: user?.email ?? null,
      category: "technical", priority: "normal", title: "بلاغ عن محتوى الذكاء الاصطناعي",
      // Explicitly label client-provided context so reviewers do not mistake it for verified evidence.
      message: `بلاغ يقدمه المستخدم للمراجعة، وليس إثباتًا لمحتوى محفوظ.\nالمصدر: ${source}\nالمرجع: ${reference}\nالسبب: ${reason.trim()}\nمقتطف اختاره المبلّغ: ${excerpt || "لم يُرسل مقتطف؛ راجع المرجع بعد التحقق من صاحبه."}`,
      contactChannel: "in_app", tagsJson: JSON.stringify(["ai-content-review", source]), createdAt: now, updatedAt: now,
    });
    return Response.json({ ok: true, reference: ticketNumber }, { status: 201, headers });
  } catch { return reply("تعذر حفظ البلاغ الآن؛ حاول مجددًا", 503); }
}
