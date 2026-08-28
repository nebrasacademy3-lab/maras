import { useQuery } from "@tanstack/react-query";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, ErrorState, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { authGateHref, resolveAuthReturnRoute } from "@/src/lib/authReturnRoute";
import { syncOnboardingCompletion } from "@/src/lib/onboardingSync";
import { mergeServerFormWithEdits, updateDirtyForm, type DirtyFormEdits } from "@/src/lib/profileFormHydration";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog, SessionUser } from "@/src/types";
import { ACADEMIC_LEVELS } from "@/src/constants/academic-levels";
import { FIRST_RUN_ONBOARDING_KEY, usePlatformControls } from "@/src/components/PlatformControls";

type CompleteProfileValues = { fullName: string; phone: string; universitySlug: string; specialty: string; academicLevel: string };

export default function CompleteProfile() {
  const { user, loading, offline, token, authError, refresh } = useAuth();
  const { return_to: returnToParam } = useLocalSearchParams<{ return_to?: string | string[] }>();
  const returnRoute = resolveAuthReturnRoute(returnToParam);

  if (loading) return <Screen><LoadingState label="جارٍ استعادة حسابك..." /></Screen>;
  if (!user && offline && token) return <Screen><AppHeader title="إكمال الملف" /><ErrorState title="تعذر استعادة الجلسة" text={authError || "تحقق من اتصالك ثم أعد المحاولة."} onRetry={() => void refresh()} /></Screen>;
  if (!user) return <Redirect href={returnRoute ? { pathname: "/(auth)/login", params: { return_to: returnRoute.path } } : "/(auth)/login"} />;

  return <CompleteProfileForm key={user.id} initialUser={user} />;
}

function CompleteProfileForm({ initialUser }: { initialUser: SessionUser }) {
  const { refresh } = useAuth(); const { colors } = useTheme(); const controls = usePlatformControls(); const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const { return_to: returnToParam } = useLocalSearchParams<{ return_to?: string | string[] }>(); const returnRoute = resolveAuthReturnRoute(returnToParam);
  const serverForm: CompleteProfileValues = { fullName: initialUser.fullName || "", phone: initialUser.phone || "", universitySlug: initialUser.universitySlug || "", specialty: initialUser.specialty || "", academicLevel: initialUser.academicLevel || "" };
  const [edits, setEdits] = useState<DirtyFormEdits<CompleteProfileValues>>({}); const form = mergeServerFormWithEdits(serverForm, edits); const [programs, setPrograms] = useState<{ name: string; degree: string }[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (form.universitySlug) api<{ programs: { name: string; degree: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`).then((value) => setPrograms(value.programs)).catch(() => setPrograms([])); }, [form.universitySlug]);
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  const submit = async () => { setLoading(true); setError(""); try { await api("/api/profile", { method: "PATCH", body: jsonBody(form) }); const updated = await refresh(); if (updated && updated !== initialUser) setEdits({}); let onboardingSeen = false; try { onboardingSeen = Boolean(await SecureStore.getItemAsync(FIRST_RUN_ONBOARDING_KEY)); } catch { /* The tour remains available when local state cannot be read. */ } const currentUser = updated || initialUser; const explicitlyDisabled = controls.ready && !controls.enabled("onboarding"); if (!onboardingSeen && !explicitlyDisabled && !currentUser.onboardingCompleted) router.replace(authGateHref("/onboarding", returnRoute)); else { if (!currentUser.onboardingCompleted && (onboardingSeen || explicitlyDisabled)) await syncOnboardingCompletion(currentUser); router.replace(returnRoute?.href || "/(tabs)"); } } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر حفظ الملف"); } finally { setLoading(false); } };
  return <Screen keyboard><AppHeader title="إكمال الملف" subtitle="هذه البيانات مطلوبة للتعلم والشراء" /><Text style={[styles.title, { color: colors.text }]}>أكمل بياناتك الجامعية</Text><Text style={[styles.copy, { color: colors.textSoft }]}>لن تتمكن من الاشتراك أو طلب مادة قبل اكتمال هذه البيانات.</Text><Field label="الاسم الكامل" value={form.fullName} onChangeText={(fullName) => setEdits((current) => updateDirtyForm(current, { fullName }))} /><Field label="رقم الجوال" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setEdits((current) => updateDirtyForm(current, { phone }))} /><SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={(catalog.data?.institutions || []).map((item) => ({ key: item.slug, label: item.name, detail: item.region }))} onSelect={(item) => setEdits((current) => updateDirtyForm(current, { universitySlug: item.key, specialty: "" }))} /><SearchPicker label="التخصص" value={form.specialty} placeholder="اختر التخصص" disabled={!form.universitySlug} items={programs.map((item) => ({ key: item.name, label: item.name, detail: item.degree }))} onSelect={(item) => setEdits((current) => updateDirtyForm(current, { specialty: item.key }))} /><SearchPicker label="المستوى الدراسي" value={form.academicLevel} placeholder="اختر مستواك الحالي" items={ACADEMIC_LEVELS.map((level) => ({ key: level, label: level, detail: level === "خريج" ? "أنهيت الدراسة" : "مستوى دراسي" }))} onSelect={(item) => setEdits((current) => updateDirtyForm(current, { academicLevel: item.key }))} />{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AppButton title="حفظ والمتابعة" loading={loading} disabled={controls.loading || !form.fullName || !form.phone || !form.universitySlug || !form.specialty || !form.academicLevel} onPress={submit} /></Screen>;
}
const styles = StyleSheet.create({ title: { fontSize: 24, fontWeight: "900", textAlign: "right", marginTop: 14 }, copy: { fontSize: 12, lineHeight: 21, textAlign: "right", marginBottom: 22 }, error: { textAlign: "center", fontSize: 11, marginBottom: 12 } });
