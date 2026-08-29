"use client";

import { useState } from "react";
import { ArrowLeft, GraduationCap, Phone, Sparkles, UserRound } from "lucide-react";
import type { Institution } from "@/lib/data";
import { useAcademicPrograms } from "@/components/use-academic-programs";
import { ACADEMIC_LEVELS } from "@/lib/academic-levels";

export function CompleteProfileForm({ initial, institutions }: { initial: { fullName: string; phone: string; universitySlug: string; specialty: string; academicLevel?: string | null }; institutions: Institution[] }) {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const catalog = useAcademicPrograms(form.universitySlug);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/profile", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json() as { error?: string; next?: string };
    if (!response.ok) { setError(data.error || "تعذر حفظ البيانات"); setLoading(false); return; }
    window.location.assign(data.next || "/onboarding");
  };

  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-heading"><span>إكمال الملف مطلوب</span><h1>أكمل بيانات حسابك</h1><p>{initial.academicLevel ? "يمكنك تحديث بياناتك الجامعية من هنا عند الحاجة." : "ينقص حسابك المستوى الدراسي فقط؛ أضفه الآن لتكتمل بياناتك."}</p></div>
    <label className="form-label">الاسم الكامل<div className="input-with-icon"><UserRound size={18} /><input required minLength={5} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></div></label>
    <label className="form-label">رقم الجوال<div className="input-with-icon"><Phone size={18} /><input required pattern="(?:\\+?966|0)?5[0-9]{8}" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} dir="ltr" /></div></label>
    <label className="form-label">الجامعة أو الكلية<div className="input-with-icon"><GraduationCap size={18} /><select required value={form.universitySlug} onChange={(event) => setForm({ ...form, universitySlug: event.target.value, specialty: "" })}><option value="">اختر جامعتك</option>{institutions.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div></label>
    <label className="form-label">التخصص<div className="input-with-icon"><Sparkles size={18} /><select required disabled={!form.universitySlug || catalog.loading} value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })}><option value="">{catalog.loading ? "جارٍ تحميل التخصصات..." : "اختر تخصصك"}</option>{form.specialty && !catalog.programs.some((item) => item.name === form.specialty) && <option value={form.specialty}>{form.specialty}</option>}{catalog.programs.map((item) => <option key={`${item.name}-${item.degree}`} value={item.name}>{item.name} — {item.degree}</option>)}</select></div></label>
    <label className="form-label">المستوى الدراسي<div className="input-with-icon"><GraduationCap size={18} /><select required value={form.academicLevel || ""} onChange={(event) => setForm({ ...form, academicLevel: event.target.value })}><option value="">اختر مستواك الحالي</option>{ACADEMIC_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></div><small className="catalog-status">يمكن تعديل المستوى لاحقًا من الملف الشخصي.</small></label>
    {(error || catalog.error) && <p className="form-error" role="alert">{error || catalog.error}</p>}
    <button className="button button-primary auth-submit" disabled={loading || catalog.loading}>{loading ? "جارٍ الحفظ..." : <>حفظ وبدء الجولة <ArrowLeft size={16} /></>}</button>
  </form>;
}
