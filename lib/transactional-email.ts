import "server-only";

export class EmailDeliveryError extends Error {
  readonly code: string;
  readonly status = 503;
  constructor(configured: boolean) {
    super(configured ? "تعذر إرسال البريد حاليًا. حاول مرة أخرى بعد قليل." : "خدمة البريد غير مهيأة حاليًا. تواصل مع الدعم لتفعيل إرسال رمز التحقق.");
    this.name = "EmailDeliveryError";
    this.code = configured ? "EMAIL_DELIVERY_FAILED" : "EMAIL_NOT_CONFIGURED";
  }
}

export function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export async function sendTransactionalEmail(input: { to: string; subject: string; text: string; idempotencyKey: string }) {
  if (!emailDeliveryConfigured()) throw new EmailDeliveryError(false);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "content-type": "application/json", "idempotency-key": input.idempotencyKey },
      body: JSON.stringify({ from: process.env.EMAIL_FROM!.trim(), to: [input.to], subject: input.subject, text: input.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new EmailDeliveryError(true);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string" || !result.id) throw new EmailDeliveryError(true);
  } catch {
    // Never expose provider responses, recipient details, credentials, or verification codes.
    throw new EmailDeliveryError(true);
  }
}
