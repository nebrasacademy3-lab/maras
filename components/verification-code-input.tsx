"use client";

import type { Ref } from "react";
import { normalizeVerificationCode } from "@/lib/auth-input";
import styles from "./verify-email-form.module.css";

export function VerificationCodeInput({ id, value, onChange, inputRef, invalid = false, disabled = false }: {
  id: string; value: string; onChange: (value: string) => void; inputRef?: Ref<HTMLInputElement>; invalid?: boolean; disabled?: boolean;
}) {
  return <div className={styles.codeGroup} dir="ltr" data-invalid={invalid || undefined}>
    <div className={styles.codeSlots} aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index} data-filled={Boolean(value[index])} data-current={index === Math.min(value.length, 5)}>{value[index] || "·"}</span>)}</div>
    <input ref={inputRef} id={id} name="code" className={styles.codeInput} type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" minLength={6} required pattern="[0-9]{6}" value={value} onChange={event => onChange(normalizeVerificationCode(event.target.value))} onPaste={event => { event.preventDefault(); onChange(normalizeVerificationCode(event.clipboardData.getData("text"))); }} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} disabled={disabled} spellCheck={false} autoCapitalize="off" />
  </div>;
}
