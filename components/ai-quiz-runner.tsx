"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, XCircle, Languages, Bookmark } from "lucide-react";
import type { AiQuizAttemptResult, AiQuizPayload } from "@/lib/ai-contracts";
import { studyJson } from "@/lib/ai-job-client";
import { StudyRichText } from "./study-rich-text";
import styles from "./study-tools.module.css";
type Attempt = { attempt: { score: number; total: number; percent: number }; results: AiQuizAttemptResult[] };
export function AiQuizRunner({ quiz, onClose }: { quiz: AiQuizPayload; onClose?: () => void }) {
  const [answers,setAnswers]=useState<Record<string,number>>({}), [index,setIndex]=useState(0), [attempt,setAttempt]=useState<Attempt|null>(null);
  const [feedback,setFeedback]=useState<Record<string,AiQuizAttemptResult>>({}), [marked,setMarked]=useState<Set<string>>(new Set()), [translated,setTranslated]=useState(false), [onlyWrong,setOnlyWrong]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState("");
  const pending=useRef<AbortController|null>(null), heading=useRef<HTMLHeadingElement>(null);
  const question=quiz.questions[index], answered=Object.keys(answers).length;
  useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[index,attempt]);
  async function check(final=false) {
    if(busy||!question||final&&answered!==quiz.questions.length||!final&&answers[question.id]===undefined)return;
    const controller=new AbortController();pending.current=controller;setBusy(true);setError("");
    try {
      if(final){const value=await studyJson<Attempt>(`/api/ai/quizzes/${quiz.id}/attempts`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({answers:quiz.questions.map(q=>({questionId:q.id,choiceIndex:answers[q.id]}))}),signal:controller.signal});if(!controller.signal.aborted)setAttempt(value);}
      else {const value=await studyJson<{result:AiQuizAttemptResult}>(`/api/ai/quizzes/${quiz.id}/feedback`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({questionId:question.id,choiceIndex:answers[question.id]}),signal:controller.signal});if(!controller.signal.aborted)setFeedback(current=>({...current,[question.id]:value.result}));}
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"تعذر التصحيح");}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  function restart(){setAttempt(null);setFeedback({});setAnswers({});setIndex(0);setOnlyWrong(false);setError("");}
  const explanation=(q:AiQuizPayload["questions"][number],r:AiQuizAttemptResult)=><div className={styles.explanation}><span className={r.isCorrect?styles.correct:styles.incorrect}>{r.isCorrect?<CheckCircle2 size={18}/>:<XCircle size={18}/>} {r.isCorrect?"إجابة صحيحة":"نراجعها معًا"}</span><b>الإجابة الصحيحة</b><StudyRichText content={q.choices[r.correctIndex] || ""}/><b>لماذا؟</b><StudyRichText content={translated&&r.translatedExplanation?r.translatedExplanation:r.explanation}/>{r.scientificTerms?.length>0&&<div className={styles.terms}>{r.scientificTerms.map(term=><span key={term.term}><bdi>{term.term}</bdi> · <bdi>{term.translation}</bdi></span>)}</div>}</div>;
  if(!question)return <p role="alert">لا توجد أسئلة صالحة.</p>;
  return <section className={styles.quiz} dir="rtl" aria-label="اختبر نفسك"><header className={styles.panelHeader}><div><span className={styles.eyebrow}>سؤال في كل بطاقة · {quiz.questions.length} أسئلة</span><h2 ref={heading} tabIndex={-1}>{quiz.title}</h2></div>{onClose&&<button className={styles.secondary} onClick={onClose}>إعداد اختبار آخر</button>}</header>
    <div className={styles.actions}><button className={styles.secondary} aria-pressed={translated} onClick={()=>setTranslated(value=>!value)}><Languages size={18}/>{translated?"النص الأصلي":"إظهار الترجمة"}</button><small>الترجمة متاحة للأسئلة الجديدة، والتصحيح والشرح من الخادم.</small></div>
    {attempt?<><div className={styles.score} role="status"><CheckCircle2 size={34}/><strong>{attempt.attempt.percent}٪</strong><h3>{attempt.attempt.score} من {attempt.attempt.total}</h3><p>نتيجة تدريبية محفوظة · إجاباتك تثبت بعد عرض الشرح.</p></div><div className={styles.actions}><button className={styles.primary} onClick={restart}><RotateCcw size={16}/> إعادة دون توليد جديد</button><label className={styles.check}><input type="checkbox" checked={onlyWrong} onChange={event=>setOnlyWrong(event.target.checked)}/> الأخطاء فقط</label></div>{quiz.questions.map((q,i)=>{const r=attempt.results.find(row=>row.questionId===q.id);return r&&(!onlyWrong||!r.isCorrect)?<article className={styles.questionCard} key={q.id}><h3>السؤال {i+1}{marked.has(q.id)?" · للمراجعة":""}</h3><StudyRichText content={translated&&q.translatedQuestion?q.translatedQuestion:q.question}/>{explanation(q,r)}</article>:null;})}{onlyWrong&&attempt.attempt.score===attempt.attempt.total&&<p>أحسنت! لا توجد أخطاء.</p>}</>:<>
      <div className={styles.progressLabel}><b>السؤال {index+1} من {quiz.questions.length}</b><span>{answered} مجاب</span></div><progress className={styles.progress} value={answered} max={quiz.questions.length} aria-label="تقدم الإجابات"/>
      <article className={styles.questionCard}><div className={styles.actions}><h3>السؤال {index+1}</h3><button className={styles.secondary} aria-pressed={marked.has(question.id)} onClick={()=>setMarked(current=>{const next=new Set(current);if(next.has(question.id))next.delete(question.id);else next.add(question.id);return next;})}><Bookmark size={16}/>{marked.has(question.id)?"محدد للمراجعة":"علّمه للمراجعة"}</button></div><StudyRichText content={translated&&question.translatedQuestion?question.translatedQuestion:question.question}/>
      <div className={styles.choices} role="radiogroup" aria-label="اختر الإجابة">{question.choices.map((choice,i)=><label key={`${question.id}:${i}`} data-selected={answers[question.id]===i}><input type="radio" name={`quiz-${quiz.id}-${question.id}`} checked={answers[question.id]===i} disabled={busy||Boolean(feedback[question.id])} onChange={()=>setAnswers(current=>({...current,[question.id]:i}))}/><span className={styles.letter}>{["أ","ب","ج","د"][i]}</span><StudyRichText content={translated&&question.translatedChoices?.[i]?question.translatedChoices[i]:choice}/></label>)}</div>
      {feedback[question.id]?explanation(question,feedback[question.id]):<button className={styles.secondary} disabled={busy||answers[question.id]===undefined} onClick={()=>void check()}>تحقق من إجابتي واشرحها</button>}</article>
      <nav className={styles.questionNumbers} aria-label="التنقل بين الأسئلة">{quiz.questions.map((q,i)=><button key={q.id} aria-current={index===i?"step":undefined} aria-label={`السؤال ${i+1}${marked.has(q.id)?" للمراجعة":""}`} data-answered={answers[q.id]!==undefined} onClick={()=>setIndex(i)}>{i+1}{marked.has(q.id)?" ✦":""}</button>)}</nav>
      <div className={styles.actions}><button className={styles.secondary} disabled={!index||busy} onClick={()=>setIndex(index-1)}><ArrowRight size={17}/> السابق</button>{index<quiz.questions.length-1?<button className={styles.primary} disabled={busy} onClick={()=>setIndex(index+1)}>التالي <ArrowLeft size={17}/></button>:<button className={styles.primary} disabled={busy||answered!==quiz.questions.length} onClick={()=>void check(true)}>{busy?"جارٍ التصحيح…":"إنهاء وحفظ النتيجة"}</button>}</div>{index===quiz.questions.length-1&&answered!==quiz.questions.length&&<p className={styles.hint}>أكمل الأسئلة التي لم تُجب عنها قبل حفظ النتيجة.</p>}
    </>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
