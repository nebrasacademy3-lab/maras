"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Laptop, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { adminFetch } from "@/lib/admin-client";
import { useAdminAccess } from "@/components/admin-access";
import { confirmAction } from "@/lib/interaction-events";
import { DEVICE_ACTIONS, DEVICE_ACTION_DESCRIPTIONS, DEVICE_ACTION_LABELS, devicePolicyLabel, type DeviceAction, type DeviceReturnPolicy } from "@/lib/device-access-policy";
import styles from "./registered-devices.module.css";

type Device = { id: number; deviceLabel: string; platform: string; firstSeenAt: string; lastSeenAt: string; revokedAt: string | null; revocationReason: string | null; returnPolicy?: DeviceReturnPolicy; blockedUntil?: string | null; policyVersion?: number };
type Snapshot = { registeredDevices: Device[]; deviceLimit: number; serverTime: string; historyMayBeTruncated?: boolean };
type Props = { email: string; onChanged?: () => void | Promise<void> };
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ar-SA") : "غير محدد";
export function AdminRegisteredDevices(props: Props) {
  const access = useAdminAccess();
  if (!access.can(["students.devices.view"])) return null;
  return <DeviceManager key={props.email.toLowerCase()} {...props} canManage={access.can(["students.devices.manage"])} />;
}
function DeviceManager({ email, onChanged, canManage }: Props & { canManage: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Device | null>(null);
  const [action, setAction] = useState<DeviceAction>("revoke_block");
  const [reason, setReason] = useState(""); const [hours, setHours] = useState("24");
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const mounted = useRef(true); const loader = useRef<AbortController | null>(null); const writer = useRef<AbortController | null>(null);
  const endpoint = `/api/admin/students/${encodeURIComponent(email)}/devices`;
  const load = useCallback(async () => {
    loader.current?.abort(); const controller = new AbortController(); loader.current = controller;
    let expired = false; const timer = setTimeout(() => { expired = true; controller.abort(); }, 15000);
    try {
      const response = await adminFetch(endpoint, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تحميل الأجهزة");
      if (mounted.current && loader.current === controller && !controller.signal.aborted) { setSnapshot(result); setError(""); }
    } catch (caught) {
      if (mounted.current && loader.current === controller && (!controller.signal.aborted || expired)) setError(expired ? "انتهت مهلة تحميل الأجهزة؛ أعد المحاولة." : caught instanceof Error ? caught.message : "تعذر التحميل");
    } finally { clearTimeout(timer); }
  }, [endpoint]);
  useEffect(() => { mounted.current = true; const timer = setTimeout(() => void load(), 0); return () => { mounted.current = false; clearTimeout(timer); loader.current?.abort(); writer.current?.abort(); }; }, [load]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !canManage || pending.current || reason.trim().length < 4) return;
    const command = { action, deviceId: selected.id, expectedRevision: selected.policyVersion || 0, reason: reason.trim(), ...(action === "block_until" ? { durationHours: Number(hours) } : {}) };
    const confirmed = await confirmAction({ title: DEVICE_ACTION_LABELS[action], message: `${selected.deviceLabel}\n${DEVICE_ACTION_DESCRIPTIONS[action]}\nالسبب: ${command.reason}${action === "block_until" ? `\nمدة الحظر: ${hours} ساعة` : ""}`, destructive: action !== "allow_return", confirmLabel: "تأكيد الإجراء" });
    if (!confirmed || !mounted.current || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice(""); loader.current?.abort();
    const controller = new AbortController(); writer.current = controller;
    try {
      const response = await adminFetch(endpoint, { method: "POST", credentials: "same-origin", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      const result = await response.json() as Snapshot & { error?: string; code?: string };
      if (!mounted.current) return;
      if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الإجراء؛ البيانات المدخلة باقية.");
      setSnapshot(result); setSelected(null); setReason(""); setNotice("تم تنفيذ الإجراء وتوثيقه. لا تُستعاد أي جلسة قديمة."); try { await onChanged?.(); } catch { setNotice("تم تنفيذ الإجراء، لكن تحديث ملخص الطالب تعثر؛ حدّث الملخص دون تكرار العملية."); }
    } catch (caught) { if (mounted.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "تعذر تعديل الجهاز"); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const serverTime = snapshot ? Date.parse(snapshot.serverTime) : 0;
  return <section className={styles.panel} aria-label="أجهزة الطالب وسياسة العودة"><header><span><ShieldCheck size={21}/><strong>اعتماد الأجهزة والجلسات</strong></span><button type="button" className="button button-soft" disabled={busy} onClick={() => void load()} aria-label="تحديث الأجهزة"><RefreshCw size={16}/></button></header>
    <p>إنهاء الجلسة لا يسحب اعتماد الجهاز. عند سحب الاعتماد يمكنك تحديد منع العودة أو السماح بدخول جديد أو انتظار موافقة. تُفحص الحصة وMFA عند الدخول، ولا يحيي رفع المنع الجلسات القديمة.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {!snapshot ? <p role="status">جارٍ تحميل الأجهزة…</p> : <><small>{snapshot.registeredDevices.filter(device => !device.revokedAt).length} من {snapshot.deviceLimit} أجهزة معتمدة</small>
      {snapshot.historyMayBeTruncated && <p>يعرض هذا الجزء حتى 500 سجل؛ راجع سجل التدقيق للتاريخ الكامل.</p>}
      <div className={styles.list}>{snapshot.registeredDevices.map(device => <article key={device.id}><i>{device.platform === "web" ? <Laptop size={19}/> : <Smartphone size={19}/>}</i><div><strong>{device.deviceLabel}</strong><small>{devicePolicyLabel(device, serverTime)}</small><small>آخر استخدام: {date(device.lastSeenAt)}</small>{device.revokedAt && <small>سحب الاعتماد: {date(device.revokedAt)} · {device.revocationReason}</small>}{device.blockedUntil && <small>موعد انتهاء الحظر: {date(device.blockedUntil)} — يلزم دخول جديد</small>}</div>{canManage && <button type="button" className="button button-soft" disabled={busy} onClick={() => { setSelected(device); setAction(device.revokedAt ? "allow_return" : "end_sessions"); setReason(""); setHours("24"); setError(""); }}>إدارة الجهاز</button>}</article>)}</div>
      {!snapshot.registeredDevices.length && <p>لم يسجل الطالب جهازًا بعد.</p>}</>}
    {selected && canManage && <form className={styles.confirm} onSubmit={submit}><strong>{selected.deviceLabel}</strong><label>الإجراء<select disabled={busy} value={action} onChange={e => setAction(e.target.value as DeviceAction)}>{DEVICE_ACTIONS.filter(value => value !== "allow_return" || Boolean(selected.revokedAt)).map(value => <option value={value} key={value}>{DEVICE_ACTION_LABELS[value]}</option>)}</select></label><p>{DEVICE_ACTION_DESCRIPTIONS[action]}</p>
      {action === "block_until" && <label>مدة الحظر بالساعات (1–2160)<input type="number" min={1} max={2160} step={1} required value={hours} disabled={busy} onChange={e => setHours(e.target.value)}/></label>}
      <label>سبب الإجراء<textarea required minLength={4} maxLength={600} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="سجّل سببًا واضحًا بعد التحقق من طلب الطالب"/></label>
      <div><button type="submit" className="button button-primary" disabled={busy || reason.trim().length < 4}>{busy ? "جارٍ التحقق والتنفيذ…" : "مراجعة وتأكيد"}</button><button type="button" className="button button-soft" disabled={busy} onClick={() => setSelected(null)}>إلغاء</button></div>
    </form>}
  </section>;
}
