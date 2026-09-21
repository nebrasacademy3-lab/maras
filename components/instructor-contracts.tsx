"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import Image from "next/image";
import { CheckCircle2, Download, FileSignature, RefreshCw, RotateCcw, X } from "lucide-react";
import { validateInstructorSignature, type SignaturePoint } from "@/lib/instructor-policy";
import { authRequest } from "@/lib/auth-request";
import styles from "./instructor-workspace.module.css";

export type Contract = {
  id: number; version: number; status: string; title: string; termsAr: string; termsEn: string; compensationModel: string; rateHalalas: number; trialDays: number; trialTermsAr: string; trialTermsEn: string; contentHash: string; revision: number; signedAt: string | null; signature: SignaturePoint[][] | null;
  organization: Record<string, string>; instructor: { fullName: string; email: string; phone: string; country: string; address: string };
  employment: { startDate: string; endDate: string; workLocation: string; weeklyHours: number; nationality: string; paymentTermsAr: string; paymentTermsEn: string; benefitsAr: string; benefitsEn: string };
};
const statusNames: Record<string, string> = { offered: "بانتظار قراءتك وتوقيعك", signed: "عقد موقّع", withdrawn: "عُرض ثم سُحب", terminated: "عقد منتهي" };

export function InstructorContracts() {
  const [contracts, setContracts] = useState<Contract[] | null>(null), [selected, setSelected] = useState<Contract | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [hasSignature, setHasSignature] = useState(false);
  const [accepted, setAccepted] = useState(false), [password, setPassword] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), strokes = useRef<SignaturePoint[][]>([]), pointer = useRef<number | null>(null), active = useRef(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await authRequest("/api/instructor/contracts", { cache: "no-store", signal });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "تعذر تحميل العقود");
    if (active.current && !signal?.aborted) setContracts(result.contracts || []);
  }, []);
  useEffect(() => { active.current = true; const controller = new AbortController(); void refresh(controller.signal).catch(reason => { if (!controller.signal.aborted && active.current) setError(reason instanceof Error ? reason.message : "تعذر تحميل العقود"); }); return () => { active.current = false; controller.abort(); }; }, [refresh]);
  useEffect(() => { if (selected && !dialog.current?.open) dialog.current?.showModal(); else if (!selected) dialog.current?.close(); }, [selected]);
  function reset() { strokes.current = []; pointer.current = null; canvas.current?.getContext("2d")?.clearRect(0, 0, 720, 240); setHasSignature(false); }
  function open(contract: Contract) { setAccepted(false); setPassword(""); setError(""); setNotice(""); reset(); setSelected(contract); }
  function point(event: PointerEvent<HTMLCanvasElement>): SignaturePoint { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; }
  function begin(event: PointerEvent<HTMLCanvasElement>) {
    if (busy || pointer.current !== null || event.button !== 0) return;
    event.preventDefault(); if (strokes.current.length >= 40) { setError("بلغت الحد الأقصى لخطوط التوقيع. امسح التوقيع وأعد المحاولة."); return; }
    pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); strokes.current.push([point(event)]);
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId || busy) return;
    event.preventDefault(); const stroke = strokes.current.at(-1); if (!stroke || stroke.length >= 1500 || strokes.current.reduce((sum,row) => sum + row.length, 0) >= 5000) return;
    const next = point(event), previous = stroke.at(-1)!; stroke.push(next);
    const context = event.currentTarget.getContext("2d"); if (!context) return;
    context.strokeStyle = "#142b59"; context.lineWidth = 2.6; context.lineCap = "round"; context.lineJoin = "round"; context.beginPath(); context.moveTo(previous.x * 720, previous.y * 240); context.lineTo(next.x * 720, next.y * 240); context.stroke();
  }
  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return; pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    strokes.current = strokes.current.filter(stroke => stroke.length >= 2); setHasSignature(validateInstructorSignature(strokes.current));
  }
  async function sign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy || !accepted) return;
    if (!validateInstructorSignature(strokes.current)) { setError("أضف توقيعًا واضحًا داخل المساحة. النقرة وحدها لا تكفي."); return; }
    setBusy(true); setError("");
    try {
      const response = await authRequest(`/api/instructor/contracts/${selected.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accepted: true, expectedRevision: selected.revision, contentHash: selected.contentHash, signature: strokes.current, password }) });
      const result = await response.json().catch(() => ({})); if (response.status===409) { setSelected(null);reset();await refresh().catch(()=>undefined); } if (!response.ok) throw new Error(result.error || "تعذر توثيق التوقيع");
      setPassword(""); setSelected(null); reset(); await refresh(); setNotice("تم توقيع نسخة العقد. يمكنك تنزيل النسخة الموثقة من حسابك.");
    } catch (reason) { setPassword(""); setError(reason instanceof Error ? reason.message : "تعذر توقيع العقد"); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <div className={styles.sectionTitle}><span><FileSignature size={24} /></span><div><h2>عقود العمل</h2><p>راجع النسخة كاملة قبل قبولها. تبقى العقود السابقة محفوظة بحسب حالتها.</p></div></div>
    {error && !selected && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.success}><CheckCircle2 size={18} />{notice}</p>}
    <button type="button" className="button button-ghost" disabled={busy} onClick={() => void refresh().catch(reason => setError(reason instanceof Error ? reason.message : "تعذر التحديث"))}><RefreshCw size={16} />تحديث العقود</button>
    {contracts === null && <p role="status">جارٍ تحميل العقود…</p>}{contracts?.length === 0 && <p className={styles.empty}>لا يوجد عقد معروض حتى الآن. سيظهر عرض العمل هنا بعد مراجعة الإدارة واعتمادها لملفك.</p>}
    {contracts?.map(contract => <details className={styles.contract} key={contract.id} open={contract.status === "offered"}>
      <summary><div><strong>{contract.title}</strong><small>الإصدار {contract.version} · {statusNames[contract.status] || contract.status}</small></div></summary>
      <div className={styles.contractBody}>
        <header className={styles.contractBrand}><Image src="/brand/mark-official.png" alt="شعار مراس العلم" width={58} height={58} /><div><strong>{contract.organization.legal_name || "مراس العلم"}</strong><span>عقد عمل · Employment agreement</span></div></header>
        <dl className={styles.contractFacts}><dt>الشارح</dt><dd>{contract.instructor.fullName}</dd><dt>الأجر المتفق عليه</dt><dd>{(contract.rateHalalas / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س / {contract.compensationModel === "hourly" ? "ساعة شرح معتمدة" : "مادة مكتملة"}</dd><dt>تاريخ المباشرة</dt><dd>{contract.employment.startDate}</dd><dt>انتهاء المدة</dt><dd>{contract.employment.endDate || "وفق بنود العقد"}</dd><dt>مكان العمل</dt><dd>{contract.employment.workLocation}</dd><dt>الساعات الأسبوعية</dt><dd>{contract.employment.weeklyHours}</dd><dt>الفترة التجريبية</dt><dd>{contract.trialDays} يومًا</dd></dl>
        <div className={styles.bilingual}><section dir="rtl" lang="ar"><h3>بنود العقد</h3><p>{contract.termsAr}</p><h3>التجربة والتقييم</h3><p>{contract.trialTermsAr}</p><h3>آلية ومواعيد الأجر</h3><p>{contract.employment.paymentTermsAr}</p><h3>المزايا</h3><p>{contract.employment.benefitsAr}</p></section><section dir="ltr" lang="en"><h3>Agreement terms</h3><p>{contract.termsEn}</p><h3>Probation and assessment</h3><p>{contract.trialTermsEn}</p><h3>Payment terms</h3><p>{contract.employment.paymentTermsEn}</p><h3>Benefits</h3><p>{contract.employment.benefitsEn}</p></section></div>
        {contract.signature && <div className={styles.signedBlock}><strong>توقيع الشارح · Instructor signature</strong><svg viewBox="0 0 720 240" role="img" aria-label={`توقيع ${contract.instructor.fullName}`}><title>توقيع الشارح المحفوظ</title>{contract.signature.map((stroke,index) => <polyline key={index} points={stroke.map(p => `${p.x * 720},${p.y * 240}`).join(" ")} fill="none" stroke="#142b59" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />)}</svg>{contract.signedAt && <small>وُقّع في {new Date(contract.signedAt).toLocaleString("ar-SA")}</small>}</div>}
        <footer className={styles.contractLegal}>{contract.organization.commercial_registration_number && <span>السجل التجاري: {contract.organization.commercial_registration_number}</span>}{contract.organization.vat_number && <span>الرقم الضريبي: {contract.organization.vat_number}</span>}<span>{contract.organization.legal_address}</span></footer>
        <div className={styles.actions}><a href={`/api/instructor/contracts/${contract.id}/download`} className="button button-ghost"><Download size={17} />تنزيل العقد PDF</a>{contract.status === "offered" && <button type="button" className="button button-primary" onClick={() => open(contract)}><FileSignature size={17} />الموافقة والتوقيع</button>}</div>
      </div>
    </details>)}
    <dialog ref={dialog} className={styles.signatureDialog} onCancel={event => { if (busy) event.preventDefault(); else { setSelected(null); setPassword(""); reset(); } }} aria-labelledby="contract-sign-title">
      {selected && <form onSubmit={sign}><header><div><h2 id="contract-sign-title">توقيع عقد العمل</h2><p>{selected.title} · الإصدار {selected.version}</p></div><button type="button" className="button button-ghost" aria-label="إغلاق التوقيع" disabled={busy} onClick={() => { setSelected(null); setPassword(""); reset(); }}><X size={20} /></button></header>
        <p>ارسم توقيعك داخل المساحة بالماوس أو بإصبعك، ثم أكّد قبول النسخة المعروضة باستخدام كلمة مرور حسابك.</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <canvas ref={canvas} width={720} height={240} className={styles.signatureCanvas} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} aria-label="مساحة رسم توقيعك بالماوس أو اللمس" />
        <button type="button" disabled={busy} className="button button-ghost" onClick={reset}><RotateCcw size={16} />مسح وإعادة التوقيع</button>
        <label className={styles.check}><input type="checkbox" required checked={accepted} disabled={busy} onChange={e => setAccepted(e.target.checked)} /><span>قرأت جميع بنود الإصدار {selected.version} المعروض بالعربية والإنجليزية وأوافق عليها وعلى توثيق توقيعي على هذه النسخة.</span></label>
        <div className={styles.fields}><label className={styles.fullWidth}>كلمة مرور حسابك<input required type="password" autoComplete="current-password" maxLength={128} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label></div>
        <button type="submit" className="button button-primary" disabled={busy || !accepted || !hasSignature || !password}>{busy ? "جارٍ توثيق التوقيع…" : "أوافق وأوقّع هذا العقد"}</button>
      </form>}
    </dialog>
  </section>;
}
