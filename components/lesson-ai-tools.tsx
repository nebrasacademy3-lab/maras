"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, Bot, Send, Sparkles, RefreshCw } from "lucide-react";
import { studyJson } from "@/lib/ai-job-client";
import { StudyFileTools, type StudyResource } from "./study-file-tools";
import { StudyRichText } from "./study-rich-text";
import styles from "./lesson-ai-tools.module.css";
type Message = { id: number; role: string; content: string; createdAt: string };
type Thread = { messages: Message[]; source: { title: string; version: string }; conversationId: number | null };
export function LessonAiTools({ userId, courseSlug, lessonId, mode }: { userId: number; courseSlug: string; lessonId: string; mode: "quiz" | "tutor" }) {
  const [files, setFiles] = useState<StudyResource[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void studyJson<{ resources: StudyResource[] }>(`/api/course-resources?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      const supported = data.resources.filter(file => /pdf|wordprocessingml|presentationml|text\/|image\/(png|jpeg)/.test(file.contentType));
      const specific = supported.filter(file => file.lessonId === lessonId);
      setFiles(specific.length ? specific : supported.filter(file => !file.lessonId)); setError("");
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل ملف الدرس"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courseSlug, lessonId, reload]);
  if (loading) return <p role="status">نجهّز ملف الدرس المعتمد…</p>;
  if (error) return <section className={styles.empty}><p role="alert">{error}</p><button onClick={() => { setLoading(true); setReload(value => value+1); }}><RefreshCw size={16}/> إعادة المحاولة</button></section>;
  if (!files.length) return <section className={styles.empty}><BookOpenCheck size={32}/><h3>بانتظار ملف الدرس</h3><p>لم تربط الإدارة ملفًا مدعومًا بهذا الدرس بعد. تتاح الأداة هنا عند ربط الملف واعتماده، دون أن تحتاج لرفعه.</p></section>;
  return mode === "quiz" ? <StudyFileTools action="quiz" resources={files} storageScope={`${userId}:${courseSlug}:${lessonId}`}/> : <LessonTutor key={`${userId}:${lessonId}:${files.map(f=>f.id).join(",")}`} files={files} lessonId={lessonId}/>;
}
function LessonTutor({ files, lessonId }: { files: StudyResource[]; lessonId: string }) {
  const [resourceId,setResourceId] = useState(files[0].id), [messages,setMessages] = useState<Message[]>([]), [text,setText] = useState(""), [error,setError] = useState(""), [busy,setBusy] = useState(false), [loading,setLoading] = useState(true);
  const pending = useRef<AbortController|null>(null), end = useRef<HTMLDivElement>(null), sourceVersion = useRef<string | null>(null);
  const path = `/api/course-resources/${resourceId}/tutor?lesson=${encodeURIComponent(lessonId)}`;
  useEffect(() => {
    const controller = new AbortController(); pending.current = controller;
    void studyJson<Thread>(path, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) {setMessages(data.messages);sourceVersion.current=data.source.version;setError("");} }).catch(reason => {if(!controller.signal.aborted)setError(reason instanceof Error ? reason.message : "تعذر استعادة المحادثة");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return () => { controller.abort(); pending.current?.abort(); };
  }, [path]);
  async function send() {
    if (busy || loading || text.trim().length < 2) return;
    const question = text.trim(), controller = new AbortController(); pending.current = controller; setBusy(true); setError("");
    try {
      const data = await studyJson<Thread>(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:question,requestId:crypto.randomUUID()}),signal:controller.signal});
      if (!controller.signal.aborted) {const sameSource=sourceVersion.current===data.source.version;setMessages(current=>[...(sameSource?current:[]),...data.messages]);sourceVersion.current=data.source.version;setText("");requestAnimationFrame(()=>end.current?.scrollIntoView({block:"nearest",behavior:"instant"}));}
    } catch(reason) {if(!controller.signal.aborted)setError(reason instanceof Error ? reason.message : "تعذر إكمال الإجابة؛ سؤالك لم يُحذف");}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className={styles.tutor} aria-label="المعلم الذكي">
    <header className={styles.heading}><span className={styles.bot}><Bot size={27}/></span><div><h2>المعلم الذكي</h2><p>نفهم الدرس معًا · الإجابات من الملف المعتمد</p></div></header>
    <label className={styles.source}>المصدر<select value={resourceId} disabled={busy||loading} onChange={event=>{setLoading(true);setMessages([]);setError("");setText("");setResourceId(Number(event.target.value));}}>{files.map(file=><option key={file.id} value={file.id}>{file.title}</option>)}</select></label>
    <p className={styles.hint}>لا تحتاج إلى رفع ملف. يصرّح المعلم إذا لم يجد الإجابة في مرجع الدرس. راجع النتائج العلمية مع مقررك.</p>
    <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions">
      {loading ? <p role="status">جارٍ استعادة محادثتك…</p> : !messages.length ? <div className={styles.empty}><Sparkles size={30}/><h3>وش تحب نفهم من الدرس؟</h3><p>اسأل عن فكرة، مصطلح أو خطوة في معادلة.</p></div> : messages.map(item=><article key={item.id} className={item.role === "user" ? styles.user : styles.assistant}><strong>{item.role === "user" ? "أنت" : "المعلم الذكي"}</strong><StudyRichText content={item.content}/>{item.role === "assistant" && <small>المرجع: {files.find(file=>file.id===resourceId)?.title}</small>}</article>)}
      {busy && <p role="status" className={styles.pending}>يقرأ المعلم مرجع الدرس ويجهّز الإجابة…</p>}<div ref={end}/>
    </div>
    {!messages.length && !loading && <div className={styles.suggestions}>{["اشرح أهم أفكار هذا الدرس", "اشرح المعادلات الواردة في الملف خطوة بخطوة", "ما الفرق بين أهم المصطلحات في الدرس؟"].map(value=><button key={value} disabled={busy} onClick={()=>setText(value)}>{value}</button>)}</div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <form className={styles.composer} onSubmit={event=>{event.preventDefault();void send();}}><label className={styles.input}>سؤالك عن الدرس<textarea rows={3} value={text} maxLength={8000} disabled={busy||loading} onChange={event=>setText(event.target.value)} placeholder="اكتب سؤالك… يدعم العربية والإنجليزية والمعادلات"/></label><button disabled={busy||loading||text.trim().length<2} type="submit"><Send size={18}/>{busy ? "جارٍ الشرح" : "إرسال"}</button></form>
  </section>;
}
