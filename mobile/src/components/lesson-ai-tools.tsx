import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { View } from "react-native";
import { ScaledText as Text } from "./ScaledText";
import { AppButton, Card, EmptyState, Field, LoadingState } from "./ui";
import { StudyFileTools } from "./study-file-tools";
import { StudyRichText } from "./study-rich-text";
import { AiReportButton } from "./AiReportButton";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
type Resource={id:number;title:string;contentType:string;lessonId:string|null};
type Message={id:number;role:string;content:string;createdAt:string};
type Thread={messages:Message[];source:{title:string;version:string};conversationId:number|null};
export function LessonAiTools({courseSlug,lessonId,mode}:{courseSlug:string;lessonId:string;mode:"quiz"|"tutor"}) {
  const {user}=useAuth();
  const query=useQuery({queryKey:["lesson-ai-resources",user?.id,courseSlug,lessonId],queryFn:({signal})=>api<{resources:Resource[]}>(`/api/course-resources?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`,{signal}),enabled:Boolean(user)});
  if(!user)return <EmptyState title="سجّل الدخول لاستخدام أدوات الدرس" text="تتاح الأدوات عند وجود اشتراك وملف معتمد لهذا الدرس."/>;
  if(query.isLoading)return <LoadingState label="نجهّز ملف الدرس المعتمد…"/>;
  if(!query.data)return <EmptyState title="تعذر تحميل ملف الدرس" text={query.error?.message||"حاول مجددًا"} action={<AppButton title="إعادة المحاولة" onPress={()=>void query.refetch()}/>}/>;
  const supported=query.data.resources.filter(file=>/pdf|wordprocessingml|presentationml|text\/|image\/(png|jpeg)/.test(file.contentType));
  const specific=supported.filter(file=>file.lessonId===lessonId), files=specific.length?specific:supported.filter(file=>!file.lessonId);
  if(!files.length)return <EmptyState title="بانتظار ملف الدرس" text="تتاح الأداة عند ربط الإدارة ملفًا مدعومًا واعتماده. لن تحتاج لإعادة رفع الملف."/>;
  return mode==="quiz"?<StudyFileTools action="quiz" resources={files} scope={`${courseSlug}.${lessonId}`}/>:<TutorFiles key={`${user.id}:${lessonId}:${files.map(file=>file.id).join(",")}`} files={files} lessonId={lessonId} userId={user.id}/>;
}
function TutorFiles({files,lessonId,userId}:{files:Resource[];lessonId:string;userId:number}) {
  const [selected,setSelected]=useState(files[0]!.id),{colors}=useTheme();
  return <View style={{gap:14}}><Text style={{color:colors.primary,fontSize:24,fontWeight:"800"}}>المعلم الذكي</Text><Text style={{color:colors.textSoft,lineHeight:25}}>المرجع الوحيد هو ملف الدرس المعتمد. إذا لم يتضمن الإجابة سيصرّح المعلم بذلك. راجع الإجابات مع مقررك.</Text>{files.length>1?<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{files.map(file=><AppButton key={file.id} title={file.title} full={false} variant={selected===file.id?"primary":"soft"} onPress={()=>setSelected(file.id)}/>)}</View>:<Text style={{color:colors.text}}>المصدر: {files[0]!.title}</Text>}<Tutor key={`${userId}:${lessonId}:${selected}`} resourceId={selected} lessonId={lessonId} userId={userId}/></View>;
}
function Tutor({resourceId,lessonId,userId}:{resourceId:number;lessonId:string;userId:number}) {
  const {colors}=useTheme(),cache=useQueryClient(),[text,setText]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[historyOffset,setHistoryOffset]=useState(0);
  const pending=useRef<AbortController|null>(null),path=`/api/course-resources/${resourceId}/tutor?lesson=${encodeURIComponent(lessonId)}`,key=["lesson-tutor",userId,lessonId,resourceId];
  const query=useQuery({queryKey:key,queryFn:({signal})=>api<Thread>(path,{signal}),staleTime:0});
  useEffect(()=>()=>pending.current?.abort(),[]);
  async function send(){if(busy||!query.data||text.trim().length<2)return;const controller=new AbortController();pending.current=controller;setBusy(true);setError("");try{const data=await api<Thread>(path,{method:"POST",body:jsonBody({text:text.trim(),requestId:Crypto.randomUUID()}),signal:controller.signal,timeoutMs:180000});if(!controller.signal.aborted){cache.setQueryData<Thread>(key,old=>({...data,messages:[...(old?.source.version===data.source.version?old.messages:[]),...data.messages]}));setText("");setHistoryOffset(0);}}catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"تعذر تجهيز الإجابة؛ سؤالك محفوظ في الحقل");}finally{if(!controller.signal.aborted)setBusy(false);}}
  // Keep a bounded number of native WebViews mounted even in a long conversation.
  const messages=query.data?.messages||[], start=Math.max(0,messages.length-12-historyOffset), visible=messages.slice(start,start+12);
  return <View style={{gap:14}}>{messages.length>12&&<View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}><AppButton title="رسائل أقدم" full={false} variant="soft" disabled={start===0} onPress={()=>setHistoryOffset(value=>Math.min(messages.length-12,value+12))}/><AppButton title="رسائل أحدث" full={false} variant="soft" disabled={historyOffset===0} onPress={()=>setHistoryOffset(value=>Math.max(0,value-12))}/><Text style={{color:colors.textSoft}}>{start+1}–{Math.min(start+12,messages.length)} / {messages.length}</Text></View>}{query.isLoading?<LoadingState label="جارٍ استعادة محادثتك…"/>:query.isError?<EmptyState title="تعذر استعادة المحادثة" text={query.error.message} action={<AppButton title="إعادة المحاولة" onPress={()=>void query.refetch()}/>}/>:!query.data?.messages.length?<Card style={{gap:12}}><Text style={{color:colors.text,fontSize:20,fontWeight:"700"}}>وش تحب نفهم من الدرس؟</Text>{["اشرح أهم أفكار هذا الدرس","اشرح معادلات الملف خطوة بخطوة","ما الفرق بين أهم المصطلحات؟"].map(value=><AppButton key={value} title={value} variant="soft" onPress={()=>setText(value)}/>)}</Card>:visible.map(item=><Card key={item.id} style={{gap:10,borderColor:item.role==="user"?colors.primary:colors.border,marginStart:item.role==="user"?16:0}}><Text style={{color:colors.primary,fontWeight:"800"}}>{item.role==="user"?"أنت":"المعلم الذكي"}</Text><StudyRichText content={item.content}/>{item.role==="assistant"&&<><Text style={{color:colors.textSoft}}>المرجع: {query.data?.source.title}</Text><AiReportButton source="message" reference={String(item.id)} content={item.content}/></>}</Card>)}
    {busy&&<LoadingState label="يقرأ المعلم ملف الدرس ويجهّز الشرح…"/>}{error&&<Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:25}}>{error}</Text>}
    <Field label="سؤالك عن الدرس" multiline numberOfLines={3} value={text} maxLength={8000} editable={!busy} onChangeText={setText} placeholder="اسأل عن فكرة، مصطلح أو معادلة…"/><AppButton title="إرسال السؤال" icon="send-outline" disabled={busy||!query.data||text.trim().length<2} loading={busy} onPress={()=>void send()}/>
  </View>;
}
