import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, EmptyState, Screen } from "@/src/components/ui";
import { StudyFileTools } from "@/src/components/study-file-tools";
import { useAuth } from "@/src/providers/AuthProvider";

export default function StudyToolScreen() {
  const { action } = useLocalSearchParams<{ action?: string }>();
  const { user } = useAuth();
  return <Screen><AppHeader title="أدوات مراس" back/>{!user ? <EmptyState title="سجّل الدخول أولًا" text="ملفاتك ونتائجك محفوظة لحسابك فقط." action={<AppButton title="تسجيل الدخول" onPress={() => router.replace("/(auth)/login")}/>}/> : action === "summary" || action === "translation" || action === "quiz" ? <StudyFileTools key={`${user.id}.${action}`} action={action}/> : <EmptyState title="الأداة غير موجودة" text="ارجع واختر أداة من أدوات مراس."/>}</Screen>;
}
