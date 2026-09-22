import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { ScaledText as Text } from "./ScaledText";
import { AppButton, Card, EmptyState, LoadingState } from "./ui";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { api } from "@/src/lib/api";
import { downloadProtectedFile } from "@/src/lib/downloads";
type Resource={id:number;lessonId:string|null;title:string;description:string;originalName:string;contentType:string;sizeBytes:number;downloadUrl:string};
export function LessonCourseFiles({courseSlug,lessonId}:{courseSlug:string;lessonId:string}) {
  const {user}=useAuth(),{colors}=useTheme(),[busy,setBusy]=useState<number|null>(null),[message,setMessage]=useState("");
  const pending=useRef<AbortController|null>(null);useEffect(()=>()=>pending.current?.abort(),[]);
  const query=useQuery({queryKey:["lesson-files",user?.id,courseSlug,lessonId],queryFn:({signal})=>api<{resources:Resource[]}>(`/api/course-resources?course=${encodeURIComponent(courseSlug)}`,{signal}),enabled:Boolean(user)});
  async function download(file:Resource){if(busy)return;const controller=new AbortController();pending.current=controller;setBusy(file.id);setMessage("");try{const result=await downloadProtectedFile({path:file.downloadUrl,fileName:file.originalName,mimeType:file.contentType,saveToFiles:true,signal:controller.signal});if(!controller.signal.aborted)setMessage(result.action==="cancelled"?"أُلغي الحفظ":"أصبح الملف جاهزًا للعرض أو الحفظ");}catch(reason){if(!controller.signal.aborted)setMessage(reason instanceof Error?reason.message:"تعذر تنزيل الملف");}finally{if(!controller.signal.aborted)setBusy(null);}}
  if(!user)return <EmptyState title="ملفات المادة" text="سجّل الدخول بحساب مشترك في المادة للوصول إلى ملفاتها."/>;
  if(query.isLoading)return <LoadingState label="جارٍ تحميل ملفات المادة…"/>;
  if(!query.data)return <EmptyState title="تعذر تحميل الملفات" text={query.error?.message||"حاول مجددًا"} action={<AppButton title="إعادة المحاولة" onPress={()=>void query.refetch()}/>}/>;
  const files=[...query.data.resources].sort((a,b)=>Number(b.lessonId===lessonId)-Number(a.lessonId===lessonId));
  return <View style={{gap:14}}><Text style={{color:colors.text,fontSize:22,fontWeight:"800"}}>ملفات المادة</Text><Text style={{color:colors.textSoft}}>ملف الدرس والملخصات والمراجع المعتمدة، في مكان واحد.</Text>{files.length?files.map(file=><Card key={file.id} style={{gap:10}}><Text style={{color:colors.primary}}>{file.lessonId===lessonId?"ملف هذا الدرس":!file.lessonId?"مشترك للمادة":"من ملفات المادة"}</Text><Text style={{color:colors.text,fontSize:18,fontWeight:"700"}}>{file.title}</Text><Text selectable style={{color:colors.textSoft,lineHeight:24}}>{file.description||file.originalName} · {(file.sizeBytes/1024/1024).toFixed(1)} م.ب</Text><AppButton title="تنزيل الملف" icon="download-outline" variant="soft" loading={busy===file.id} disabled={busy!==null} onPress={()=>void download(file)}/></Card>):<EmptyState title="بانتظار الملفات" text="ستظهر الملفات هنا بعد اعتمادها."/>}{message&&<Text accessibilityLiveRegion="polite" style={{color:colors.text,lineHeight:25}}>{message}</Text>}</View>;
}
