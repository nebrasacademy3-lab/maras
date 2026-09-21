"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Download, FileVideo, Plus, RefreshCw, Save, Send, Trash2, Upload } from "lucide-react";
import { authRequest } from "@/lib/auth-request";
import { confirmAction } from "@/lib/interaction-events";
import { isInstructorAssignmentEditable } from "@/lib/instructor-policy";
import { uploadInstructorVideo } from "@/lib/instructor-video-client";
import { uploadProgressLabel, UploadError, type UploadProgress } from "@/lib/upload-client";
import styles from "./instructor-workspace.module.css";

export type Assignment = { id: number; courseSlug: string; courseTitle: string; status: string; instructions: string; reviewNotes: string; revision: number; contractId: number };
type Lesson = { id: number; title: string; description: string; position: number; video: { id: number; status: string; processingStatus: string; processingProgress: number; durationSeconds: number } | null };
type Unit = { id: number; title: string; description: string; position: number; lessons: Lesson[] };
export type Details = { assignment: Assignment; units: Unit[]; resources: { id: number; title: string; originalName: string; sizeBytes: number; url: string }[] };
const statusNames: Record<string, string> = { assigned: "مادة جديدة", in_progress: "قيد الإعداد", submitted: "قيد مراجعة الإدارة", changes_requested: "تحتاج تعديلات", published: "نُشر الشرح", cancelled: "إسناد ملغى" };
class InstructorAssignmentRequestError extends Error { constructor(message:string,readonly status:number){super(message);} }
async function json(url: string, init: RequestInit = {}) { const response = await authRequest(url, { cache: "no-store", credentials: "same-origin", ...init }); const value = await response.json().catch(() => ({})); if (!response.ok) throw new InstructorAssignmentRequestError(value.error || "تعذر إكمال الطلب",response.status); return value; }

export function InstructorAssignments({ ownerId }: { ownerId: number }) {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null), [details, setDetails] = useState<Details | null>(null);
  const [error,setError] = useState(""), [notice,setNotice] = useState(""), [busy,setBusy] = useState(false), [uploading,setUploading] = useState<number | null>(null);
  const [progress,setProgress] = useState<UploadProgress | null>(null), [phase,setPhase] = useState("");
  const [editor,setEditor] = useState<{ kind: "unit" | "lesson"; id?: number; unitId?: number; title: string; description: string; position: number } | null>(null);
  const mounted = useRef(true), read = useRef<AbortController | null>(null), upload = useRef<AbortController | null>(null), locked = useRef(false);
  const refresh = useCallback(async (id?: number) => {
    read.current?.abort(); const controller = new AbortController(); read.current = controller;
    if (id) { const value = await json(`/api/instructor/assignments/${id}`, { signal: controller.signal }) as Details; if (mounted.current && !controller.signal.aborted) setDetails(value); }
    else { const value = await json("/api/instructor/assignments", { signal: controller.signal }); if (mounted.current && !controller.signal.aborted) setAssignments(value.assignments || []); }
  }, []);
  useEffect(() => { mounted.current = true; const timer = setTimeout(() => void refresh().catch(reason => { if (mounted.current && reason.name !== "AbortError") setError(reason.message); }),0); return () => { mounted.current = false; clearTimeout(timer); read.current?.abort(); upload.current?.abort(); }; }, [refresh]);
  const editable = Boolean(details && isInstructorAssignmentEditable(details.assignment.status));
  async function mutate(body: Record<string, unknown>) {
    if (!details || locked.current) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try { await json(`/api/instructor/assignments/${details.assignment.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, expectedRevision: details.assignment.revision }) }); setEditor(null); await refresh(details.assignment.id); setNotice("تم حفظ التحديث."); }
    catch (reason) { if(reason instanceof InstructorAssignmentRequestError&&reason.status===409)await refresh(details.assignment.id).catch(()=>undefined);setError(reason instanceof Error ? reason.message : "تعذر الحفظ"); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editor) return; await mutate({ action: editor.kind === "unit" ? "saveUnit" : "saveLesson", id: editor.id, unitId: editor.unitId, title: editor.title, description: editor.description, position: editor.position }); }
  async function remove(kind: "unit" | "lesson", id: number) { if (!await confirmAction({ title: kind === "unit" ? "حذف الوحدة؟" : "حذف الدرس؟", message: kind === "unit" ? "ستُحذف الوحدة ودروسها من مسودة المادة. تأكد قبل المتابعة." : "سيُحذف الدرس من مسودة الشرح.", destructive: true })) return; await mutate({ action: kind === "unit" ? "deleteUnit" : "deleteLesson", id }); }
  async function send() { if (!await confirmAction({ title: "إرسال المادة للمراجعة؟", message: "أكد اكتمال الوحدات والدروس والفيديوهات. لن تكون المسودة قابلة للتعديل أثناء مراجعة الإدارة." })) return; await mutate({ action: "submit" }); }
  async function sendVideo(lesson: Lesson, file: File) {
    if (!details || locked.current) return; locked.current = true;
    const controller = new AbortController(); upload.current = controller;
    setUploading(lesson.id); setProgress(null); setError(""); setNotice("");
    try { await uploadInstructorVideo({ file, ownerId, assignmentId: details.assignment.id, lessonId: lesson.id, expectedRevision: details.assignment.revision, signal: controller.signal, onProgress: value => { if (mounted.current) setProgress(value); }, onPhase: value => { if (mounted.current) setPhase(value); } }); await refresh(details.assignment.id); setNotice("اكتمل رفع الفيديو. تابع حالة معالجته قبل إرسال المادة."); }
    catch (reason) { if(reason instanceof UploadError&&reason.status===409)await refresh(details.assignment.id).catch(()=>undefined);if (mounted.current) setError(controller.signal.aborted ? "توقف الرفع مؤقتًا. اختر الملف نفسه لاحقًا لاستكمال الأجزاء المحفوظة." : reason instanceof Error ? reason.message : "تعذر رفع الفيديو"); }
    finally { locked.current = false; upload.current = null; if (mounted.current) { setUploading(null); setProgress(null); setPhase(""); } }
  }
  const disabled = busy || uploading !== null;
  return <section className={styles.panel}>
    <div className={styles.sectionTitle}><span><BookOpen size={24} /></span><div><h2>المواد المسندة إليك</h2><p>جهّز الشرح في مسودة خاصة، ثم أرسله للإدارة لاعتماده ونشره.</p></div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
    <div className={styles.actions}>{details && <button type="button" disabled={disabled} className="button button-ghost" onClick={() => { setDetails(null); setEditor(null); void refresh().catch(reason => setError(reason.message)); }}><ArrowRight size={16} />كل المواد</button>}<button type="button" disabled={disabled} className="button button-ghost" onClick={() => void refresh(details?.assignment.id).catch(reason => setError(reason.message))}><RefreshCw size={16} />تحديث الحالة</button></div>
    {!details && <div className={styles.assignmentGrid}>{assignments === null ? <p role="status">جارٍ تحميل المواد…</p> : assignments.length === 0 ? <p className={styles.empty}>لا توجد مواد مسندة إليك حتى الآن. بعد اعتماد العقد، تُرسل الإدارة المادة وملفاتها إلى هذه المساحة.</p> : assignments.map(item => <article key={item.id}><small>{statusNames[item.status] || item.status}</small><h3>{item.courseTitle || item.courseSlug}</h3><p>{item.instructions || "راجع تفاصيل المادة والملفات قبل تجهيز الدروس."}</p><button type="button" className="button button-soft" onClick={() => { setError(""); void refresh(item.id).catch(reason => setError(reason.message)); }}>فتح المادة</button></article>)}</div>}
    {details && <>
      <div className={styles.assignmentHeading}><span className={styles.eyebrow}>{statusNames[details.assignment.status] || details.assignment.status}</span><h3>{details.assignment.courseTitle || details.assignment.courseSlug}</h3><p>{details.assignment.instructions}</p>{details.assignment.reviewNotes && <p className={styles.reviewNotes}><b>ملاحظات المراجعة:</b> {details.assignment.reviewNotes}</p>}</div>
      <h3>ملفات المادة من الإدارة</h3><div className={styles.resourceList}>{details.resources.length ? details.resources.map(resource => <a href={`/api/instructor/assignments/${details.assignment.id}/resources/${resource.id}`} key={resource.id}><Download size={18} /><span>{resource.title || resource.originalName}<small>{(resource.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></span></a>) : <p className={styles.hint}>لا توجد ملفات مرفقة بهذه المادة حاليًا.</p>}</div>
      {editable && <div className={styles.actions}><button type="button" className="button button-soft" disabled={disabled} onClick={() => setEditor({ kind: "unit", title: "", description: "", position: details.units.length })}><Plus size={17} />إضافة وحدة</button></div>}
      {editor && <form className={styles.contentEditor} onSubmit={save}><h3>{editor.id ? "تعديل" : "إضافة"} {editor.kind === "unit" ? "وحدة" : "درس"}</h3><fieldset className={styles.fieldset} disabled={disabled||!editable}><div className={styles.fields}><label>العنوان<input required minLength={2} maxLength={200} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} /></label><label>الترتيب<input type="number" required min={0} max={9999} value={editor.position} onChange={e => setEditor({ ...editor, position: Number(e.target.value) })} /></label><label className={styles.fullWidth}>الوصف<textarea maxLength={4000} rows={3} value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} /></label></div><div className={styles.actions}><button className="button button-primary" type="submit"><Save size={17} />حفظ</button><button className="button button-ghost" type="button" onClick={() => setEditor(null)}>إلغاء التعديل</button></div></fieldset></form>}
      <div className={styles.units}>{details.units.map(unit => <section key={unit.id} className={styles.unit}><header><div><span className={styles.eyebrow}>الوحدة {unit.position + 1}</span><h3>{unit.title}</h3><p>{unit.description}</p></div>{editable && <div className={styles.actions}><button type="button" disabled={disabled} className="button button-ghost" onClick={() => setEditor({ kind: "unit", id: unit.id, title: unit.title, description: unit.description, position: unit.position })}>تعديل</button><button type="button" disabled={disabled} className="button button-ghost" aria-label={`حذف وحدة ${unit.title}`} onClick={() => void remove("unit",unit.id)}><Trash2 size={16} /></button></div>}</header>
        {unit.lessons.map(lesson => <article key={lesson.id} className={styles.lesson}><div className={styles.lessonHeading}><FileVideo size={21} /><div><h4>{lesson.title}</h4><p>{lesson.description}</p><small>{lesson.video ? `حالة الفيديو: ${lesson.video.processingStatus === "ready" ? "جاهز" : lesson.video.processingStatus === "failed" ? "تعذرت المعالجة" : "قيد المعالجة"}` : "لم يُرفع فيديو بعد"}</small></div></div>
          {lesson.video && <details className={styles.videoPreview}><summary>معاينة فيديو الدرس</summary><video controls preload="none" controlsList="nodownload" src={`/api/instructor/assignments/${details.assignment.id}/videos/${lesson.id}`} aria-label={`معاينة ${lesson.title}`} /></details>}
          {editable && <div className={styles.actions}><label className={styles.videoUpload}><Upload size={16} /><span>{lesson.video ? "استبدال الفيديو" : "رفع فيديو"}</span><input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo" disabled={disabled} aria-label={`رفع فيديو درس ${lesson.title}`} onChange={e => { const file = e.target.files?.[0]; if (file) void sendVideo(lesson,file); e.target.value = ""; }} /></label><button type="button" disabled={disabled} className="button button-ghost" onClick={() => setEditor({ kind: "lesson", id: lesson.id, unitId: unit.id, title: lesson.title, description: lesson.description, position: lesson.position })}>تعديل الدرس</button><button type="button" disabled={disabled} className="button button-ghost" aria-label={`حذف درس ${lesson.title}`} onClick={() => void remove("lesson",lesson.id)}><Trash2 size={16} /></button></div>}
          {uploading === lesson.id && <div className={styles.uploadProgress} role="status"><p>{phase}</p>{progress && <><progress value={progress.percent} max={100} /><p dir="ltr">{uploadProgressLabel(progress)}</p></>}<button type="button" className="button button-ghost" onClick={() => upload.current?.abort()}>إيقاف مؤقت</button></div>}
        </article>)}
        {editable && <button type="button" disabled={disabled} className="button button-soft" onClick={() => setEditor({ kind: "lesson", unitId: unit.id, title: "", description: "", position: unit.lessons.length })}><Plus size={17} />إضافة درس</button>}
      </section>)}</div>
      {details.units.length === 0 && <p className={styles.empty}>ابدأ بإضافة الوحدة الأولى، ثم أضف دروسها وفيديوهاتها.</p>}
      {editable && <section className={styles.submitCard}><div><h3>اكتمل الشرح؟</h3><p>تأكد من رفع كل الدروس واكتمال معالجة الفيديوهات. إرسال المادة لا ينشرها مباشرة؛ تعتمدها الإدارة أولًا.</p><small className={styles.hint}>رفع الفيديو يدعم الاستكمال. عند الانقطاع اختر الملف نفسه، بحد أقصى 200 ميجابايت.</small></div><button type="button" disabled={disabled || Boolean(editor) || details.units.length === 0} className="button button-primary" onClick={() => void send()}><Send size={17} />إرسال المادة للمراجعة</button></section>}
    </>}
  </section>;
}
