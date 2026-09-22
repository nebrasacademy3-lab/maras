"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Identity = { id: number; email: string };
const headers = { "x-meras-client": "mobile-v1", "x-meras-platform": "web", "content-type": "application/json" };
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, headers, credentials: "same-origin", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000), ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "تعذر إكمال الطلب؛ أعد المحاولة.");
  return payload;
}
export function AccountDeletionRequest() {
  const [identity, setIdentity] = useState<Identity | null>(null), [ready, setReady] = useState(false), [allowed, setAllowed] = useState(false);
  const [confirmation, setConfirmation] = useState(""), [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [emailMode, setEmailMode] = useState(false), [busy, setBusy] = useState(false), [deleted, setDeleted] = useState(false), [message, setMessage] = useState("");
  const mounted = useRef(true), pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const me = await request("/api/auth/me");
        if (!mounted.current) return;
        if (!me.user) { setReady(true); return; }
        const state = await request("/api/mobile/account");
        if (!mounted.current) return;
        setIdentity({ id: me.user.id, email: me.user.email }); setAllowed(state.allowed === true); setEmailMode(state.method === "email_code");
      } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "تعذر التحقق من الحساب."); }
      finally { if (mounted.current) setReady(true); }
    })();
    return () => { mounted.current = false; };
  }, []);
  async function perform(action: "send" | "delete") {
    if (pending.current || !identity || !allowed) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const current = await request("/api/auth/me");
      if (current.user?.id !== identity.id) throw new Error("تغيّر الحساب؛ حدّث الصفحة قبل المتابعة.");
      if (action === "send") {
        await request("/api/mobile/account", "POST", {});
        if (mounted.current) setMessage("أُرسل رمز حذف مستقل إلى بريد الحساب. لا تشاركه مع أي شخص.");
      } else {
        await request("/api/mobile/account", "DELETE", { userId: identity.id, confirmation, ...(emailMode ? { code } : { password }) });
        if (mounted.current) { setDeleted(true); setPassword(""); setCode(""); setIdentity(null); }
      }
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "تعذر إكمال العملية."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  if (deleted) return <div role="status"><h2>تم حذف الحساب</h2><p>أُنهي الوصول للحساب وجلساته. تُنفّذ إزالة الملفات وفق إجراءات التنظيف وسياسة الاحتفاظ المنشورة.</p><Link href="/">العودة للرئيسية</Link></div>;
  if (!ready) return <p role="status">جارٍ التحقق من جلسة الحساب…</p>;
  if (!identity) return <div><h2>حذف الحساب من المتصفح</h2><p>سجّل الدخول لإثبات ملكية الحساب ثم ارجع إلى هذه الصفحة. لا يلزم تثبيت التطبيق.</p><Link className="button button-primary" href="/login?return_to=%2Faccount-deletion">تسجيل الدخول للحذف</Link>{message && <p role="alert">{message}</p>}</div>;
  if (!allowed) return <p>هذا الحساب الإداري أو الإشرافي يُدار من المدير الأعلى؛ تواصل معه لإغلاقه.</p>;
  return <form onSubmit={event => { event.preventDefault(); void perform("delete"); }} style={{ display: "grid", gap: 16, maxWidth: 600 }}>
    <h2>طلب حذف حساب مراس العلم</h2><p>الحساب: <b dir="ltr">{identity.email}</b>. هذا إجراء نهائي وليس تعطيلًا مؤقتًا.</p>
    <label>عبارة التأكيد<input className="form-input" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="حذف حسابي" disabled={busy} autoComplete="off" required /></label>
    {emailMode ? <><button type="button" className="button" disabled={busy} onClick={() => void perform("send")}>إرسال رمز حذف إلى بريدي</button><label>رمز حذف الحساب<input className="form-input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[^0-9]/g, ""))} disabled={busy} required /></label></> : <><label>كلمة المرور<input className="form-input" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required /></label><button type="button" className="button" disabled={busy} onClick={() => { setEmailMode(true); setPassword(""); }}>استخدام رمز البريد بدل كلمة المرور</button></>}
    {message && <p role="status">{message}</p>}
    <button className="button button-primary" type="submit" disabled={busy || confirmation !== "حذف حسابي" || (emailMode ? code.length !== 6 : password.length < 8)}>{busy ? "جارٍ تنفيذ الطلب…" : "تأكيد حذف الحساب نهائيًا"}</button>
    <Link href="/">إلغاء والاحتفاظ بالحساب</Link>
  </form>;
}
