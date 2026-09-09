"use client";

import { useId, useState } from "react";
import { CheckCircle2, Circle, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { passwordRequirements } from "@/lib/auth-input";
import styles from "./security-form.module.css";

export function PasswordFields({ password, confirmation, onPasswordChange, onConfirmationChange }: {
  password: string; confirmation: string; onPasswordChange: (value: string) => void; onConfirmationChange: (value: string) => void;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const mismatch = Boolean(confirmation) && confirmation !== password;
  return <>
    <label className={styles.field} htmlFor={`${id}-password`}>كلمة المرور الجديدة
      <span className={styles.input}><LockKeyhole size={19} aria-hidden="true" /><input id={`${id}-password`} name="newPassword" dir="ltr" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={event => onPasswordChange(event.target.value)} aria-describedby={`${id}-requirements`} /><button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={visible}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></span>
    </label>
    <ul id={`${id}-requirements`} className={styles.requirements}>{passwordRequirements(password).map(item => <li key={item.label} className={item.met ? styles.met : undefined}>{item.met ? <CheckCircle2 size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}<span>{item.label}{item.met ? " ✓" : ""}</span></li>)}</ul>
    <label className={styles.field} htmlFor={`${id}-confirmation`}>تأكيد كلمة المرور
      <span className={styles.input}><LockKeyhole size={19} aria-hidden="true" /><input id={`${id}-confirmation`} name="confirmPassword" dir="ltr" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={event => onConfirmationChange(event.target.value)} aria-invalid={mismatch || undefined} aria-describedby={confirmation ? `${id}-match` : undefined} /></span>
      {confirmation && <small id={`${id}-match`} className={styles.hint}>{mismatch ? "كلمتا المرور غير متطابقتين بعد." : "كلمتا المرور متطابقتان."}</small>}
    </label>
  </>;
}
