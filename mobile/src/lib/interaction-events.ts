import type { AlertButton, AlertOptions } from "react-native";
export type NativeInteraction = { id: number; kind: "alert" | "admin" | "verify" | "prompt"; defaultValue?: string; title: string; message: string; setupRequired?: boolean; buttons?: AlertButton[]; options?: AlertOptions; verify?: (code: string) => Promise<unknown>; resolve: (value: unknown) => void };
let host: ((request: NativeInteraction) => void) | null = null;
let sequence = 0;
let pendingAdmin: Promise<boolean> | null = null;
let toastHost: ((message: string, tone: "success" | "error" | "info") => void) | null = null;
export function registerNativeInteractions(handler: (request: NativeInteraction) => void, toast: NonNullable<typeof toastHost>) {
  host = handler; toastHost = toast;
  return () => { if (host === handler) host = null; if (toastHost === toast) toastHost = null; };
}
function open(input: Omit<NativeInteraction, "id" | "resolve">) {
  return new Promise<unknown>(resolve => { if (!host) { resolve(false); return; } host({ ...input, id: ++sequence, resolve }); });
}
export const MerasAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    void open({ kind: "alert", title, message: message || "", buttons: buttons?.length ? buttons : [{ text: "حسنًا" }], options });
  },
};
export function requestNativeAdminMfa(setupRequired = false) {
  if (!pendingAdmin) pendingAdmin = open({ kind: "admin", title: "تأكيد هويتك", message: "تبقى بيانات النموذج كما هي، وتُستكمل العملية بعد نجاح التحقق.", setupRequired }).then(value => value === true).finally(() => { pendingAdmin = null; });
  return pendingAdmin;
}
export async function verifyNativeLogin<T>(verify: (code: string) => Promise<T>): Promise<T> {
  const result = await open({ kind: "verify", title: "التحقق الإضافي", message: "أدخل رمز تطبيق المصادقة أو رمز استعادة غير مستخدم. لا تشاركه مع أي شخص.", verify });
  if (!result || typeof result !== "object") throw new Error("لم يكتمل التحقق. أعد تسجيل الدخول عندما تكون جاهزًا.");
  return result as T;
}
export function nativeToast(message: string, tone: "success" | "error" | "info" = "info") { toastHost?.(message.slice(0, 500), tone); }

export async function promptNative(title: string, message = "", defaultValue = "") {
  const result = await open({ kind: "prompt", title, message, defaultValue });
  return typeof result === "string" ? result : null;
}
