import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, SUBSCRIPTION_ACCESS_MESSAGE } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
const tools = [
  { action: "summary", icon: "sparkles-outline", title: "تلخيص الملف", text: "ملخص منظم يحافظ على الأفكار والمصطلحات، مع تنزيل PDF." },
  { action: "translation", icon: "language-outline", title: "ترجمة أكاديمية", text: "ترجمة النص والمصطلحات والمعادلات مع الاحتفاظ بالتنسيق." },
  { action: "quiz", icon: "help-circle-outline", title: "إنشاء الاختبارات", text: "بطاقات تفاعلية مع الصعوبة والترجمة وشرح الإجابات." },
] as const;
export default function MerasAiScreen() {
  const { user } = useAuth(), { colors } = useTheme();
  const status = useQuery({ queryKey: ["ai-status",user?.id], queryFn: ({signal}) => api<{services:Record<string,{enabled:boolean;remaining:number}>}>("/api/ai/status",{signal}), enabled:Boolean(user) });
  const history = useQuery({ queryKey:["ai-conversations",user?.id],queryFn:({signal})=>api<{conversations:{id:number;title:string;kind:string}[]}>("/api/ai/conversations",{signal}),enabled:Boolean(user) });
  if(!user)return <Screen><AppHeader title="أدوات مراس"/><EmptyState title="سجّل الدخول أولًا" text="ملخصاتك وترجماتك واختباراتك محفوظة لحسابك." action={<AppButton title="تسجيل الدخول" onPress={()=>router.push("/(auth)/login")}/>}/></Screen>;
  return <Screen><AppHeader title="أدوات مراس" subtitle="ثلاث أدوات، رحلة مذاكرة أوضح"/>
    <Card><Text style={{color:colors.text,fontSize:22,fontWeight:"800"}}>من المحاضرة إلى الفهم</Text><Text style={{color:colors.textSoft,lineHeight:25}}>المعلم الذكي موجود تحت فيديو الدرس، ويجيب من ملفه المعتمد. هنا أدوات ملفاتك الشخصية.</Text><Text style={{color:colors.textSoft,lineHeight:23}}>{SUBSCRIPTION_ACCESS_MESSAGE}</Text></Card>
    {status.isLoading?<LoadingState label="جارٍ تحميل الأدوات…"/>:status.isError?<EmptyState title="تعذر تحميل الحصة" text={status.error.message} action={<AppButton title="إعادة المحاولة" onPress={()=>void status.refetch()}/>}/>:<View style={{gap:14,marginTop:16}}>{tools.map(item=><Pressable key={item.action} accessibilityRole="button" accessibilityLabel={item.title} onPress={()=>router.push({pathname:"/ai/tool/[action]",params:{action:item.action}})}><Card style={{gap:10}}><Ionicons name={item.icon} size={30} color={colors.primary}/><Text style={{color:colors.text,fontSize:20,fontWeight:"800"}}>{item.title}</Text><Text style={{color:colors.textSoft,lineHeight:24}}>{item.text}</Text><Text style={{color:colors.primary}}>{status.data?.services[item.action]?.enabled ? `المتبقي: ${status.data.services[item.action]?.remaining ?? 0}` : "متوقفة مؤقتًا"} · فتح الأداة</Text></Card></Pressable>)}</View>}
    <SectionTitle title="نتائجك السابقة"/>{history.data?.conversations.filter(row=>!row.kind.startsWith("lesson_tutor:")).map(row=><AppButton key={row.id} title={row.title} variant="soft" onPress={()=>router.push({pathname:"/ai/conversation/[id]",params:{id:String(row.id)}})}/>)}
    {history.isError&&<Text style={{color:colors.danger}}>تعذر تحميل السجل؛ أدواتك ما زالت متاحة.</Text>}
  </Screen>;
}
