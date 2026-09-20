"use client";
import { adminFetch } from "@/lib/admin-client";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import styles from "./admin-instructors.module.css";
export class InstructorAdminRequestError extends Error { constructor(message:string, readonly status:number) { super(message); } }
export async function instructorAdminJson<T>(url: string, init: RequestInit = {}): Promise<T> {
 const response = await adminFetch(url, { credentials: "same-origin", cache: "no-store", ...init });
 const value = await response.json().catch(() => ({}));
 if (isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
 if (!response.ok) throw new InstructorAdminRequestError(value.error || "تعذر إكمال الطلب",response.status); return value;
}
export function InstructorAdminError({ message }: { message: string }) { return message ? isAdminStepUpMessage(message) ? <AdminMfaNotice /> : <p role="alert" className={styles.error}>{message}</p> : null; }
export function instructorDate(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : "—"; }
export const applicationStatuses: Record<string,string> = { draft:"مسودة", submitted:"قيد المراجعة", changes_requested:"بانتظار الاستكمال", approved:"معتمد", rejected:"مرفوض", suspended:"موقوف" };
export const contractStatuses: Record<string,string> = { draft:"مسودة", offered:"بانتظار التوقيع", signed:"موقّع", withdrawn:"عرض مسحوب", terminated:"منتهي" };
