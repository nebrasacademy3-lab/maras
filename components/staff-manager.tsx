"use client";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UsersRound, Plus, RefreshCw, Monitor, X, Search } from "lucide-react";
import { adminFetch } from "@/lib/admin-client";
import { confirmAction, promptAction, notify } from "@/lib/interaction-events";
import type { StaffMember, StaffResponse } from "@/lib/staff-contracts";
import styles from "./staff-manager.module.css";

type Draft = { id?: number; fullName: string; email: string; phone: string; password: string; permissions: string[]; expectedUpdatedAt?: string };
const blank = (): Draft => ({ fullName: "", email: "", phone: "", password: "", permissions: [] });
export function StaffManager() {
  const [data, setData] = useState<StaffResponse | null>(null);
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null); const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try { const response = await adminFetch(`/api/admin/staff?q=${encodeURIComponent(query)}&page=${page}`, { signal }); const result = await response.json() as StaffResponse; if (!response.ok) throw new Error(result.error || "تعذر تحميل المشرفين"); setData(result); setError(""); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "تعذر الاتصال"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [query, page]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 250); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  async function action(payload: Record<string, unknown>) {
    if (busy) return false; setBusy(true); setError("");
    try { const response = await adminFetch("/api/admin/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تنفيذ العملية"); await load(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر التنفيذ"); return false; }
    finally { setBusy(false); }
  }
  async function manage(member: StaffMember, kind: string, sessionId?: number | "all") {
    if (member.isPlatformOwner) return;
    const label = kind === "resetMfa" ? "إعادة ضبط MFA" : kind === "revokeSession" ? "إنهاء الجلسات المحددة" : kind === "activate" ? "تفعيل الحساب" : "إيقاف الحساب";
    if (!await confirmAction({ title: label, message: `${member.fullName}\nسيُسجّل الإجراء باسم المدير الأعلى. لا تُعرض أو تُستعاد أسرار التحقق.`, destructive: kind !== "activate", confirmLabel: "متابعة" })) return;
    const reason = await promptAction("سبب الإجراء (أربعة أحرف على الأقل)"); if (!reason || reason.trim().length < 4) { if (reason !== null) notify("اكتب سببًا واضحًا للإجراء", "error"); return; }
    await action({ action: kind, id: member.id, expectedUpdatedAt: member.updatedAt, sessionId, reason });
  }
  function edit(member: StaffMember) { setDraft({ id: member.id, fullName: member.fullName, email: member.email, phone: member.phone || "", password: "", permissions: [...member.permissions], expectedUpdatedAt: member.updatedAt }); setFilter(""); }
  return <section className={styles.root} aria-busy={busy}>
    <header className={styles.hero}><div><span className={styles.eyebrow}><ShieldCheck size={16}/> إدارة الوصول</span><h2>فريق مراس، بصلاحيات واضحة</h2><p>المدير الأعلى وحده يدير المشرفين. كل صلاحية غير ممنوحة محجوبة من الخادم؛ تتطلب العمليات الحساسة تحققًا إضافيًا.</p></div><button type="button" className="button button-primary" disabled={busy} onClick={() => { setDraft(blank()); setFilter(""); }}><Plus size={17}/> إضافة مشرف</button></header>
    {error && <div role="alert" className={styles.error}>{error}<button type="button" onClick={() => void load()}>إعادة المحاولة</button></div>}
    <div className={styles.toolbar}><label><Search size={18}/><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="ابحث بالاسم أو البريد" aria-label="البحث في المشرفين"/></label><span>{data?.total ?? "—"} حساب إدارة</span><button type="button" className="button button-outline" disabled={loading} onClick={() => void load()}><RefreshCw size={16}/> تحديث</button></div>
    {draft && <form className={styles.editor} onSubmit={async e => { e.preventDefault(); if (await action({ action: "save", role: "supervisor", ...draft })) setDraft(null); }}>
      <header><h3>{draft.id ? "تعديل المشرف وصلاحياته" : "مشرف جديد"}</h3><button type="button" aria-label="إغلاق محرر المشرف" disabled={busy} onClick={() => setDraft(null)}><X size={20}/></button></header>
      <div className={styles.fields}>{([['fullName','الاسم الكامل','text'],['email','البريد الإلكتروني','email'],['phone','الجوال (اختياري)','tel'],['password',draft.id ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور الأولية','password']] as const).map(([key,label,type]) => <label key={key}>{label}<input type={type} value={draft[key]} autoComplete={key === "password" ? "new-password" : "off"} required={key === "fullName" || key === "email" || key === "password" && !draft.id} readOnly={key === "email" && !!draft.id} minLength={key === "fullName" ? 5 : key === "password" ? 10 : undefined} maxLength={key === "password" ? 128 : 180} dir={key === "fullName" ? "auto" : "ltr"} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/></label>)}</div>
      <h4>ما الذي يمكنه إدارته؟</h4><p>«عرض» لا يمنح التعديل. الحذف يحتاج صلاحية الحذف وصلاحية إدارة القسم معًا. لن يتمكن أي مشرف من إدارة المدير أو بقية المشرفين.</p>
      <div className={styles.toolbar}><input aria-label="البحث في الصلاحيات" placeholder="ابحث عن صلاحية..." value={filter} onChange={e => setFilter(e.target.value)}/><button type="button" onClick={() => setDraft({ ...draft, permissions: data?.permissions.map(p => p.key) || [] })}>تحديد كل الصلاحيات القابلة للتفويض</button><button type="button" onClick={() => setDraft({ ...draft, permissions: [] })}>إلغاء التحديد</button></div>
      <div className={styles.grants}>{data?.permissions.filter(p => p.label.includes(filter)).map(permission => <label key={permission.key}><input type="checkbox" checked={draft.permissions.includes(permission.key)} onChange={e => setDraft({ ...draft, permissions: e.target.checked ? [...draft.permissions, permission.key] : draft.permissions.filter(key => key !== permission.key) })}/><span>{permission.label}<small dir="ltr">{permission.key}</small></span></label>)}</div>
      <footer><small>حفظ الصلاحيات أو كلمة المرور ينهي الجلسات الحالية للمشرف.</small><button className="button button-primary" disabled={busy}>{busy ? "جارٍ الحفظ والتحقق…" : "حفظ المشرف"}</button></footer>
    </form>}
    <div className={styles.members}>{data?.staff.map(member => <article key={member.id} className={styles.member}>
      <header><span className={styles.avatar}>{member.isPlatformOwner ? <ShieldCheck/> : <UsersRound/>}</span><div><h3>{member.fullName}</h3><p dir="ltr">{member.email}</p></div><span className={styles.badge}>{member.isPlatformOwner ? "المدير الأعلى · محمي" : member.status === "active" ? "مشرف نشط" : "مشرف متوقف"}</span></header>
      <div className={styles.stats}><span>MFA: <b>{member.mfaEnabled ? "مفعّل" : "غير مفعّل"}</b></span><span><Monitor size={15}/> {member.sessions.length}{member.sessionsMayBeTruncated ? "+" : ""} جلسات نشطة</span><span>{member.isPlatformOwner ? "كل الصلاحيات" : `${member.permissions.length} صلاحيات محددة`}</span></div>
      {!member.isPlatformOwner && <><div className={styles.actions}><button disabled={busy} onClick={() => edit(member)}>تعديل الصلاحيات</button><button disabled={busy} onClick={() => void manage(member, member.status === "active" ? "suspend" : "activate")}>{member.status === "active" ? "إيقاف الحساب" : "تفعيل الحساب"}</button><button disabled={busy} onClick={() => void manage(member, "revokeSession", "all")}>إنهاء كل الجلسات</button>{member.mfaEnabled && <button disabled={busy} onClick={() => void manage(member, "resetMfa")}>إعادة ضبط MFA</button>}</div><details><summary>تفاصيل الأجهزة والجلسات</summary>{member.sessions.length ? member.sessions.map(session => <div key={session.id} className={styles.session}><div><strong>{session.deviceLabel || session.platform || "جهاز"}</strong><small>آخر نشاط: {new Date(session.lastSeenAt).toLocaleString("ar-SA")}</small><small>{session.platform}</small></div><button disabled={busy} onClick={() => void manage(member, "revokeSession", session.id)}>إنهاء الجلسة</button></div>) : <p>لا توجد جلسات نشطة.</p>}</details></>}
    </article>)}</div>
    {data && !data.staff.length && <p className={styles.empty}>لا توجد حسابات مطابقة للبحث.</p>}
    {data && data.total > data.pageSize && <footer className={styles.toolbar}><button disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>السابق</button><span>صفحة {page}</span><button disabled={page * data.pageSize >= data.total || loading} onClick={() => setPage(page + 1)}>التالي</button></footer>}
  </section>;
}
