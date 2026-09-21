"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Download, FileText, RefreshCw, Send, ShieldCheck, Trash2, Upload } from "lucide-react";
import { AccountMfaPanel } from "./account-mfa-panel";
import { InstructorCamera } from "./instructor-camera";
import { InstructorContracts } from "./instructor-contracts";
import { InstructorAssignments } from "./instructor-assignments";
import { emptyInstructorFields, InstructorProfileFields, type InstructorFields } from "./instructor-profile-fields";
import { isInstructorApplicationEditable } from "@/lib/instructor-policy";
import { authRequest } from "@/lib/auth-request";
import { confirmAction } from "@/lib/interaction-events";
import styles from "./instructor-workspace.module.css";

type Bank = { accountHolder: string; bankName: string; iban: string };
type InstructorDocument = { id: number; kind: string; originalName: string; sizeBytes: number; createdAt: string; expiresAt: string | null };
type ProfileResponse = { user: { id: number; fullName: string; email: string; phone: string }; profile: InstructorFields & { status: string; reviewNotes: string; revision: number; submittedAt: string | null; bank: Bank | null }; documents: InstructorDocument[]; identityCollection: { enabled: boolean; basis: string; retentionDays: number } };
const documentNames: Record<string, string> = { identity_front: "الهوية — الوجه الأمامي", identity_back: "الهوية — الوجه الخلفي", passport: "جواز السفر", selfie: "الصورة الشخصية", cv: "السيرة الذاتية", certificate: "شهادة أو مستند خبرة" };
const statuses: Record<string, { label: string; description: string }> = {
  draft: { label: "مسودة", description: "أكمل ملفك ومستنداتك، ثم أرسل طلب الانضمام للمراجعة." },
  submitted: { label: "طلبك قيد المراجعة", description: "وصل ملفك إلى الإدارة. تابع هذه المساحة لملاحظات المراجعة والخطوة التالية." },
  changes_requested: { label: "مطلوب استكمال", description: "راجع ملاحظات الإدارة، وعدّل المطلوب ثم أعد إرسال الطلب." },
  approved: { label: "تمت الموافقة على الطلب", description: "راجع عقد العمل عندما تقدمه الإدارة. تبدأ المواد المسندة بعد استكمال العقد." },
  rejected: { label: "لم يُقبل الطلب", description: "راجع ملاحظات الإدارة. يمكنك التواصل مع الفريق للاستفسار." },
  suspended: { label: "الملف موقوف", description: "تواصل مع الإدارة لمعرفة المتطلبات قبل متابعة العمل." },
};
function profileFields(profile: InstructorFields): InstructorFields { return Object.fromEntries(Object.keys(emptyInstructorFields).map(key => [key, profile[key as keyof InstructorFields]])) as InstructorFields; }
class InstructorRequestError extends Error { constructor(message:string,readonly status:number){super(message);} }
async function requestJson(url: string, init: RequestInit = {}) {
  const response = await authRequest(url, { credentials: "same-origin", cache: "no-store", ...init });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new InstructorRequestError(result.error || "تعذر إكمال الطلب. حاول مرة أخرى.",response.status);
  return result;
}

export function InstructorWorkspace() {
  const [data, setData] = useState<ProfileResponse | null>(null), [form, setForm] = useState(emptyInstructorFields);
  const [bank, setBank] = useState<Bank>({ accountHolder: "", bankName: "", iban: "" });
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [documentKind, setDocumentKind] = useState("cv"), [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState(0), [tab, setTab] = useState("profile");
  const alive = useRef(true), activeRead = useRef<AbortController | null>(null), mutation = useRef(false);
  const refresh = useCallback(async (replaceFields = true) => {
    activeRead.current?.abort(); const controller = new AbortController(); activeRead.current = controller;
    try {
      const next = await requestJson("/api/instructor/profile", { signal: controller.signal }) as ProfileResponse;
      if (!alive.current || controller.signal.aborted) return;
      setData(next);
      if (replaceFields) { setForm(profileFields(next.profile)); setBank(next.profile.bank || { accountHolder: next.user.fullName, bankName: "", iban: "" }); }
    } catch (reason) { if (!controller.signal.aborted && alive.current) throw reason; }
  }, []);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => void refresh().catch(reason => { if (alive.current) setError(reason instanceof Error ? reason.message : "تعذر تحميل الملف"); }), 0);
    return () => { alive.current = false; clearTimeout(timer); activeRead.current?.abort(); };
  }, [refresh]);
  const editable = data ? isInstructorApplicationEditable(data.profile.status) : false;
  const dirty = Boolean(data && JSON.stringify(form) !== JSON.stringify(profileFields(data.profile)));
  async function run(action: string, operation: () => Promise<void>) {
    if (mutation.current) return;
    mutation.current = true; setBusy(action); setError(""); setNotice("");
    try { await operation(); }
    catch (reason) { if(reason instanceof InstructorRequestError && reason.status===409) await refresh(false).catch(()=>undefined); if (alive.current) setError(reason instanceof Error ? reason.message : "تعذر إكمال العملية"); throw reason; }
    finally { mutation.current = false; if (alive.current) setBusy(""); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data) return;
    await run("save", async () => { await requestJson("/api/instructor/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", expectedRevision: data.profile.revision, ...form }) }); await refresh(); setNotice("تم حفظ بيانات ملفك كمسودة."); }).catch(() => undefined);
  }
  async function submit() {
    if (!data || dirty || busy || !data.identityCollection.enabled) return;
    if (!await confirmAction({ title: "تقديم طلب الانضمام؟", message: "تأكد من صحة بياناتك ووضوح مستنداتك. سيتوقف تعديل الملف أثناء مراجعته من الإدارة." })) return;
    await run("submit", async () => { await requestJson("/api/instructor/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit", expectedRevision: data.profile.revision }) }); await refresh(); setNotice("تم تقديم طلبك بنجاح. يمكنك متابعة حالة المراجعة هنا."); }).catch(() => undefined);
  }
  async function upload(file: File, kind: string) {
    if (!data || !editable) throw new Error("لا يمكن تعديل المستندات في الحالة الحالية");
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("اختر ملفًا حجمه أكبر من صفر ولا يتجاوز 10 ميجابايت");
    const result = new FormData(); result.set("file", file); result.set("kind", kind); result.set("expectedRevision", String(data.profile.revision)); if (kind === "selfie") result.set("captureSource", "camera");
    await run("upload", async () => { await requestJson("/api/instructor/documents", { method: "POST", body: result }); await refresh(false); setSelectedFile(null); setUploadKey(key => key + 1); setNotice("تم رفع المستند. تُراجع المستندات وتُفحص قبل قبول الطلب."); });
  }
  async function remove(document: InstructorDocument) {
    if (!data || !await confirmAction({ title: "حذف المستند؟", message: `سيُحذف ${documentNames[document.kind] || "المستند"} من ملف طلبك.`, destructive: true })) return;
    await run("delete", async () => { await requestJson(`/api/instructor/documents/${document.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: data.profile.revision }) }); await refresh(false); setNotice("تم حذف المستند."); }).catch(() => undefined);
  }
  async function saveBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data) return;
    await run("bank", async () => { await requestJson("/api/instructor/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "bank", expectedRevision: data.profile.revision, bank }) }); await refresh(false); setNotice("تم حفظ الحساب البنكي."); }).catch(() => undefined);
  }
  const status = statuses[data?.profile.status || "draft"] || statuses.draft;
  return <div className={styles.workspace}>
    <div className={styles.pageHeading}><span className={styles.eyebrow}>مساحة الشارح</span><h1>{data ? `أهلًا ${data.user.fullName}` : "ملفك في فريق مراس"}</h1><p>طلبك ومستنداتك وخطوات العمل، في مساحة تخصّك.</p></div>
    <div className={styles.feedback} aria-live="polite">{error && <div className={styles.error} role="alert">{error}<button type="button" disabled={Boolean(busy)} onClick={() => { setError(""); void refresh(false).catch(reason => setError(reason instanceof Error ? reason.message : "تعذر التحديث")); }}><RefreshCw size={15} />تحديث حالة الملف</button></div>}{notice && <p className={styles.success} role="status"><CheckCircle2 size={18} />{notice}</p>}</div>
    {!data ? <p role="status">{error ? "تعذر تحميل الملف. حاول تحديثه أو تواصل مع الدعم." : "جارٍ تحميل ملفك…"}</p> : <>
      <section className={styles.statusCard}><span><Clock3 size={25} /></span><div><strong>{status.label}</strong><p>{status.description}</p>{data.profile.reviewNotes && <p className={styles.reviewNotes}><b>ملاحظات الإدارة: </b>{data.profile.reviewNotes}</p>}</div><small>نسخة الملف {data.profile.revision}</small></section>
      <nav className={styles.tabs} aria-label="أقسام حساب الشارح">{[["profile", "بياناتي وخبرتي"], ["documents", "مستنداتي"], ["work", "العقد والمواد"], ["bank", "الحساب البنكي"], ["security", "أمان الحساب"]].map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>
      {tab === "profile" && <form className={styles.panel} onSubmit={save}><h2>بيانات الملف</h2><div className={styles.accountFacts}><span>{data.user.email}</span><span dir="ltr">{data.user.phone}</span></div><fieldset className={styles.fieldset} disabled={!editable || Boolean(busy)}><InstructorProfileFields value={form} onChange={setForm} />{editable && <div className={styles.actions}><button type="submit" className="button button-primary">{busy === "save" ? "جارٍ الحفظ…" : "حفظ بيانات الملف"}</button><span className={styles.hint}>{dirty ? "لديك تغييرات لم تُحفظ" : "البيانات محفوظة"}</span></div>}</fieldset>{!editable && <p className={styles.hint}>البيانات معروضة للقراءة بحسب حالة طلبك. تظهر ملاحظات الإدارة أعلى الصفحة عند طلب استكمال.</p>}</form>}
      {tab === "documents" && <section className={styles.panel}><h2>المستندات الداعمة والتحقق</h2><p>ملفات PDF أو صور PNG وJPEG واضحة، بحد أقصى 10 ميجابايت للملف و12 مستندًا للطلب.</p>
        <aside className={styles.privacyNotice}><ShieldCheck size={23} /><div><h3>خصوصية مستنداتك</h3>{data.identityCollection.enabled ? <><p>{data.identityCollection.basis}</p><p>مدة الاحتفاظ بوثائق التحقق: {data.identityCollection.retentionDays} يومًا. تُعرض تواريخ انتهاء المستندات أدناه.</p></> : <p>استقبال وثائق الهوية قيد التجهيز لدى الإدارة. يمكنك حفظ المسودة وإضافة سيرتك الذاتية والشهادات الآن، وتقديم الطلب بعد إتاحة التحقق.</p>}<Link href="/privacy" target="_blank" rel="noopener noreferrer">اقرأ سياسة الخصوصية</Link></div></aside>
        {editable && <><div className={styles.documentUpload}><label>نوع المستند<select disabled={Boolean(busy)} value={documentKind} onChange={e => { setDocumentKind(e.target.value); setSelectedFile(null); setUploadKey(key => key + 1); }}>{Object.entries(documentNames).filter(([kind]) => kind !== "selfie" && (data.identityCollection.enabled || !["identity_front", "identity_back", "passport"].includes(kind))).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><label>اختر الملف<input key={uploadKey} type="file" accept="application/pdf,image/png,image/jpeg" disabled={Boolean(busy)} onChange={e => setSelectedFile(e.target.files?.[0] || null)} /></label><button type="button" className="button button-soft" disabled={!selectedFile || Boolean(busy)} onClick={() => { if (selectedFile) void upload(selectedFile, documentKind).catch(reason => setError(reason instanceof Error ? reason.message : "تعذر الرفع")); }}><Upload size={17} />{busy === "upload" ? "جارٍ الرفع…" : "رفع المستند"}</button></div><p className={styles.hint}>للوثائق ذات الوجه الواحد أو الصورة الشخصية: احذف النسخة السابقة قبل إرفاق بديل. يمكنك إضافة عدة شهادات.</p>{data.identityCollection.enabled && <InstructorCamera disabled={Boolean(busy)} onUpload={file => upload(file, "selfie")} />}</>}
        <div className={styles.documentList}>{data.documents.length ? data.documents.map(document => <article key={document.id}><FileText size={23} /><div><strong>{documentNames[document.kind] || document.kind}</strong><span>{document.originalName} · {(document.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>{document.expiresAt && <small>انتهاء الاحتفاظ: {new Date(document.expiresAt).toLocaleDateString("ar-SA")}</small>}</div><a className="button button-ghost" href={`/api/instructor/documents/${document.id}`}><Download size={17} />تنزيل</a>{editable && <button className="button button-ghost" type="button" disabled={Boolean(busy)} onClick={() => void remove(document)} aria-label={`حذف ${documentNames[document.kind] || "المستند"}`}><Trash2 size={17} /></button>}</article>) : <p className={styles.empty}>لم تُضف مستندات بعد.</p>}</div>
      </section>}
      {tab === "work" && <><InstructorContracts /><InstructorAssignments ownerId={data.user.id} /></>}
      {tab === "bank" && <form className={styles.panel} onSubmit={saveBank}><h2>حسابك البنكي</h2><p>أدخل الحساب الذي يخصك كما يظهر في بيانات البنك. يُستخدم لاستكمال إجراءات المستحقات وفق العقد.</p><fieldset className={styles.fieldset} disabled={Boolean(busy) || data.profile.status !== "approved"}><div className={styles.fields}><label>اسم صاحب الحساب<input required minLength={5} maxLength={160} autoComplete="name" value={bank.accountHolder} onChange={e => setBank({ ...bank, accountHolder: e.target.value })} /></label><label>اسم البنك<input required minLength={2} maxLength={160} value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value })} /></label><label className={styles.fullWidth}>رقم الآيبان IBAN<input required dir="ltr" minLength={15} maxLength={50} placeholder="SA…" autoComplete="off" value={bank.iban} onChange={e => setBank({ ...bank, iban: e.target.value.toUpperCase() })} /></label></div><button type="submit" className="button button-primary">{busy === "bank" ? "جارٍ الحفظ…" : "حفظ الحساب البنكي"}</button></fieldset>{data.profile.status !== "approved" && <p className={styles.hint}>تُتاح إضافة الحساب البنكي بعد موافقة الإدارة على طلبك.</p>}</form>}
      {tab === "security" && <><section className={styles.panel}><h2>حماية حساب الشارح</h2><p>حسابك مستقل، ويُسمح بجهازين معتمدين. فعّل المصادقة متعددة العوامل، واحفظ رموز الاستعادة في مكان خاص. لا تشارك رموز الدخول أو الملفات المحمية.</p><Link href="/support">تواصل مع الدعم بشأن الأجهزة أو حسابك</Link></section><AccountMfaPanel /></>}
      {editable && <section className={styles.submitCard}><div><h2>هل ملفك جاهز للمراجعة؟</h2><p>احفظ بياناتك وأرفق الصورة الشخصية وجواز السفر أو وجهي الهوية. ستراجع الإدارة الملفات قبل قبول الطلب.</p>{dirty && <p className={styles.hint}>احفظ التعديلات من «بياناتي وخبرتي» قبل تقديم الطلب.</p>}{!data.identityCollection.enabled && <p className={styles.hint}>التقديم متوقف مؤقتًا حتى تُكمل الإدارة إعداد استقبال مستندات التحقق. مسودتك محفوظة.</p>}</div><button type="button" className="button button-primary" disabled={Boolean(busy) || dirty || !data.identityCollection.enabled} onClick={() => void submit()}><Send size={17} />{busy === "submit" ? "جارٍ التقديم…" : "تقديم طلب الانضمام"}</button></section>}
    </>}
  </div>;
}
