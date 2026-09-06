import "server-only";
import { prepareSecurityEmail } from "@/lib/email-renderer";
import { canUseHostedEmailTemplate, EMAIL_TEMPLATE_ENV, type SecurityEmailContent } from "@/lib/email-branding";

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

export async function sendTransactionalEmail(input: { to: string; subject: string; text: string; idempotencyKey: string; security?: SecurityEmailContent }) {
  if (!emailDeliveryConfigured()) throw new EmailDeliveryError(false);
  try {
    const prepared = input.security ? await prepareSecurityEmail(input.security) : null;
    const templateId = input.security ? process.env[EMAIL_TEMPLATE_ENV[input.security.kind]]?.trim() : "";
    if (templateId && !/^[A-Za-z0-9_-]{1,128}$/.test(templateId)) throw new EmailDeliveryError(true);
    // Defaults work immediately with server-rendered HTML. Optional published
    // Resend templates receive the same current settings on every new message.
    const body = prepared && prepared.allowHostedTemplate && templateId && canUseHostedEmailTemplate(prepared.variables)
      ? { template: { id: templateId, variables: prepared.variables } }
      : { text: input.text, ...(prepared ? { html: prepared.html } : {}) };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "content-type": "application/json", "idempotency-key": input.idempotencyKey },
      body: JSON.stringify({ from: process.env.EMAIL_FROM!.trim(), to: [input.to], subject: input.subject, ...body }),
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
