"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Phone, Sparkles, UserRound } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import type { Institution } from "@/lib/data";
import { useAcademicPrograms } from "@/components/use-academic-programs";
import { ACADEMIC_LEVELS } from "@/lib/academic-levels";
import { safeAccountReturnTo } from "@/lib/account-readiness";

export function CompleteProfileForm({ initial, institutions }: { initial: { fullName: string; phone: string; universitySlug: string; specialty: string; academicLevel?: string | null }; institutions: Institution[] }) {
  const [form, setForm] = useState({ ...initial, termsAccepted: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const catalog = useAcademicPrograms(form.universitySlug);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json().catch(() => ({})) as { error?: string; next?: string };
      if (!response.ok) throw new Error(data.error || "تعذر حفظ البيانات");
      let stored = "";
      try { stored = sessionStorage.getItem("meras_return_to") || ""; } catch { /* Optional storage. */ }
      const returnTo = safeAccountReturnTo(new URLSearchParams(window.location.search).get("return_to") || stored);
      if (data.next === "/verify-email" || data.next === "/onboarding") {
        try { sessionStorage.setItem("meras_return_to", returnTo); } catch { /* URL retains the next step. */ }
        window.location.assign(`${data.next}?return_to=${encodeURIComponent(returnTo)}`);
      } else {
        try { sessionStorage.removeItem("meras_return_to"); } catch { /* Optional storage. */ }
        window.location.assign(/^\/(?:complete-profile|verify-email)(?:\?|$)/.test(returnTo) ? "/dashboard" : returnTo);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر حفظ البيانات"); setLoading(false); }
  };
  return <form className="auth-form" onSubmit={submit} aria-busy={loading}>
    <div className="auth-heading"><span>ملف واحد لكل رحلتك</span><h1>أكمل بيانات حسابك</h1><p>أضف اسمك وجوالك وبياناتك الدراسية لتظهر لك المواد المناسبة. بعد إكمال الملف وتأكيد البريد تستطيع الشراء مباشرة دون تكرار التحقق.</p></div>
    <label className="form-label">الاسم الكامل<div className="input-with-icon"><UserRound size={18} /><input required minLength={5} maxLength={120} autoComplete="name" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} /></div></label>
    <label className="form-label">رقم الجوال السعودي<div className="input-with-icon"><Phone size={18} /><input required type="tel" autoComplete="tel" pattern="(?:\+?966|0)?5[0-9]{8}" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} dir="ltr" placeholder="05xxxxxxxx" /></div></label>
    <label className="form-label">الجامعة أو الكلية<div className="input-with-icon"><GraduationCap size={18} /><SearchableSelect required value={form.universitySlug} onChange={event => setForm({ ...form, universitySlug: event.target.value, specialty: "" })}><option value="">اختر جامعتك</option>{institutions.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</SearchableSelect></div></label>
    <label className="form-label">التخصص<div className="input-with-icon"><Sparkles size={18} /><SearchableSelect required disabled={!form.universitySlug || catalog.loading} value={form.specialty} onChange={event => setForm({ ...form, specialty: event.target.value })}><option value="">{catalog.loading ? "جارٍ تحميل التخصصات…" : "اختر تخصصك"}</option>{form.specialty && !catalog.programs.some(item => item.name === form.specialty) && <option value={form.specialty}>{form.specialty}</option>}{catalog.programs.map(item => <option key={`${item.name}-${item.degree}`} value={item.name}>{item.name} — {item.degree}</option>)}</SearchableSelect></div></label>
    <label className="form-label">المستوى الدراسي<div className="input-with-icon"><GraduationCap size={18} /><SearchableSelect required value={form.academicLevel || ""} onChange={event => setForm({ ...form, academicLevel: event.target.value })}><option value="">اختر مستواك الحالي</option>{ACADEMIC_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}</SearchableSelect></div><small className="catalog-status">يمكن تعديل المستوى لاحقًا من الملف الشخصي.</small></label>
    <label className="terms-check"><input type="checkbox" required checked={form.termsAccepted} onChange={event => setForm({ ...form, termsAccepted: event.target.checked })} /><span>أوافق على <Link href="/terms">الشروط والأحكام</Link> و<Link href="/privacy">سياسة الخصوصية</Link>.</span></label>
    {(error || catalog.error) && <p className="form-error" role="alert">{error || catalog.error}</p>}
    <button className="button button-primary auth-submit" disabled={loading || catalog.loading || !form.termsAccepted}>{loading ? "جارٍ الحفظ…" : <>حفظ ومتابعة <ArrowLeft size={16} /></>}</button>
  </form>;
}
