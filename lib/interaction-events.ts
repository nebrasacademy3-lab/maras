"use client";

export type ConfirmOptions = { title?: string; message: string; confirmLabel?: string; destructive?: boolean; inputLabel?: string; defaultValue?: string };
let sequence = 0;
export type InteractionRequest = { id: number; kind: "confirm" | "prompt" | "mfa"; options: ConfirmOptions; resolve: (value: string | boolean | null) => void };
let listener: ((request: InteractionRequest) => void) | null = null;
let pendingMfa: Promise<boolean> | null = null;
export function registerInteractionListener(value: (request: InteractionRequest) => void) {
  listener = value;
  return () => { if (listener === value) listener = null; };
}
function request(kind: InteractionRequest["kind"], options: ConfirmOptions) {
  return new Promise<string | boolean | null>((resolve) => {
    if (!listener) { resolve(false); return; }
    listener({ id: ++sequence, kind, options, resolve });
  });
}
export async function confirmAction(value: string | ConfirmOptions) {
  return await request("confirm", typeof value === "string" ? { message: value, destructive: true } : value) === true;
}
export async function promptAction(message: string, defaultValue = "") {
  const value = await request("prompt", { title: "تفاصيل العملية", message, inputLabel: "القيمة", defaultValue, confirmLabel: "متابعة" });
  return typeof value === "string" ? value : null;
}
export function requestAdminVerification(setupRequired = false) {
  if (!pendingMfa) pendingMfa = request("mfa", { title: "تأكيد هويتك", message: setupRequired ? "setup" : "stepUp" }).then(value => value === true).finally(() => { pendingMfa = null; });
  return pendingMfa;
}
export function notify(message: string, tone: "success" | "error" | "info" = "info") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("meras:toast", { detail: { message, tone } }));
}
