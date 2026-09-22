import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, View } from "react-native";
import { ScaledText as Text } from "./ScaledText";
import { AppButton, Card, LoadingState, EmptyState } from "./ui";
import { StudyRichText } from "./study-rich-text";
import { AiReportButton } from "./AiReportButton";
import { api, jsonBody } from "@/src/lib/api";
import type { AiQuizPayload, AiQuizAttemptResult } from "@/src/lib/ai-contracts";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
type Attempt = { attempt: { score: number; total: number; percent: number }; results: AiQuizAttemptResult[] };
export function InlineQuiz({ id }: { id:number }) {
  const { user } = useAuth();
  const query=useQuery({queryKey:["ai-quiz",user?.id,id],queryFn:({signal})=>api<{quiz:AiQuizPayload}>(`/api/ai/quizzes/${id}`,{signal}),enabled:Boolean(user)});
  if(query.isLoading)return <LoadingState label="نجهّز بطاقات الاختبار…"/>;
  if(!query.data)return <EmptyState title="تعذر فتح الاختبار" text={query.error?.message||"سجّل الدخول بحسابك لفتح الاختبار."} action={<AppButton title="إعادة المحاولة" onPress={()=>void query.refetch()}/>}/>;
  return <QuizCards key={`${user?.id}:${id}`} quiz={query.data.quiz}/>;
}
function QuizCards({ quiz }: { quiz:AiQuizPayload }) {
  const { colors }=useTheme();
  const [index,setIndex]=useState(0),[answers,setAnswers]=useState<Record<string,number>>({}),[feedback,setFeedback]=useState<Record<string,AiQuizAttemptResult>>({}),[attempt,setAttempt]=useState<Attempt|null>(null),[translated,setTranslated]=useState(false),[onlyWrong,setOnlyWrong]=useState(false),[marked,setMarked]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const question=quiz.questions[index],answered=Object.keys(answers).length;
  async function check(final=false) {
    if(busy||!question||final&&answered!==quiz.questions.length||!final&&answers[question.id]===undefined)return;
    const controller=new AbortController();pending.current=controller;setBusy(true);setError("");
    try {
      if(final){const value=await api<Attempt>(`/api/ai/quizzes/${quiz.id}/attempts`,{method:"POST",body:jsonBody({answers:quiz.questions.map(q=>({questionId:q.id,choiceIndex:answers[q.id]}))}),signal:controller.signal});if(!controller.signal.aborted)setAttempt(value);}
      else {const value=await api<{result:AiQuizAttemptResult}>(`/api/ai/quizzes/${quiz.id}/feedback`,{method:"POST",body:jsonBody({questionId:question.id,choiceIndex:answers[question.id]}),signal:controller.signal});if(!controller.signal.aborted)setFeedback(current=>({...current,[question.id]:value.result}));}
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"تعذر تصحيح الإجابة");}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  const explain=(q:AiQuizPayload["questions"][number],r:AiQuizAttemptResult)=><Card style={{gap:12,borderColor:r.isCorrect?colors.success:colors.danger}}><Text style={{color:r.isCorrect?colors.success:colors.danger,fontWeight:"800"}}>{r.isCorrect?"إجابة صحيحة":"نراجعها معًا"}</Text><Text style={{color:colors.text,fontWeight:"700"}}>الإجابة الصحيحة</Text><StudyRichText content={q.choices[r.correctIndex]||""}/><Text style={{color:colors.primary,fontWeight:"700"}}>لماذا؟</Text><StudyRichText content={translated&&r.translatedExplanation?r.translatedExplanation:r.explanation}/>{r.scientificTerms?.map(term=><Text selectable key={term.term} style={{color:colors.textSoft,lineHeight:24}}>{term.term} · {term.translation}</Text>)}<AiReportButton source="quiz" reference={`${quiz.id}:${q.id}`} content={q.question+"\n"+r.explanation}/></Card>;
  if(!question)return <EmptyState title="لا توجد أسئلة" text="أعد فتح الاختبار من السجل."/>;
  return <View style={{gap:16,minWidth:0}}><Text accessibilityRole="header" style={{color:colors.text,fontWeight:"800",fontSize:21}}>{quiz.title}</Text><AppButton title={translated?"النص الأصلي":"إظهار الترجمة"} icon="language-outline" variant="soft" onPress={()=>setTranslated(value=>!value)}/>
    {attempt?<><Card style={{gap:12}}><Text style={{color:colors.primary,fontSize:38,fontWeight:"800"}}>{attempt.attempt.percent}%</Text><Text style={{color:colors.text}}>{attempt.attempt.score} إجابات صحيحة من {attempt.attempt.total}</Text><Text style={{color:colors.textSoft}}>نتيجة تدريبية محفوظة · لا تحتاج توليد اختبار جديد للإعادة.</Text><AppButton title="إعادة الاختبار" onPress={()=>{setAnswers({});setFeedback({});setAttempt(null);setIndex(0);setOnlyWrong(false);}}/><AppButton title={onlyWrong?"عرض كل الإجابات":"مراجعة الأخطاء فقط"} variant="soft" onPress={()=>setOnlyWrong(value=>!value)}/></Card>{quiz.questions.map((q,i)=>{const r=attempt.results.find(row=>row.questionId===q.id);return r&&(!onlyWrong||!r.isCorrect)?<Card key={q.id} style={{gap:12}}><Text style={{color:colors.textSoft}}>السؤال {i+1}{marked.has(q.id)?" · للمراجعة":""}</Text><StudyRichText content={translated&&q.translatedQuestion?q.translatedQuestion:q.question}/>{explain(q,r)}</Card>:null;})}{onlyWrong&&attempt.attempt.percent===100&&<Text style={{color:colors.success}}>أحسنت! لا توجد أخطاء.</Text>}</>:<>
      <Text accessibilityLiveRegion="polite" style={{color:colors.textSoft}}>السؤال {index+1} من {quiz.questions.length} · {answered} مجاب</Text><View accessibilityRole="progressbar" accessibilityValue={{min:0,max:quiz.questions.length,now:answered}} style={{height:7,borderRadius:8,backgroundColor:colors.surfaceAlt,overflow:"hidden"}}><View style={{width:`${answered/quiz.questions.length*100}%`,height:7,backgroundColor:colors.primary}}/></View>
      <Card style={{gap:14}}><AppButton title={marked.has(question.id)?"محدد للمراجعة ✦":"علّمه للمراجعة"} variant="ghost" icon="bookmark-outline" onPress={()=>setMarked(current=>{const next=new Set(current);if(next.has(question.id))next.delete(question.id);else next.add(question.id);return next;})}/><StudyRichText content={translated&&question.translatedQuestion?question.translatedQuestion:question.question}/>
      {question.choices.map((choice,i)=><View key={`${question.id}:${i}`} style={{borderWidth:2,borderColor:answers[question.id]===i?colors.primary:colors.border,borderRadius:14,padding:12,gap:8}}><Pressable accessibilityRole="radio" accessibilityLabel={`الخيار ${i+1}: ${choice}`} accessibilityState={{checked:answers[question.id]===i,disabled:busy||Boolean(feedback[question.id])}} disabled={busy||Boolean(feedback[question.id])} onPress={()=>setAnswers(current=>({...current,[question.id]:i}))} style={{minHeight:44,justifyContent:"center"}}><Text style={{color:colors.primary,fontWeight:"800"}}>{answers[question.id]===i?"◉":"○"} { ["أ","ب","ج","د"][i]} · اختيار هذه الإجابة</Text></Pressable><StudyRichText content={translated&&question.translatedChoices?.[i]?question.translatedChoices[i]!:choice}/></View>)}
      {feedback[question.id]?explain(question,feedback[question.id]!):<AppButton title="تحقق من إجابتي واشرحها" disabled={busy||answers[question.id]===undefined} loading={busy} variant="soft" onPress={()=>void check()}/>}</Card>
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{quiz.questions.map((q,i)=><AppButton key={q.id} full={false} title={`${i+1}${marked.has(q.id)?" ✦":""}`} variant={index===i?"primary":"soft"} onPress={()=>setIndex(i)}/>)}</View>
      <View style={{flexDirection:"row",gap:10,flexWrap:"wrap"}}><AppButton full={false} title="السابق" variant="soft" disabled={!index||busy} onPress={()=>setIndex(index-1)}/>{index<quiz.questions.length-1?<AppButton full={false} title="التالي" disabled={busy} onPress={()=>setIndex(index+1)}/>:<AppButton title="إنهاء وحفظ النتيجة" loading={busy} disabled={answered!==quiz.questions.length||busy} onPress={()=>void check(true)}/>}</View>{index===quiz.questions.length-1&&answered!==quiz.questions.length&&<Text style={{color:colors.textSoft}}>أكمل الأسئلة المتبقية قبل حفظ النتيجة.</Text>}
    </>}{error&&<Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:25}}>{error}</Text>}
  </View>;
}
