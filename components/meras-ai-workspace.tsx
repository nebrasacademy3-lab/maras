"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpLeft, BookOpenCheck, BrainCircuit, Check, CheckCircle2, CircleAlert,
  Crown, FileText, FileUp, Gauge, History, Languages, LoaderCircle, Menu,
  MessageSquarePlus, Paperclip, Plus, Send, Sparkles, X,
} from "lucide-react";
import type {
  AiArtifactPayload, AiConversationSummary, AiFilePayload, AiMessagePayload,
  AiQuizAttemptResult, AiQuizPayload, AiUsageStatus,
} from "@/lib/ai-contracts";
import styles from "./meras-ai-workspace.module.css";

type StatusPayload = {
  entitlement: { tier: "free" | "subscriber"; source: string; monthlyPrice: number; currency: string };
  services: Record<"chat" | "summary" | "translation" | "quiz", AiUsageStatus>;
  supportedFiles: { mimeType: string; extensions: readonly string[]; maxBytes: number }[];
  documentGuidance: { recommendedMimeType: string; message: string };
};

type ConversationDetail = {
  conversation: AiConversationSummary;
  messages: AiMessagePayload[];
  files: AiFilePayload[];
  artifacts: AiArtifactPayload[];
};

type Notice = { tone: "ok" | "error"; text: string };
const serviceLabel = { chat: "المحادثة", summary: "التلخيص", translation: "الترجمة", quiz: "الاختبارات" } as const;

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "تعذر إكمال الطلب");
  return payload;
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} م.ب` : `${Math.ceil(bytes / 1024)} ك.ب`;
}

export function MerasAiWorkspace({ studentName, initialConversationId, initialQuizId }: { studentName: string; initialConversationId: number | null; initialQuizId: number | null }) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(initialConversationId);
  const [messages, setMessages] = useState<AiMessagePayload[]>([]);
  const [files, setFiles] = useState<AiFilePayload[]>([]);
  const [artifacts, setArtifacts] = useState<AiArtifactPayload[]>([]);
  const [quiz, setQuiz] = useState<AiQuizPayload | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizResults, setQuizResults] = useState<Record<string, AiQuizAttemptResult>>({});
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("العربية");
  const [questionCount, setQuestionCount] = useState(10);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadShell = useCallback(async () => {
    const [statusPayload, conversationPayload] = await Promise.all([
      responseJson<{ status?: never } & StatusPayload & { ok: true }>(await fetch("/api/ai/status", { cache: "no-store", credentials: "same-origin" })),
      responseJson<{ conversations: AiConversationSummary[] }>(await fetch("/api/ai/conversations", { cache: "no-store", credentials: "same-origin" })),
    ]);
    setStatus(statusPayload);
    setConversations(conversationPayload.conversations || []);
  }, []);

  const openConversation = useCallback(async (id: number) => {
    setBusy("conversation"); setNotice(null);
    try {
      const payload = await responseJson<ConversationDetail>(await fetch(`/api/ai/conversations/${id}`, { cache: "no-store", credentials: "same-origin" }));
      setActiveId(id); setMessages(payload.messages || []); setFiles(payload.files || []); setArtifacts(payload.artifacts || []); setQuiz(null); setQuizAnswers({}); setQuizResults({}); setSidebarOpen(false);
      window.history.replaceState(null, "", `/meras-ai?conversation=${id}`);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر فتح المحادثة" }); }
    finally { setBusy(""); }
  }, []);

  const openQuiz = useCallback(async (id: number) => {
    setBusy("quiz"); setNotice(null);
    try {
      const payload = await responseJson<{ quiz: AiQuizPayload }>(await fetch(`/api/ai/quizzes/${id}`, { cache: "no-store", credentials: "same-origin" }));
      setQuiz(payload.quiz); setActiveId(payload.quiz.conversationId); setQuizAnswers({}); setQuizResults({});
      window.history.replaceState(null, "", `/meras-ai?quiz=${id}`);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر فتح الاختبار" }); }
    finally { setBusy(""); }
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadShell().then(() => {
        if (!active) return;
        if (initialQuizId) return openQuiz(initialQuizId);
        if (initialConversationId) return openConversation(initialConversationId);
      }).catch((error) => active && setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر تحميل مراس AI" }));
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [initialConversationId, initialQuizId, loadShell, openConversation, openQuiz]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);

  const newConversation = async () => {
    setBusy("new"); setNotice(null);
    try {
      const payload = await responseJson<{ conversation: AiConversationSummary }>(await fetch("/api/ai/conversations", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }));
      setConversations((current) => [payload.conversation, ...current]);
      setActiveId(payload.conversation.id); setMessages([]); setFiles([]); setArtifacts([]); setQuiz(null); setSidebarOpen(false);
      window.history.replaceState(null, "", `/meras-ai?conversation=${payload.conversation.id}`);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر إنشاء المحادثة" }); }
    finally { setBusy(""); }
  };

  const ensureConversation = async () => {
    if (activeId) return activeId;
    const payload = await responseJson<{ conversation: AiConversationSummary }>(await fetch("/api/ai/conversations", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }));
    setConversations((current) => [payload.conversation, ...current]); setActiveId(payload.conversation.id);
    return payload.conversation.id;
  };

  const send = async () => {
    const question = text.trim();
    if (question.length < 2 || busy) return;
    setBusy("chat"); setText(""); setNotice(null);
    try {
      const id = await ensureConversation();
      const optimistic: AiMessagePayload = { id: -Date.now(), conversationId: id, role: "user", service: "chat", content: question, fileId: null, model: null, createdAt: new Date().toISOString() };
      setMessages((current) => [...current, optimistic]);
      const payload = await responseJson<{ userMessage: AiMessagePayload; message: AiMessagePayload; conversation: AiConversationSummary; usage: AiUsageStatus }>(await fetch(`/api/ai/conversations/${id}/messages`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: question, requestId: crypto.randomUUID() }) }));
      setMessages((current) => [...current.filter((message) => message.id !== optimistic.id), payload.userMessage, payload.message]);
      setConversations((current) => [payload.conversation, ...current.filter((conversation) => conversation.id !== id)]);
      setStatus((current) => current ? { ...current, services: { ...current.services, chat: payload.usage } } : current);
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id >= 0));
      setText(question); setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر إرسال الرسالة" });
    } finally { setBusy(""); }
  };

  const upload = async (selected: File | undefined) => {
    if (!selected || busy) return;
    setBusy("upload"); setNotice(null);
    try {
      const id = await ensureConversation();
      const body = new FormData(); body.append("file", selected); body.append("conversationId", String(id));
      const payload = await responseJson<{ file: AiFilePayload }>(await fetch("/api/ai/files", { method: "POST", credentials: "same-origin", body }));
      setFiles((current) => [payload.file, ...current]); setNotice({ tone: "ok", text: "تم رفع الملف بأمان. اختر العملية التي تريدها." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر رفع الملف" }); }
    finally { setBusy(""); if (fileInput.current) fileInput.current.value = ""; }
  };

  const runAction = async (file: AiFilePayload, action: "summary" | "translation" | "quiz") => {
    if (busy) return;
    setBusy(`${action}:${file.id}`); setNotice(null); setQuiz(null);
    try {
      const payload = await responseJson<{ artifact?: AiArtifactPayload; quiz?: AiQuizPayload; message: AiMessagePayload; usage: AiUsageStatus }>(await fetch(`/api/ai/files/${file.id}/actions`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, conversationId: activeId, targetLanguage, language: "العربية", questionCount, requestId: crypto.randomUUID() }) }));
      setMessages((current) => [...current, payload.message]);
      if (payload.artifact) setArtifacts((current) => [payload.artifact!, ...current]);
      if (payload.quiz) { setQuiz(payload.quiz); setQuizAnswers({}); setQuizResults({}); window.history.replaceState(null, "", `/meras-ai?quiz=${payload.quiz.id}`); }
      setStatus((current) => current ? { ...current, services: { ...current.services, [action]: payload.usage } } : current);
      await loadShell();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر معالجة الملف" }); }
    finally { setBusy(""); }
  };

  const submitQuiz = async () => {
    if (!quiz || busy) return;
    setBusy("attempt"); setNotice(null);
    try {
      const answers = Object.entries(quizAnswers).map(([questionId, choiceIndex]) => ({ questionId, choiceIndex }));
      const payload = await responseJson<{ attempt: { score: number; total: number; percent: number }; results: AiQuizAttemptResult[] }>(await fetch(`/api/ai/quizzes/${quiz.id}/attempts`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) }));
      setQuizResults(Object.fromEntries(payload.results.map((result) => [result.questionId, result])));
      setNotice({ tone: "ok", text: `نتيجتك ${payload.attempt.score} من ${payload.attempt.total} (${payload.attempt.percent}٪). راجع الشرح تحت كل سؤال.` });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر حفظ المحاولة" }); }
    finally { setBusy(""); }
  };

  const usageCards = useMemo(() => status ? Object.values(status.services) : [], [status]);
  const displayMessages = messages.filter((message) => message.service !== "summary" && message.service !== "translation");

  return <div className={styles.page} dir="rtl">
    <div className={styles.ambientOne}/><div className={styles.ambientTwo}/>
    <section className={styles.shell}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sideBrand}><span><Sparkles size={19}/></span><div><b>مراس AI</b><small>مساحة تعلمك الذكية</small></div><button className={styles.closeSide} onClick={()=>setSidebarOpen(false)} aria-label="إغلاق"><X size={19}/></button></div>
        <button className={styles.newChat} type="button" onClick={()=>void newConversation()} disabled={Boolean(busy)}><MessageSquarePlus size={18}/> محادثة جديدة</button>
        <div className={styles.historyTitle}><History size={15}/><span>السجل</span></div>
        <nav className={styles.history} aria-label="سجل محادثات مراس AI">
          {conversations.map((conversation) => <button key={conversation.id} className={activeId === conversation.id ? styles.activeConversation : ""} onClick={()=>void openConversation(conversation.id)}><span>{conversation.title}</span><small>{conversation.preview || "ابدأ بالسؤال أو أرفق ملفًا"}</small></button>)}
          {!conversations.length ? <div className={styles.emptyHistory}><History size={22}/><span>ستظهر محادثاتك هنا</span></div> : null}
        </nav>
        <div className={styles.privacy}><CheckCircle2 size={15}/><span>ملفاتك وسجلك خاصان بحسابك</span></div>
      </aside>
      {sidebarOpen ? <button className={styles.overlay} aria-label="إغلاق القائمة" onClick={()=>setSidebarOpen(false)}/> : null}

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.title}><button className={styles.menu} onClick={()=>setSidebarOpen(true)} aria-label="فتح السجل"><Menu size={21}/></button><span><BrainCircuit size={23}/></span><div><h1>مرحبًا {studentName.split(" ")[0]}</h1><p>اسأل، لخّص، ترجم واختبر فهمك</p></div></div>
          <div className={`${styles.plan} ${status?.entitlement.tier === "subscriber" ? styles.pro : ""}`}>{status?.entitlement.tier === "subscriber" ? <Crown size={16}/> : <Gauge size={16}/>}<span>{status?.entitlement.tier === "subscriber" ? "مراس AI بلس" : "الخطة المجانية"}</span></div>
        </header>

        <div className={styles.usageStrip}>{usageCards.map((service) => <div key={service.service}><span>{serviceLabel[service.service]}</span><b>{service.remaining}</b><small>متبقٍ من {service.limit}</small><i style={{ "--usage": `${Math.min(100, service.limit ? service.used / service.limit * 100 : 100)}%` } as React.CSSProperties}/></div>)}{status?.entitlement.tier === "free" ? <Link href="/meras-ai/subscribe"><Crown size={15}/> ترقية بـ {status.entitlement.monthlyPrice} ر.س</Link> : null}</div>

        {notice ? <div className={`${styles.notice} ${styles[notice.tone]}`}>{notice.tone === "ok" ? <Check size={17}/> : <CircleAlert size={17}/>}<span>{notice.text}</span><button onClick={()=>setNotice(null)} aria-label="إغلاق"><X size={16}/></button></div> : null}

        <div className={styles.content}>
          <section className={styles.chatPanel}>
            {quiz ? <div className={styles.quizView}>
              <header><button onClick={()=>setQuiz(null)}><ArrowUpLeft size={17}/> العودة للمحادثة</button><span><BookOpenCheck size={18}/>{quiz.questions.length} أسئلة</span></header>
              <div className={styles.quizHero}><span><BrainCircuit size={25}/></span><div><small>اختبار تفاعلي</small><h2>{quiz.title}</h2><p>اختر إجابة كل سؤال ثم أرسل المحاولة لتظهر النتيجة والشرح.</p></div></div>
              <div className={styles.questions}>{quiz.questions.map((question, index) => { const result=quizResults[question.id]; return <article key={question.id} className={result ? result.isCorrect ? styles.correctQuestion : styles.wrongQuestion : ""}><div className={styles.questionHead}><span>{index+1}</span><h3>{question.question}</h3></div><div className={styles.choices}>{question.choices.map((choice, choiceIndex) => <button type="button" key={choiceIndex} disabled={Boolean(result)} className={`${quizAnswers[question.id]===choiceIndex ? styles.selectedChoice : ""} ${result?.correctIndex===choiceIndex ? styles.correctChoice : ""} ${result?.selectedIndex===choiceIndex&&!result.isCorrect ? styles.wrongChoice : ""}`} onClick={()=>setQuizAnswers((current)=>({...current,[question.id]:choiceIndex}))}><i>{["أ","ب","ج","د"][choiceIndex]}</i><span>{choice}</span>{result?.correctIndex===choiceIndex ? <CheckCircle2 size={17}/> : null}</button>)}</div>{result ? <div className={styles.explanation}><b>{result.isCorrect ? "إجابة صحيحة" : "راجع الإجابة"}</b><p>{result.explanation}</p>{result.translatedExplanation ? <p>{result.translatedExplanation}</p> : null}{result.scientificTerms.length ? <div>{result.scientificTerms.map((term)=><span key={`${term.term}-${term.translation}`}>{term.term} · {term.translation}</span>)}</div> : null}</div> : null}</article>; })}</div>
              {!Object.keys(quizResults).length ? <button className={styles.submitQuiz} disabled={busy==="attempt"} onClick={()=>void submitQuiz()}>{busy==="attempt"?<LoaderCircle className={styles.spin} size={18}/>:<CheckCircle2 size={18}/>} إرسال المحاولة</button> : <button className={styles.submitQuiz} onClick={()=>{setQuizAnswers({});setQuizResults({});setNotice(null);}}><Plus size={18}/> محاولة جديدة</button>}
            </div> : <>
              {!displayMessages.length && !artifacts.length ? <div className={styles.welcome}>
                <span className={styles.spark}><Sparkles size={31}/></span><small>مساعدك الدراسي من مراس</small><h2>كيف أساعدك اليوم؟</h2><p>اسأل عن فكرة، أو ارفع شرائحك لتحصل على ملخص وترجمة واختبار تفاعلي.</p>
                <div className={styles.starters}><button onClick={()=>setText("اشرح لي مفهومًا صعبًا بطريقة مبسطة مع مثال")}>اشرح لي ببساطة</button><button onClick={()=>fileInput.current?.click()}>لخّص ملف المحاضرة</button><button onClick={()=>fileInput.current?.click()}>أنشئ اختبارًا من الشرائح</button></div>
              </div> : null}
              <div className={styles.messages}>{displayMessages.map((message) => <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.aiMessage}>{message.role === "assistant" ? <span><Sparkles size={16}/></span> : null}<div><small>{message.role === "assistant" ? "مراس AI" : "أنت"}</small><p>{message.content}</p></div></article>)}{busy==="chat" ? <article className={styles.aiMessage}><span><Sparkles size={16}/></span><div><small>مراس AI</small><p className={styles.thinking}><i/><i/><i/></p></div></article> : null}<div ref={endRef}/></div>
              {artifacts.length ? <div className={styles.artifacts}><h3><FileText size={17}/> نتائج محفوظة</h3>{artifacts.map((artifact)=><details key={artifact.id}><summary><span>{artifact.kind === "summary" ? <BookOpenCheck size={17}/> : <Languages size={17}/>}<b>{artifact.title}</b></span><small>{new Date(artifact.createdAt).toLocaleDateString("ar-SA")}</small></summary><pre>{artifact.content}</pre></details>)}</div> : null}
            </>}
          </section>

          <aside className={styles.toolsPanel}>
            <div className={styles.toolsHeading}><span><Sparkles size={17}/></span><div><b>أدوات الملفات</b><small>PDF أو صور أو نصوص</small></div></div>
            <input ref={fileInput} hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.md" onChange={(event)=>void upload(event.target.files?.[0])}/>
            <button className={styles.uploadButton} onClick={()=>fileInput.current?.click()} disabled={busy==="upload"}>{busy==="upload"?<LoaderCircle className={styles.spin} size={22}/>:<FileUp size={22}/>}<span><b>ارفع ملف المحاضرة</b><small>مع فحص أمني قبل المعالجة</small></span></button>
            <p className={styles.fileGuidance}><CircleAlert size={14}/>{status?.documentGuidance.message || "صدّر PowerPoint أو Word إلى PDF أولًا للحفاظ على الشرائح والمخططات والجداول بدقة."}</p>
            <label className={styles.languageField}>لغة الترجمة<input value={targetLanguage} maxLength={60} onChange={(event)=>setTargetLanguage(event.target.value)} /></label>
            <label className={styles.questionField}>عدد أسئلة الاختبار<div><input type="range" min="5" max="20" value={questionCount} onChange={(event)=>setQuestionCount(Number(event.target.value))}/><b>{questionCount}</b></div></label>
            <div className={styles.fileList}>{files.map((file)=><article key={file.id}><header><span><Paperclip size={16}/></span><div><b>{file.originalName}</b><small>{sizeLabel(file.sizeBytes)} · {file.scanStatus === "clean" ? "آمن" : "قيد الفحص"}</small></div></header><div><button disabled={Boolean(busy)||file.scanStatus==="quarantined"} onClick={()=>void runAction(file,"summary")}><BookOpenCheck size={15}/> تلخيص</button><button disabled={Boolean(busy)||file.scanStatus==="quarantined"} onClick={()=>void runAction(file,"translation")}><Languages size={15}/> ترجمة</button><button disabled={Boolean(busy)||file.scanStatus==="quarantined"} onClick={()=>void runAction(file,"quiz")}><BrainCircuit size={15}/> اختبار</button></div>{busy.endsWith(`:${file.id}`)?<p><LoaderCircle className={styles.spin} size={15}/> يجري تحليل الملف بدقة…</p>:null}</article>)}</div>
            {!files.length ? <div className={styles.fileEmpty}><FileText size={25}/><p>ارفع ملفًا لتظهر أدوات التلخيص والترجمة والاختبار.</p></div> : null}
          </aside>
        </div>

        {!quiz ? <footer className={styles.composer}><button onClick={()=>fileInput.current?.click()} aria-label="إرفاق ملف"><Paperclip size={20}/></button><textarea rows={1} value={text} onChange={(event)=>setText(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();}}} placeholder="اسأل مراس AI…"/><button className={styles.send} disabled={text.trim().length<2||Boolean(busy)} onClick={()=>void send()} aria-label="إرسال">{busy==="chat"?<LoaderCircle className={styles.spin} size={20}/>:<Send size={20}/>}</button></footer> : null}
      </div>
    </section>
  </div>;
}
