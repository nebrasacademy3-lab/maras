import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, Field, Screen } from "@/src/components/ui";
import { api, ApiError } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { PublicSettings } from "@/src/types";

export default function Login() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: PublicSettings }>("/api/public/settings"), staleTime: 5_000 });
  const registrationEnabled = settingsQuery.data?.settings.student_registration_enabled !== "false";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const result = await login({ identifier, password });
      router.replace(result.next === "/onboarding" ? "/onboarding" : result.next === "/complete-profile" ? "/complete-profile" : "/(tabs)");
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر تسجيل الدخول"); }
    finally { setLoading(false); }
  };

  return <Screen keyboard footer={false}>
    <AppHeader title="تسجيل الدخول" subtitle="أهلًا بعودتك إلى مراس" auth />
    <Card style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}> 
      <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}><Ionicons name="sparkles-outline" size={25} color={colors.primary} /></View>
      <View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.text }]}>تابع من حيث توقفت</Text><Text style={[styles.heroText, { color: colors.textSoft }]}>موادك وتقدمك وطلباتك وإشعاراتك ستظهر بعد الدخول من نفس الحساب على كل أجهزتك.</Text></View>
    </Card>

    <Card>
      <Text style={[styles.title, { color: colors.text }]}>دخول آمن إلى حسابك</Text>
      <Text style={[styles.copy, { color: colors.textSoft }]}>استخدم البريد الإلكتروني أو رقم الجوال المرتبط بحسابك.</Text>
      <Field label="البريد أو رقم الجوال" icon="person-outline" autoCapitalize="none" value={identifier} onChangeText={setIdentifier} placeholder="name@example.com أو 05xxxxxxxx" />
      <View><Field label="كلمة المرور" icon="lock-closed-outline" secureTextEntry={!show} value={password} onChangeText={setPassword} placeholder="••••••••••" /><Pressable accessibilityLabel={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onPress={() => setShow((value) => !value)} style={styles.eye}><Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSoft} /></Pressable></View>
      <Pressable onPress={() => router.push("/forgot-password")}><Text style={[styles.forgot, { color: colors.primary }]}>نسيت كلمة المرور؟</Text></Pressable>
      {error ? <View style={[styles.errorBox, { backgroundColor: `${colors.danger}10` }]}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={[styles.error, { color: colors.danger }]}>{error}</Text></View> : null}
      <AppButton title="دخول آمن" icon="shield-checkmark-outline" loading={loading} disabled={!identifier || password.length < 8} onPress={submit} />
      {registrationEnabled ? <View style={styles.signup}><Text style={{ color: colors.textSoft }}>ليس لديك حساب؟</Text><Pressable onPress={() => router.replace("/(auth)/register")}><Text style={{ color: colors.primary, fontWeight: "900" }}>أنشئ حسابك الآن</Text></Pressable></View> : <Text style={[styles.registrationNote, { color: colors.textSoft }]}>إنشاء الحسابات الجديدة متوقف مؤقتًا، والحسابات الحالية تعمل بشكل طبيعي.</Text>}
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row-reverse", alignItems: "center", gap: 11, marginBottom: 13 },
  heroIcon: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, alignItems: "flex-end" },
  heroTitle: { fontSize: 15, fontWeight: "900", textAlign: "right" },
  heroText: { fontSize: 9, lineHeight: 17, textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  title: { fontSize: 23, lineHeight: 33, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  copy: { fontSize: 11, lineHeight: 20, textAlign: "right", writingDirection: "rtl", marginTop: 4, marginBottom: 20 },
  eye: { position: "absolute", left: 15, top: 36, padding: 6 },
  forgot: { fontSize: 11, fontWeight: "800", textAlign: "left", marginTop: -6, marginBottom: 18 },
  errorBox: { flexDirection: "row-reverse", alignItems: "center", gap: 7, padding: 10, borderRadius: 12, marginBottom: 12 },
  error: { flex: 1, fontSize: 10, lineHeight: 18, textAlign: "right", fontWeight: "800" },
  signup: { flexDirection: "row-reverse", gap: 5, justifyContent: "center", marginTop: 20 },
  registrationNote: { fontSize: 9, lineHeight: 17, textAlign: "center", marginTop: 16, writingDirection: "rtl" },
});
