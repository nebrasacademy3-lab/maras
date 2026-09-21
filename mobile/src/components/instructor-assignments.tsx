import React from "react";
import {View} from "react-native";
import {router,type Href} from "expo-router";
import {useQuery} from "@tanstack/react-query";
import {AppButton,Card,SectionTitle} from "@/src/components/ui";
import {ScaledText as Text} from "@/src/components/ScaledText";
import {api} from "@/src/lib/api";
import {INSTRUCTOR_ASSIGNMENT_LABELS,type InstructorAssignment} from "@/src/lib/instructor-assignments";
import {useTheme} from "@/src/providers/ThemeProvider";
export function InstructorAssignments({userId}:{userId:number}){
 const {colors}=useTheme(),query=useQuery({queryKey:["instructor-assignments",userId],queryFn:({signal})=>api<{assignments:InstructorAssignment[]}>("/api/instructor/assignments",{signal}),retry:false,staleTime:15000});
 return <View style={{gap:12,marginVertical:20}}><SectionTitle title="المواد المسندة إليك" subtitle="أنشئ الوحدات والدروس ثم أرسلها إلى الإدارة للمراجعة والنشر" />{query.isLoading?<Text style={{color:colors.textSoft}}>جارٍ تحميل المواد…</Text>:query.isError?<Text style={{color:colors.danger}}>{query.error instanceof Error?query.error.message:"تعذر تحميل المواد"}</Text>:query.data?.assignments.length?query.data.assignments.map(item=><Card key={item.id} style={{gap:10}}><Text style={{color:colors.text,fontSize:20,fontWeight:"800",textAlign:"right"}}>{item.courseTitle}</Text><Text style={{color:colors.primary,textAlign:"right"}}>{INSTRUCTOR_ASSIGNMENT_LABELS[item.status]||item.status}</Text><AppButton title="فتح ملفات المادة ودروسها" variant="soft" onPress={()=>router.push({pathname:"/instructor-assignment/[id]",params:{id:String(item.id)}} as Href)} /></Card>):<Card><Text style={{color:colors.textSoft,textAlign:"right",lineHeight:25}}>تظهر المواد هنا بعد اعتماد العقد وإسنادها من الإدارة.</Text></Card>}<AppButton title="تحديث المواد" variant="ghost" loading={query.isFetching} onPress={()=>void query.refetch()} /></View>;
}
