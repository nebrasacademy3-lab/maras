import React from "react";
import { AiReportButton } from "@/src/components/AiReportButton";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StudyArtifactDownload } from "@/src/components/study-file-tools";
import { StudyRichText } from "@/src/components/study-rich-text";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { api } from "@/src/lib/api";
export default function SavedStudyResults(){const {id}=useLocalSearchParams<{id:string}>(),{user}=useAuth(),{colors}=useTheme();const query=useQuery({queryKey:["study-history",user?.id,id],queryFn:({signal})=>api<{conversation:{title:string};artifacts:{id:number;title:string;content:string}[];quizzes:{id:number;title:string}[]}>(`/api/ai/conversations/${id}`,{signal}),enabled:Boolean(user&&Number.isSafeInteger(Number(id))&&Number(id)>0)});return <Screen><AppHeader title="نتائج الملف المحفوظة" back/>{query.isLoading?<LoadingState label="جارٍ استعادة النتائج…"/>:!query.data?<EmptyState title="تعذر فتح النتائج" text={query.error?.message||"سجّل الدخول وافتح السجل من أدوات مراس."}/>:<View style={{gap:18}}><Text style={{color:colors.text,fontSize:22,fontWeight:"800"}}>{query.data.conversation.title}</Text>{query.data.artifacts.map(item=><Card key={item.id} style={{gap:12}}><Text style={{color:colors.primary,fontWeight:"700"}}>{item.title}</Text><StudyRichText content={item.content}/><StudyArtifactDownload id={item.id}/><AiReportButton source="artifact" reference={String(item.id)} content={item.content}/></Card>)}{query.data.quizzes?.map(item=><AppButton key={item.id} title={item.title} onPress={()=>router.push({pathname:"/ai/quiz/[id]",params:{id:String(item.id)}})}/>)}<Text style={{color:colors.textSoft,lineHeight:24}}>المعلم الذكي مرتبط بالدرس؛ افتحه من تحت فيديو المادة لبدء النقاش.</Text></View>}</Screen>;}
