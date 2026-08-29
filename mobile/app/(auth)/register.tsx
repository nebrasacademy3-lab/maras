import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/src/components/AppHeader";
import { FeatureDisabledState, FIRST_RUN_ONBOARDING_KEY, usePlatformControls } from "@/src/components/PlatformControls";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError } from "@/src/lib/api";
import { authGateHref, resolveAuthReturnRoute } from "@/src/lib/authReturnRoute";
import { syncOnboardingCompletion } from "@/src/lib/onboardingSync";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { ACADEMIC_LEVELS } from "@/src/constants/academic-levels";
import type { Catalog } from "@/src/types";

type ProgramsResponse = { programs: { name: string; degree: string; area: string }[] };
export default function Register() {
  const { register, refresh } = useAuth(); const { colors } = useTheme(); const controls = usePlatformControls();
  const { return_to: returnToParam } = useLocalSearchParams<{ return_to?: string | string[] }>(); const returnRoute = resolveAuthReturnRoute(returnToParam);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", universitySlug: "", specialty: "", academicLevel: "" });
  const programQuery = useQuery({ queryKey: ["programs", form.universitySlug], queryFn: () => api<ProgramsResponse>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`), enabled: Boolean(form.universitySlug) });
  const programs = programQuery.data?.programs || []; const programLoading = programQuery.isFetching; const [accepted, setAccepted] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  if (controls.loading || catalog.isLoading) return <Screen><LoadingState label="نجهّز الجامعات والتخصصات..." /></Screen>;
  if (!controls.enabled("registration")) return <Screen><AppHeader title="إنشاء حساب" auth /><FeatureDisabledState title="التسجيل متوقف مؤقتًا" message={controls.messageFor("أوقفت الإدارة إنشاء الحسابات الجديدة مؤقتًا. يمكنك تصفح المواد كضيف والعودة لاحقًا.")} /></Screen>;
  const institutions = catalog.data?.institutions || [];
  const submit = async () => { setLoading(true); setError(""); try { const result = await register({ ...form, termsAccepted: true }); let onboardingSeen = false; try { onboardingSeen = Boolean(await SecureStore.getItemAsync(FIRST_RUN_ONBOARDING_KEY)); } catch { /* A missing local value simply shows onboarding once. */ } if (result.next === "/complete-profile") { router.replace(authGateHref("/complete-profile", returnRoute)); return; } const explicitlyDisabled = controls.ready && !controls.enabled("onboarding"); if (result.next === "/onboarding" && !onboardingSeen && !explicitlyDisabled) { router.replace(authGateHref("/onboarding", returnRoute)); return; } if (result.next === "/onboarding" && (onboardingSeen || explicitlyDisabled) && await syncOnboardingCompletion(result.user)) await refresh(); router.replace(returnRoute?.href || "/(tabs)"); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر إنشاء الحساب"); } finally { setLoading(false); } };
  const valid = form.fullName.trim().length >= 5 && form.email.includes("@") && form.phone.replace(/\D/g, "").length >= 9 && form.password.length >= 10 && form.universitySlug && form.specialty && form.academicLevel && accepted;
  return <Screen keyboard><AppHeader title="إنشاء حساب" subtitle="ملف جامعي مكتمل من البداية" auth /><Text style={[styles.title, { color: colors.text }]}>ابدأ رحلتك مع مراس</Text><Text style={[styles.copy, { color: colors.textSoft }]}>ستظهر لك مواد تخصصك أولًا، ويمكنك تصفح وشراء مواد بقية الجامعات أيضًا.</Text><Field label="الاسم الكامل" icon="person-outline" value={form.fullName} onChangeText={(fullName) => setForm({ ...form, fullName })} placeholder="الاسم الرباعي" /><Field label="البريد الإلكتروني" icon="mail-outline" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(email) => setForm({ ...form, email })} placeholder="name@example.com" /><Field label="رقم الجوال السعودي" icon="call-outline" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="05xxxxxxxx" /><Field label="كلمة المرور" icon="lock-closed-outline" secureTextEntry value={form.password} onChangeText={(password) => setForm({ ...form, password })} placeholder="10 أحرف، رقم ورمز خاص" /><SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر جهتك التعليمية" items={institutions.map((item) => ({ key: item.slug, label: item.name, detail: `${item.region} · ${item.type}` }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key, specialty: "" })} /><SearchPicker label="التخصص" value={form.specialty} placeholder={programLoading ? "جارٍ تحميل التخصصات..." : "اختر تخصصك"} disabled={!form.universitySlug || programLoading} items={programs.map((item) => ({ key: item.name, label: item.name, detail: `${item.degree} · ${item.area}` }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} /><SearchPicker label="المستوى الدراسي" value={form.academicLevel} placeholder="اختر مستواك الحالي" items={ACADEMIC_LEVELS.map((level) => ({ key: level, label: level, detail: level === "خريج" ? "أنهيت الدراسة" : "مستوى دراسي" }))} onSelect={(item) => setForm({ ...form, academicLevel: item.key })} /><Pressable onPress={() => setAccepted((value) => !value)} style={styles.terms}><Ionicons name={accepted ? "checkbox" : "square-outline"} size={23} color={accepted ? colors.primary : colors.textSoft} /><Text style={[styles.termsText, { color: colors.textSoft }]}>أوافق على شروط الاستخدام وسياسة الخصوصية ومعالجة بيانات الحساب.</Text></Pressable>{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AppButton title="إنشاء الحساب" icon="sparkles-outline" loading={loading} disabled={!valid} onPress={submit} /><View style={styles.login}><Text style={{ color: colors.textSoft }}>لديك حساب؟</Text><Pressable onPress={() => router.replace(returnRoute ? { pathname: "/(auth)/login", params: { return_to: returnRoute.path } } : "/(auth)/login")}><Text style={{ color: colors.primary, fontWeight: "900" }}>تسجيل الدخول</Text></Pressable></View></Screen>;
}

const styles = StyleSheet.create({ title: { fontSize: 25, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 8 }, copy: { fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginBottom: 22 }, terms: { flexDirection: "row-reverse", alignItems: "center", gap: 9, marginVertical: 7 }, termsText: { flex: 1, fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl" }, error: { fontSize: 11, lineHeight: 19, textAlign: "center", marginVertical: 10 }, login: { flexDirection: "row-reverse", gap: 5, justifyContent: "center", marginTop: 18 },
});
