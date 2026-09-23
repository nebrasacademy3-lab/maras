// A transport or provider failure does not prove a charge was never created.
// Keep ambiguous attempts open until a verified callback or finance review resolves them.
export function tapProviderOutcomeIsUncertain(response: { ok: boolean; status: number }, hasProviderObject = false) {
  return response.ok || hasProviderObject || response.status >= 500 || [408, 409, 425, 429].includes(response.status);
}

export function tapChargeCreationResult(response: { ok: boolean; status: number }, value: unknown):
  | { kind: "initiated"; chargeId: string; checkoutUrl: string }
  | { kind: "pending"; chargeId: string | null }
  | { kind: "failed"; chargeId: null } {
  const charge = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const chargeId = typeof charge.id === "string" && /^chg_[A-Za-z0-9_-]{1,150}$/.test(charge.id) ? charge.id : null;
  const transaction = charge.transaction && typeof charge.transaction === "object" ? charge.transaction as Record<string, unknown> : {};
  let checkoutUrl: string | null = null;
  if (typeof transaction.url === "string" && transaction.url.length <= 8192) {
    try {
      const url = new URL(transaction.url);
      if (url.protocol === "https:" && !url.username && !url.password) checkoutUrl = url.href;
    } catch { /* An invalid redirect is never sent to the browser. */ }
  }
  if (response.ok && chargeId && checkoutUrl) return { kind: "initiated", chargeId, checkoutUrl };
  if (tapProviderOutcomeIsUncertain(response, Boolean(chargeId))) return { kind: "pending", chargeId };
  return { kind: "failed", chargeId: null };
}
