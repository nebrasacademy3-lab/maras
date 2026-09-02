"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileText, HelpCircle, Menu, MessageSquareText, NotebookPen, PanelLeftClose, PlayCircle, Save, Search, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import type { Course } from "@/lib/data";
import { SecureVideoPlayer, type VideoSeekRequest } from "./secure-video-player";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-provider";

type VideoNote = { id: number; lessonId: string; body: string; timestampSeconds: number; createdAt: string; updatedAt: string };

function formatNoteTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function LearningRoom({ course, studentLabel }: { course: Course; studentLabel: string }) {
  const allLessons = useMemo(() => course.units.flatMap((unit) => unit.lessons), [course]);
  const [activeLesson, setActiveLesson] = useState(allLessons[0]);
  const [completed, setCompleted] = useState(() => new Set<string>());
  const [watched, setWatched] = useState<Record<string, number>>({});
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const resumeHandled = useRef(false);
  const [sidebar, setSidebar] = useState(true);
  const [tab, setTab] = useState("overview");
  const [noteDraft, setNoteDraft] = useState("");
  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [playerTime, setPlayerTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<VideoSeekRequest | null>(null);
  const seekNonceRef = useRef(0);
  const [lessonQuery, setLessonQuery] = useState("");
  const currentIndex = allLessons.findIndex((lesson) => lesson.id === activeLesson.id);
  const progress = allLessons.length ? Math.round((completed.size / allLessons.length) * 100) : 0;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/progress?course=${encodeURIComponent(course.slug)}`, { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok || cancelled) return;
      const data = await response.json() as { progress?: Array<{ lessonId: string; completed: boolean; watchedSeconds: number }> };
      const rows = data.progress || [];
      const done = new Set(rows.filter((item) => item.completed).map((item) => item.lessonId));
      const seconds = Object.fromEntries(rows.map((item) => [item.lessonId, Math.max(0, item.watchedSeconds || 0)]));
      setCompleted(done);
      setWatched(seconds);
      if (!resumeHandled.current) {
        resumeHandled.current = true;
        const latest = rows.filter((item) => !item.completed && item.watchedSeconds > 5).sort((left, right) => right.watchedSeconds - left.watchedSeconds)[0];
        const target = (latest && allLessons.find((lesson) => lesson.id === latest.lessonId)) || allLessons.find((lesson) => !done.has(lesson.id));
        if (target && target.id !== allLessons[0]?.id) setActiveLesson(target);
        if (target && seconds[target.id] > 5 && !done.has(target.id)) { seekNonceRef.current += 1; setSeekRequest({ seconds: seconds[target.id], nonce: seekNonceRef.current }); }
      }
    }).catch(() => undefined).finally(() => { if (!cancelled) setProgressLoaded(true); });
    return () => { cancelled = true; };
  }, [course.slug, allLessons]);

  useEffect(() => {
    const controller = new AbortController();
    const loadNotes = async () => {
      setNotesLoading(true);
      setNoteMessage("");
      setNoteDraft("");
      setPlayerTime(0);
      try {
        const response = await fetch(`/api/mobile/notes?lesson=${encodeURIComponent(activeLesson.id)}`, { credentials: "same-origin", signal: controller.signal });
        const data = await response.json() as { notes?: VideoNote[]; error?: string };
        if (!response.ok) throw new Error(data.error || "تعذر تحميل الملاحظات");
        setNotes(data.notes || []);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") { setNotes([]); setNoteMessage(reason instanceof Error ? reason.message : "تعذر تحميل الملاحظات"); }
      } finally {
        if (!controller.signal.aborted) setNotesLoading(false);
      }
    };
    void loadNotes();
    return () => controller.abort();
  }, [activeLesson.id]);

  const saveCompletion = async (lessonId: string, value: boolean) => {
    setCompletionMessage("");
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseSlug: course.slug, lessonId, watchedSeconds: Math.max(Math.floor(playerTime), watched[lessonId] || 0), completed: value, manual: true }),
      });
      const data = await response.json() as { error?: string; progress?: { lessonId: string; completed: boolean; watchedSeconds: number } };
      if (!response.ok) throw new Error(data.error || "تعذر حفظ حالة الدرس");
      if (data.progress) {
        setCompleted((current) => { const next = new Set(current); if (data.progress!.completed) next.add(data.progress!.lessonId); else next.delete(data.progress!.lessonId); return next; });
        setWatched((current) => ({ ...current, [data.progress!.lessonId]: data.progress!.watchedSeconds }));
      }
    } catch (reason) {
      setCompleted((current) => { const next = new Set(current); if (value) next.delete(lessonId); else next.add(lessonId); return next; });
      setCompletionMessage(reason instanceof Error ? reason.message : "تعذر حفظ حالة الدرس");
    }
  };
  const markCompleted = () => {
    const next = new Set(completed);
    const willComplete = !next.has(activeLesson.id);
    if (willComplete) next.add(activeLesson.id); else next.delete(activeLesson.id);
    setCompleted(next);
    void saveCompletion(activeLesson.id, willComplete);
  };
  const chooseLesson = (lesson: typeof activeLesson) => {
    setActiveLesson(lesson);
    const resumeAt = watched[lesson.id] || 0;
    if (resumeAt > 5 && !completed.has(lesson.id)) { seekNonceRef.current += 1; setSeekRequest({ seconds: resumeAt, nonce: seekNonceRef.current }); }
    else setSeekRequest(null);
  };
  const go = (offset: number) => {
    const next = allLessons[currentIndex + offset];
    if (next) chooseLesson(next);
  };
  const saveNote = async () => {
    const body = noteDraft.trim();
    if (!body) { setNoteMessage("اكتب الملاحظة أولًا"); return; }
    setNoteMessage("جارٍ حفظ الملاحظة...");
    try {
      const response = await fetch("/api/mobile/notes", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessonId: activeLesson.id, body, timestampSeconds: Math.floor(playerTime) }) });
      const data = await response.json() as { note?: VideoNote; error?: string };
      if (!response.ok || !data.note) throw new Error(data.error || "تعذر حفظ الملاحظة");
      setNotes((current) => [...current, data.note!].sort((left, right) => left.timestampSeconds - right.timestampSeconds || left.id - right.id));
      setNoteDraft("");
      setNoteMessage(`حُفظت الملاحظة عند ${formatNoteTime(data.note.timestampSeconds)}`);
    } catch (reason) {
      setNoteMessage(reason instanceof Error ? reason.message : "تعذر حفظ الملاحظة");
    }
  };
  const openNote = (note: VideoNote) => {
    seekNonceRef.current += 1;
    setSeekRequest({ seconds: note.timestampSeconds, nonce: seekNonceRef.current });
    document.querySelector(".learning-video-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const removeNote = async (note: VideoNote) => {
    setNoteMessage("");
    try {
      const response = await fetch("/api/mobile/notes", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: note.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر حذف الملاحظة");
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setNoteMessage("تم حذف الملاحظة");
    } catch (reason) {
      setNoteMessage(reason instanceof Error ? reason.message : "تعذر حذف الملاحظة");
    }
  };

  return <main className="learning-page">
    <header className="learning-header">
      <div><button className="learning-menu" onClick={() => setSidebar(!sidebar)} aria-label="إظهار المحتوى"><Menu size={19} /></button><BrandLogo compact /><i /><Link href={`/courses/${course.slug}`}>{course.title}</Link></div>
      <div className="learning-progress-head"><span>{progress}%</span><i><b style={{ width: `${progress}%` }} /></i><small>{completed.size} من {allLessons.length} درسًا</small></div>
      <div><span className="secure-session"><ShieldCheck size={15} /> جلسة محمية</span><ThemeToggle compact /><Link href="/dashboard" className="learning-avatar">م</Link></div>
    </header>
    <div className={`learning-layout ${sidebar ? "" : "sidebar-closed"}`}>
      <aside className="lesson-sidebar">
        <div className="lesson-sidebar-head"><div><strong>محتويات المادة</strong><small>{course.units.length} وحدات · {course.lessons} درسًا</small></div><button onClick={() => setSidebar(false)}><PanelLeftClose size={18} /></button></div>
        <label className="lesson-search"><Search size={15} /><input value={lessonQuery} onChange={(event)=>setLessonQuery(event.target.value)} placeholder="ابحث داخل الدروس..." /></label>
        <div className="lesson-units">{course.units.map((unit, unitIndex) => <details key={unit.title} open={unitIndex < 2}>
          <summary><span><b>الوحدة {unitIndex + 1}</b><strong>{unit.title.replace(/^الوحدة [^:]+:\s*/, "")}</strong></span><ChevronDown size={16} /></summary>
          <div>{unit.lessons.filter((lesson)=>!lessonQuery.trim()||lesson.title.toLowerCase().includes(lessonQuery.trim().toLowerCase())).map((lesson, index) => <button key={lesson.id} className={activeLesson.id === lesson.id ? "active" : ""} onClick={() => chooseLesson(lesson)}>
            <i className={completed.has(lesson.id) ? "done" : ""}>{completed.has(lesson.id) ? <Check size={12} /> : <PlayCircle size={15} />}</i>
            <span><strong>{index + 1}. {lesson.title}</strong><small>{lesson.duration}{lesson.free && <em>مجاني</em>}</small></span>
          </button>)}</div>
        </details>)}</div>
      </aside>
      <section className="learning-main">
        <div className="learning-video-wrap"><SecureVideoPlayer key={activeLesson.id} title={activeLesson.title} studentLabel={studentLabel} courseSlug={course.slug} lessonId={activeLesson.id} seekRequest={seekRequest} onTimeChange={setPlayerTime} /></div>
        <div className="lesson-toolbar"><div><span>الوحدة {course.units.findIndex((unit) => unit.lessons.some((lesson) => lesson.id === activeLesson.id)) + 1}{watched[activeLesson.id] > 5 && !completed.has(activeLesson.id) ? ` · توقفت عند ${formatNoteTime(watched[activeLesson.id])}` : ""}</span><h1>{activeLesson.title}</h1></div><button onClick={markCompleted} disabled={!progressLoaded} className={completed.has(activeLesson.id) ? "completed" : ""}>{completed.has(activeLesson.id) ? <CheckCircle2 size={18} /> : <span />}{completed.has(activeLesson.id) ? "مكتمل" : "تحديد كمكتمل"}</button></div>
        {completionMessage && <p className="notes-feedback">{completionMessage}</p>}
        <div className="lesson-navigation"><button disabled={currentIndex === 0} onClick={() => go(-1)}><ChevronRight size={17} /><span><small>السابق</small><strong>{allLessons[currentIndex - 1]?.title || "—"}</strong></span></button><button disabled={currentIndex === allLessons.length - 1} onClick={() => go(1)}><span><small>التالي</small><strong>{allLessons[currentIndex + 1]?.title || "—"}</strong></span><ChevronLeft size={17} /></button></div>
        <div className="lesson-tabs">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><BookOpen size={16} /> نظرة عامة</button>
          <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}><NotebookPen size={16} /> ملاحظاتي</button>
          <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}><FileText size={16} /> ملفات الدرس</button>
          <button className={tab === "qa" ? "active" : ""} onClick={() => setTab("qa")}><MessageSquareText size={16} /> الأسئلة</button>
        </div>
        <div className="lesson-tab-content">
          {tab === "overview" && (() => { const unit = course.units.find((item) => item.lessons.some((lesson) => lesson.id === activeLesson.id)); const description = activeLesson.description?.trim(); const unitDescription = unit?.description?.trim(); return <div className="lesson-overview"><h2>عن هذا الدرس</h2>{description ? <p>{description}</p> : <p>لم يُضف وصف لهذا الدرس بعد. تابع الفيديو، وسجّل ملاحظاتك المرتبطة باللحظة من تبويب «ملاحظاتي».</p>}{unitDescription && <><h3>عن الوحدة: {unit?.title}</h3><p>{unitDescription}</p></>}<h3>معلومات الدرس</h3><ul><li><CheckCircle2 size={16} /> المدة: {activeLesson.duration || "تُحسب من الفيديو"}</li><li><CheckCircle2 size={16} /> الترتيب: الدرس {currentIndex + 1} من {allLessons.length}</li><li><CheckCircle2 size={16} /> {completed.has(activeLesson.id) ? "أكملت هذا الدرس" : watched[activeLesson.id] > 5 ? `شاهدت حتى ${formatNoteTime(watched[activeLesson.id])}` : "لم تبدأ هذا الدرس بعد"}</li></ul></div>; })()}
          {tab === "notes" && <div className="notes-box"><div><NotebookPen size={18} /><span><strong>ملاحظات مرتبطة بالفيديو</strong><small>تُحفظ في حسابك وتفتح نفس الدقيقة والثانية على كل أجهزتك</small></span></div><div className="video-note-compose"><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="اكتب ما تريد تذكره عند هذه اللحظة..." maxLength={4000} /><div><span>اللحظة الحالية: {formatNoteTime(playerTime)}</span><button className="button button-primary" type="button" onClick={() => void saveNote()}><Save size={15} /> حفظ عند هذه اللحظة</button></div></div>{noteMessage && <p className="notes-feedback">{noteMessage}</p>}{notesLoading ? <p className="notes-empty">جارٍ تحميل الملاحظات...</p> : notes.length ? <div className="video-notes-list">{notes.map((note) => <article className="video-note-item" key={note.id}><button type="button" onClick={() => openNote(note)}><time>{formatNoteTime(note.timestampSeconds)}</time><p>{note.body}</p></button><button type="button" className="video-note-delete" onClick={() => void removeNote(note)} aria-label="حذف الملاحظة"><Trash2 size={15} /></button></article>)}</div> : <p className="notes-empty">لا توجد ملاحظات بعد. أوقف الفيديو عند اللحظة المطلوبة ثم احفظ ملاحظتك.</p>}</div>}
          {tab === "files" && <div className="lesson-files"><div className="qa-box"><FileText size={30} /><h3>لا توجد ملفات مرفقة لهذا الدرس بعد</h3><p>عند إضافة ملخصات أو تمارين لهذا الدرس ستظهر هنا للتنزيل، وستصلك إشعار بذلك.</p></div></div>}
          {tab === "qa" && <div className="qa-box"><HelpCircle size={30} /><h3>عندك سؤال عن هذا الدرس؟</h3><p>افتح مساعد مراس ليشرح لك طريق الدعم أو يوجّه سؤالك.</p><button className="button button-primary" onClick={()=>window.dispatchEvent(new Event("meras:assistant"))}><Sparkles size={16} /> اسأل مساعد مراس</button></div>}
        </div>
      </section>
    </div>
  </main>;
}
