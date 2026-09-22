"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { AiQuizAttemptResult, AiQuizPayload } from "@/lib/ai-contracts";
import { studyJson } from "@/lib/ai-job-client";
import styles from "./study-tools.module.css";

type Attempt = { attempt: { score: number; total: number; percent: number }; results: AiQuizAttemptResult[] };
export function AiQuizRunner({ quiz, onClose }: { quiz: AiQuizPayload; onClose?: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const question = quiz.questions[index];
  const answered = Object.keys(answers).length;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [index, attempt]);
  async function submit() {
    if (busy || answered !== quiz.questions.length) return;
    setBusy(true); setError("");
    try {
      setAttempt(await studyJson<Attempt>(`/api/ai/quizzes/${quiz.id}/attempts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: Object.entries(answers).map(([questionId, choiceIndex]) => ({ questionId, choiceIndex })) }) }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تصحيح الاختبار"); }
    finally { setBusy(false); }
  }
  if (!question) return <p role="alert">الاختبار لا يحتوي أسئلة صالحة.</p>;
  return <section className={styles.quiz} dir="rtl" aria-label="اختبار ذاتي">
    <header className={styles.panelHeader}><div><span className={styles.eyebrow}>اختبر فهمك · {quiz.questions.length} أسئلة</span><h2>{quiz.title}</h2></div>{onClose && <button className={styles.secondary} type="button" onClick={onClose}>العودة للأدوات</button>}</header>
    {attempt ? <>
      <div className={styles.score} role="status"><CheckCircle2 size={35}/><strong>{attempt.attempt.percent}٪</strong><h3 ref={heading} tabIndex={-1}>{attempt.attempt.score} إجابات صحيحة من {attempt.attempt.total}</h3><p>الهدف فهم الأخطاء، وليس الدرجة فقط.</p></div>
      <div className={styles.actions}><button className={styles.primary} onClick={() => { setAttempt(null); setAnswers({}); setIndex(0); setError(""); setOnlyWrong(false); }}><RotateCcw size={17}/> إعادة الاختبار دون توليد جديد</button><label className={styles.check}><input type="checkbox" checked={onlyWrong} onChange={event => setOnlyWrong(event.target.checked)}/> مراجعة الأخطاء فقط</label></div>
      <div className={styles.review}>{quiz.questions.map((item, i) => {
        const result = attempt.results.find(row => row.questionId === item.id);
        if (!result || onlyWrong && result.isCorrect) return null;
        return <article key={item.id} className={styles.questionCard}><span className={result.isCorrect ? styles.correct : styles.incorrect}>{result.isCorrect ? <CheckCircle2 size={18}/> : <XCircle size={18}/>} {result.isCorrect ? "صحيحة" : "تحتاج مراجعة"} · السؤال {i + 1}</span><h3 dir="auto">{item.question}</h3><p><b>الإجابة الصحيحة:</b> <span dir="auto">{item.choices[result.correctIndex]}</span></p>{!result.isCorrect && result.selectedIndex !== null && <p><b>إجابتك:</b> <span dir="auto">{item.choices[result.selectedIndex]}</span></p>}<div className={styles.explanation}><b>شرح الإجابة</b><p dir="auto">{result.explanation}</p>{result.translatedExplanation && <p dir="auto">{result.translatedExplanation}</p>}{result.scientificTerms?.length > 0 && <div className={styles.terms}>{result.scientificTerms.map((term, n) => <span key={n}><bdi>{term.term}</bdi> · <bdi>{term.translation}</bdi></span>)}</div>}</div></article>;
      })}{onlyWrong && attempt.attempt.score === attempt.attempt.total && <p>أحسنت! أجبت عن جميع الأسئلة بشكل صحيح.</p>}</div>
    </> : <>
      <div className={styles.progressLabel}><b>السؤال {index + 1} من {quiz.questions.length}</b><span>{answered} مجاب</span></div><progress className={styles.progress} value={answered} max={quiz.questions.length} aria-label="تقدم الإجابات"/>
      <article className={styles.questionCard}><h3 ref={heading} tabIndex={-1} dir="auto">{question.question}</h3><div className={styles.choices} role="radiogroup" aria-label="اختر الإجابة">{question.choices.map((choice, i) => <label key={`${question.id}-${i}`} data-selected={answers[question.id] === i}><input type="radio" name={`question-${quiz.id}-${question.id}`} checked={answers[question.id] === i} onChange={() => setAnswers(current => ({ ...current, [question.id]: i }))} disabled={busy}/><span className={styles.letter}>{["أ", "ب", "ج", "د"][i]}</span><span dir="auto">{choice}</span></label>)}</div></article>
      <nav className={styles.questionNumbers} aria-label="الانتقال بين الأسئلة">{quiz.questions.map((item, i) => <button type="button" key={item.id} aria-current={index === i ? "step" : undefined} aria-label={`السؤال ${i + 1}${answers[item.id] !== undefined ? "، مجاب" : "، دون إجابة"}`} data-answered={answers[item.id] !== undefined} disabled={busy} onClick={() => setIndex(i)}>{i + 1}</button>)}</nav>
      <div className={styles.actions}><button className={styles.secondary} disabled={index === 0 || busy} onClick={() => setIndex(index - 1)}><ArrowRight size={17}/> السابق</button>{index < quiz.questions.length - 1 ? <button className={styles.primary} disabled={busy} onClick={() => setIndex(index + 1)}>التالي <ArrowLeft size={17}/></button> : <button className={styles.primary} disabled={busy || answered !== quiz.questions.length} onClick={() => void submit()}>{busy ? "جارٍ التصحيح…" : "إنهاء الاختبار وعرض النتيجة"}</button>}</div>
      {answered < quiz.questions.length && index === quiz.questions.length - 1 && <p className={styles.hint}>أجب عن كل الأسئلة قبل التصحيح. أرقام الأسئلة توضح ما تبقى.</p>}
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
