"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import styles from "./admin-mfa-notice.module.css";

export const ADMIN_STEP_UP_STATUS = 428;
export const ADMIN_STEP_UP_MESSAGE = "هذه العملية الحساسة تتطلب التحقق الإداري الإضافي. فعّل المصادقة بخطوتين أو أدخل رمز التحقق من صفحة أمان الحساب ثم أعد المحاولة.";

export function isAdminStepUpResponse(response: { status: number }) {
  return response.status === ADMIN_STEP_UP_STATUS;
}

export function isAdminStepUpMessage(message: string) {
  return message === ADMIN_STEP_UP_MESSAGE;
}

export function AdminMfaNotice({ message = ADMIN_STEP_UP_MESSAGE, compact = false }: { message?: string; compact?: boolean }) {
  return <div className={`${styles.notice} ${compact ? styles.compact : ""}`} role="alert">
    <LockKeyhole size={17} />
    <p>{message}</p>
    <Link href="/admin/security">فتح أمان الحساب</Link>
  </div>;
}
