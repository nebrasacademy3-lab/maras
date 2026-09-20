"use client";
import { uploadStudyFile } from "@/lib/study-upload-web";
import { SUMMARY_LANGUAGES, SUMMARY_DETAILS } from "@/lib/study-summary-policy";
import { StudyArtifactDownload } from "./study-artifact-download";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenCheck, BrainCircuit, FileUp, Languages, LoaderCircle, MessageCircle, Sparkles } from "lucide-react";
import type { AiArtifactPayload, AiFilePayload, AiQuizPayload } from "@/lib/ai-contracts";
import { observeStudyJob, requestStudyAction, studyJson, StudyRequestError } from "@/lib/ai-job-client";
import { AiQuizRunner } from "./ai-quiz-runner";
import styles from "./study-tools.module.css";

export type StudyAction = "summary" | "translation" | "quiz";
export type StudyResource = { id: number; title: string; originalName: string; lessonId: string | null; contentType: string; sizeBytes: number };
export type StudyActionResult = { artifact?: AiArtifactPayload; quiz?: AiQuizPayload; cached?: boolean };
function rememberedJob(key: string, value?: string | null) {
  try { if (value === null) sessionStorage.removeItem(key); else if (value !== undefined) sessionStorage.setItem(key, value); else return sessionStorage.getItem(key); } catch { /* Browser storage can be disabled; the current request remains usable. */ }
  return null;
}
const names = { summary: "تلخيص الملف", translation: "ترجمة الملف", quiz: "اختبار من الملف" };
export function StudyToolCards({ onSelect, includeChat = false }: { onSelect: (action: StudyAction | "chat") => void; includeChat?: boolean }) {
  const cards = [
    { key: "summary" as const, icon: BookOpenCheck, title: "ملخص منظم", text: "الأفكار الأساسية والمصطلحات في ملف PDF يحمل هوية مراس." },
    { key: "translation" as const, icon: Languages, title: "ترجمة أكاديمية", text: "ترجمة النص والمصطلحات، مع ملف جاهز للحفظ والمراجعة." },
    { key: "quiz" as const, icon: BrainCircuit, title: "اختبر فهمك", text: "سؤال في كل بطاقة، نتيجة فورية وشرح، وإعادة دون توليد جديد." },
    ...(includeChat ? [{ key: "chat" as const, icon: MessageCircle, title: "اسأل مراس", text: "محادثة دراسية وسجل محفوظ لأسئلتك ونتائج أدواتك." }] : []),
  ];
  return <div className={styles.toolCards}>{cards.map(card => <button key={card.key} type="button" className={styles.toolCard} onClick={() => onSelect(card.key)}><span className={styles.toolIcon}><card.icon size={27}/></span><h3>{card.title}</h3><p>{card.text}</p><span className={styles.cardCta}>فتح الأداة ←</span></button>)}</div>;
}

export function StudyFileTools({ action, resources, storageScope = "workspace", onBack }: { action: StudyAction; resources?: StudyResource[]; storageScope?: string; onBack?: () => void }) {
  const [file, setFile] = useState<AiFilePayload | null>(null);
  const [resourceId, setResourceId] = useState(resources?.[0]?.id || 0);
  const [language, setLanguage] = useState("العربية");
  const [summaryDetail, setSummaryDetail] = useState("balanced");
  const [questionCount, setQuestionCount] = useState(10);
  const [result, setResult] = useState<StudyActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const storageKey = `meras:study-job:${storageScope}:${action}`;
  const resume = useCallback(async (id: string, signal: AbortSignal) => {
    setBusy(true); setPhase("queued"); setError(""); setPendingId(id);
    try {
      const value = await observeStudyJob<StudyActionResult>({ id, status: "queued" }, { signal, onStatus: setPhase });
      setResult(value); rememberedJob(storageKey, null); setPendingId(null);
    } catch (reason) { if (reason instanceof StudyRequestError && reason.terminal) { rememberedJob(storageKey, null); setPendingId(null); } if (!signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر استعادة الطلب"); }
    finally { if (!signal.aborted) setBusy(false); }
  }, [storageKey]);
  useEffect(() => {
    const observer = new AbortController();
    controller.current = observer;
    const timer = setTimeout(() => { const pending = rememberedJob(storageKey); if (pending && /^[a-f0-9-]{36}$/.test(pending)) void resume(pending, observer.signal); }, 0);
    return () => { clearTimeout(timer); controller.current?.abort(); observer.abort(); };
  }, [resume, storageKey]);

  async function upload(selected?: File) {
    if (!selected || busy) return;
    setBusy(true); setPhase("upload"); setError(""); setResult(null);
    const abort = new AbortController(); controller.current = abort;
    try {
      const uploaded = await uploadStudyFile(selected, abort.signal, value => setPhase(value.phase === "hashing" ? "فحص بصمة الملف…" : value.phase === "finalizing" ? "اعتماد الملف وفحصه الأمني…" : `رفع الأجزاء: ${value.percent}%`));
      if (!abort.signal.aborted) setFile(uploaded);
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر رفع الملف"); }
    finally { if (!abort.signal.aborted) setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function run() {
    if (busy) return;
    setBusy(true); setError(""); setResult(null); setPhase("queued");
    const abort = new AbortController(); controller.current = abort;
    try {
      let source = file;
      if (resources) {
        const response = await studyJson<{ file: AiFilePayload }>(`/api/course-resources/${resourceId}/study`, { method: "POST", signal: abort.signal });
        source = response.file;
      }
      if (!source) throw new Error("اختر ملفًا أولًا.");
      const value = await requestStudyAction<StudyActionResult>(source.id, { action, targetLanguage: language, language, questionCount, summaryDetail }, { signal: abort.signal, onStatus: setPhase, onJob: id => { rememberedJob(storageKey, id); setPendingId(id); } });
      setResult(value); rememberedJob(storageKey, null); setPendingId(null);
    } catch (reason) { if (reason instanceof StudyRequestError && reason.terminal) { rememberedJob(storageKey, null); setPendingId(null); } if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر إكمال المعالجة"); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <section className={styles.panel} dir="rtl">
    <header className={styles.panelHeader}><div><span className={styles.eyebrow}><Sparkles size={15}/> أدوات مراس</span><h2>{names[action]}</h2></div>{onBack && <button type="button" className={styles.secondary} onClick={onBack}>كل الأدوات</button>}</header>
    <div className={styles.formGrid}>
      {resources ? <label className={styles.field}>ملف الدرس<select value={resourceId} disabled={busy} onChange={event => { setResourceId(Number(event.target.value)); setResult(null); }}>{resources.map(resource => <option key={resource.id} value={resource.id}>{resource.title}{!resource.lessonId ? " · مشترك" : ""}</option>)}</select><small>يُستخدم الملف المعتمد من الإدارة دون إعادة رفعه.</small></label> : <div><input hidden ref={input} type="file" accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg" onChange={event => void upload(event.target.files?.[0])}/><button type="button" className={styles.upload} disabled={busy} onClick={() => input.current?.click()}><FileUp size={28}/><span><b>{file?.originalName || "اختر ملف المحاضرة"}</b><small>PDF · Word · PowerPoint · نصوص · صور · استئناف الرفع</small></span></button>{file && <p className={styles.hint}>{(file.sizeBytes / 1024 / 1024).toFixed(1)} م.ب · {file.scanStatus === "clean" ? "اجتاز الفحص الأمني" : "يخضع للفحص الأمني قبل المعالجة"}</p>}</div>}
      {action === "summary" && <><label className={styles.field}>لغة الملخص<select value={language === "العربية" ? "ar" : language} disabled={busy} onChange={event => setLanguage(event.target.value)}>{SUMMARY_LANGUAGES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className={styles.field}>مستوى التفصيل<select value={summaryDetail} disabled={busy} onChange={event => setSummaryDetail(event.target.value)}>{SUMMARY_DETAILS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>تغيير التفصيل لا يستبعد محاور المصدر أو الحقائق الحاسمة.</small></label></>}
      {action !== "summary" && <label className={styles.field}>{action === "quiz" ? "لغة الاختبار" : "اللغة المطلوبة"}<input value={language} maxLength={60} disabled={busy} onChange={event => setLanguage(event.target.value)}/></label>}
      {action === "quiz" && <label className={styles.field}>عدد الأسئلة<select value={questionCount} disabled={busy} onChange={event => setQuestionCount(Number(event.target.value))}>{[5, 10, 15, 20].map(count => <option key={count} value={count}>{count} أسئلة</option>)}</select></label>}
    </div>
    <p className={styles.hint}>نستخرج النص من DOCX وPPTX. للمخططات والصور داخل المستند استخدم PDF. النتائج مساعدة دراسية وتحتاج مراجعتك.</p>
    <button type="button" className={styles.primary} disabled={busy || (resources ? !resourceId : !file) || !language.trim()} onClick={() => void run()}>{busy ? <LoaderCircle className={styles.spin} size={18}/> : <Sparkles size={18}/>} {busy ? phase === "upload" ? "جارٍ رفع الملف…" : phase === "processing" ? "جارٍ إعداد النتيجة…" : phase === "reconnecting" ? "إعادة الاتصال بالطلب المحفوظ…" : phase.startsWith("رفع الأجزاء:") || phase.includes("الملف") ? phase : "طلبك محفوظ في قائمة المعالجة…" : names[action]}</button>
    {busy && (phase === "queued" || phase === "processing" || phase === "reconnecting") && <p className={styles.hint} role="status">لا ترسل الطلب مجددًا. يمكنك العودة إلى هذه الأداة لاستكمال متابعة الطلب المحفوظ.</p>}
    {busy && (phase === "upload" || phase.startsWith("رفع الأجزاء:") || phase.includes("الملف")) && <button type="button" className={styles.secondary} onClick={() => { controller.current?.abort(); setBusy(false); setPhase(""); setError("توقف الرفع مؤقتًا. أعد اختيار الملف نفسه لاستئناف الأجزاء الناقصة فقط."); }}>إيقاف الرفع مؤقتًا</button>}
    {error && <div className={styles.error} role="alert"><p>{error}</p>{pendingId && <button type="button" className={styles.secondary} onClick={() => { const id = rememberedJob(storageKey); if (id) { const abort = new AbortController(); controller.current = abort; void resume(id, abort.signal); } }}>متابعة الطلب المحفوظ</button>}</div>}
    {result?.cached && <p className={styles.hint}>استخدمنا نتيجة محفوظة لنفس الملف والإعدادات دون طلب توليد جديد.</p>}
    {result?.artifact && <article className={styles.artifact}><header className={styles.panelHeader}><h3>{result.artifact.title}</h3><StudyArtifactDownload id={result.artifact.id}/></header><details><summary>قراءة النتيجة هنا</summary><div className={styles.artifactText} dir="auto">{result.artifact.content}</div></details><p className={styles.hint}>إعداد وتنسيق: مراس العلم · حقوق محتوى المصدر لأصحابه.</p></article>}
    {result?.quiz && <AiQuizRunner key={result.quiz.id} quiz={result.quiz} onClose={() => { setResult(null); onBack?.(); }}/ >}
  </section>;
}

export function LessonStudyTools({ courseSlug, lessonId }: { courseSlug: string; lessonId: string }) {
  const [resources, setResources] = useState<StudyResource[]>([]);
  const [action, setAction] = useState<StudyAction | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    void studyJson<{ resources: StudyResource[] }>(`/api/course-resources?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`, { signal: abort.signal }).then(payload => {
      if (!abort.signal.aborted) setResources(payload.resources.filter(file => /pdf|wordprocessingml|presentationml|text\/|image\/(png|jpeg)/.test(file.contentType)).sort((a, b) => Number(Boolean(b.lessonId)) - Number(Boolean(a.lessonId))));
    }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل ملفات الدرس"); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [courseSlug, lessonId]);
  return <section className={styles.lessonTools} dir="rtl"><header className={styles.panelHeader}><div><span className={styles.eyebrow}>بعد المشاهدة</span><h2>ثبّت فهمك بأدوات مراس</h2><p>تلخيص وترجمة واختبار من الملف المرتبط بهذا الدرس.</p></div><BrainCircuit size={30}/></header>{loading ? <p role="status">جارٍ تحميل ملف الدرس…</p> : error ? <p role="alert" className={styles.error}>{error}</p> : !resources.length ? <p className={styles.hint}>لم تُرفق الإدارة ملفًا مدعومًا لهذا الدرس بعد. تتاح الأدوات هنا فور ربط الملف واعتماده.</p> : action ? <StudyFileTools key={`${lessonId}:${action}`} action={action} resources={resources} storageScope={`${courseSlug}:${lessonId}`} onBack={() => setAction(null)}/> : <StudyToolCards onSelect={selected => { if (selected !== "chat") setAction(selected); }}/> }</section>;
}
