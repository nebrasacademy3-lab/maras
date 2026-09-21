import { AccountMfaPanel } from "@/src/components/account-mfa-panel";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { RegisteredDevices } from "@/src/components/RegisteredDevices";
import { PasswordChange } from "@/src/components/PasswordChange";
import { DeleteAccountPanel } from "@/src/components/delete-account-panel";
import { AppButton, Card, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
export default function Security() {
  const {colors}=useTheme(),{logout}=useAuth();
  return <Screen><AppHeader title="الأمان والخصوصية" subtitle="تحكم كامل في حسابك" back /><Card style={{gap:12}}><Ionicons name="shield-checkmark-outline" size={31} color={colors.success} /><Text style={{color:colors.text,fontSize:19,fontWeight:"800",textAlign:"right"}}>جلسة آمنة على هذا الجهاز</Text><Text style={{color:colors.textSoft,fontSize:14,lineHeight:25,textAlign:"right"}}>رمز الدخول محفوظ في التخزين الآمن للنظام ولا يُرسل إلا إلى خادم مراس عبر HTTPS. يمكنك تسجيل الخروج لإلغاء الجلسة الحالية.</Text><AppButton title="تسجيل الخروج من الجهاز" variant="soft" onPress={()=>{void logout().finally(()=>router.replace("/(auth)/welcome"));}} /></Card><RegisteredDevices /><PasswordChange /><AccountMfaPanel /><DeleteAccountPanel /></Screen>;
}
