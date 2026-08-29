"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, HelpCircle, ListVideo, Menu, MessageSquareText, NotebookPen, PanelLeftClose, PlayCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { Course } from "@/lib/data";
import { SecureVideoPlayer } from "./secure-video-player";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-provider";

export function LearningRoom({ course, studentLabel }: { course: Course; studentLabel: string }) {
  const allLessons = useMemo(() => course.units.flatMap((unit) => unit.lessons), [course]);
  const [activeLesson, setActiveLesson] = useState(allLessons[0]);
  const [completed, setCompleted] = useState(new Set(allLessons.filter((lesson) => lesson.completed).map((lesson) => lesson.id)));
  const [sidebar, setSidebar] = useState(true);
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState("");
  const [lessonQuery, setLessonQuery] = useState("");
  const currentIndex = allLessons.findIndex((lesson) => lesson.id === activeLesson.id);
  const progress = Math.round((completed.size / allLessons.length) * 100);

  useEffect(() => {
    fetch(`/api/progress?course=${encodeURIComponent(course.slug)}`, { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { progress?: Array<{ lessonId: string; completed: boolean }> };
      setCompleted(new Set((data.progress || []).filter((item) => item.completed).map((item) => item.lessonId)));
    }).catch(() => undefined);
  }, [course.slug]);

  const saveCompletion = (lessonId: string, value: boolean) => {
    void fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseSlug: course.slug, lessonId, watchedSeconds: 0, completed: value }),
    }).catch(() => undefined);
  };
  const markCompleted = () => {
    const next = new Set(completed);
    const willComplete = !next.has(activeLesson.id);
    if (willComplete) next.add(activeLesson.id); else next.delete(activeLesson.id);
    setCompleted(next);
    saveCompletion(activeLesson.id, willComplete);
  };
  const chooseLesson = (lesson: typeof activeLesson) => {
    setActiveLesson(lesson);
    try { setNote(localStorage.getItem(`meras-note:${course.slug}:${lesson.id}`) || ""); } catch { setNote(""); }
  };
  const go = (offset: number) => {
    const next = allLessons[currentIndex + offset];
    if (next) chooseLesson(next);
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
        <div className="learning-video-wrap"><SecureVideoPlayer key={activeLesson.id} title={activeLesson.title} studentLabel={studentLabel} courseSlug={course.slug} lessonId={activeLesson.id} /></div>
        <div className="lesson-toolbar"><div><span>الوحدة {course.units.findIndex((unit) => unit.lessons.some((lesson) => lesson.id === activeLesson.id)) + 1}</span><h1>{activeLesson.title}</h1></div><button onClick={markCompleted} className={completed.has(activeLesson.id) ? "completed" : ""}>{completed.has(activeLesson.id) ? <CheckCircle2 size={18} /> : <span />}{completed.has(activeLesson.id) ? "مكتمل" : "تحديد كمكتمل"}</button></div>
        <div className="lesson-navigation"><button disabled={currentIndex === 0} onClick={() => go(-1)}><ChevronRight size={17} /><span><small>السابق</small><strong>{allLessons[currentIndex - 1]?.title || "—"}</strong></span></button><button disabled={currentIndex === allLessons.length - 1} onClick={() => go(1)}><span><small>التالي</small><strong>{allLessons[currentIndex + 1]?.title || "—"}</strong></span><ChevronLeft size={17} /></button></div>
        <div className="lesson-tabs">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><BookOpen size={16} /> نظرة عامة</button>
          <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}><NotebookPen size={16} /> ملاحظاتي</button>
          <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}><FileText size={16} /> ملفات الدرس</button>
          <button className={tab === "qa" ? "active" : ""} onClick={() => setTab("qa")}><MessageSquareText size={16} /> الأسئلة</button>
        </div>
        <div className="lesson-tab-content">
          {tab === "overview" && <div className="lesson-overview"><h2>عن هذا الدرس</h2><p>في هذا الدرس نشرح المفهوم الأساسي خطوة بخطوة، ثم نطبّقه على أمثلة مشابهة لأسئلة المقرر والاختبارات.</p><h3>بعد نهاية الدرس ستستطيع:</h3><ul><li><CheckCircle2 size={16} /> تحديد عناصر الفكرة الأساسية</li><li><CheckCircle2 size={16} /> حل المسائل باستخدام الخطوات الصحيحة</li><li><CheckCircle2 size={16} /> تجنب الأخطاء الشائعة في الاختبار</li></ul></div>}
          {tab === "notes" && <div className="notes-box"><div><NotebookPen size={18} /><span><strong>ملاحظاتك الخاصة</strong><small>تُحفظ محليًا على هذا الجهاز</small></span></div><textarea value={note} onChange={(event) => { setNote(event.target.value); try { localStorage.setItem(`meras-note:${course.slug}:${activeLesson.id}`,event.target.value); } catch {} }} placeholder="اكتب ملاحظتك عند هذا الدرس..." /><p>{note.length} حرفًا <span>محفوظ محليًا الآن</span></p></div>}
          {tab === "files" && <div className="lesson-files"><article><i><FileText size={21} /></i><span><strong>ملخص الدرس.pdf</strong><small>PDF · 1.8 MB</small></span><button><Download size={16} /> تنزيل</button></article><article><i><ListVideo size={21} /></i><span><strong>تمارين تطبيقية.pdf</strong><small>PDF · 920 KB</small></span><button><Download size={16} /> تنزيل</button></article></div>}
          {tab === "qa" && <div className="qa-box"><HelpCircle size={30} /><h3>عندك سؤال عن هذا الدرس؟</h3><p>افتح مساعد مراس ليشرح لك طريق الدعم أو يوجّه سؤالك.</p><button className="button button-primary" onClick={()=>window.dispatchEvent(new Event("meras:assistant"))}><Sparkles size={16} /> اسأل مساعد مراس</button></div>}
        </div>
      </section>
    </div>
  </main>;
}
