import React from "react";
import { useLocalSearchParams } from "expo-router";
import { AppHeader } from "@/src/components/AppHeader";
import { InlineQuiz } from "@/src/components/inline-quiz";
import { EmptyState, Screen } from "@/src/components/ui";
export default function QuizScreen(){const {id}=useLocalSearchParams<{id:string}>();const value=Number(id);return <Screen><AppHeader title="اختبر نفسك" back/>{Number.isSafeInteger(value)&&value>0?<InlineQuiz key={value} id={value}/>:<EmptyState title="رابط غير صالح" text="افتح الاختبار من أدوات مراس."/>}</Screen>;}
