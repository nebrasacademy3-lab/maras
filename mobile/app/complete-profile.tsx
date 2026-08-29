import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";
import { ACADEMIC_LEVELS } from "@/src/constants/academic-levels";

export default function CompleteProfile() {
  const { user, refresh } = useAuth();
  const { colors } = useTheme();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const [form, setForm] = useState({ fullName: user?.fullName || "", phone: user?.phone || "", universitySlug: user?.universitySlug || "", specialty: user?.specialty || "", academicLevel: user?.academicLevel || "" });
  const [programs, setPrograms] = useState<{ name: string; degree: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (form.universitySlug) api<{ programs: { name: string; degree: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`).then((value) => setPrograms(value.programs)).catch(() => setPrograms([])); else setPrograms([]); }, [form.universitySlug]);
  if (catalog.isLoading) return <Screen footer={false}><LoadingState /></Screen>;

  const ready = Boolean(form.fullName.trim().length >= 5 && form.phone.trim() && form.universitySlug && form.specialty && form.academicLevel);
  const submit = async () => {
    setLoading(true); setError("");
    try { await api("/api/profile", { method: "PATCH", body: jsonBody(form) }); await refresh(); router.replace("/onboarding"); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر حفظ الملف"); }
    finally { setLoading(false); }
  };

  return <Screen keyboard footer={false}>
    <AppHeader title="إكمال الملف" subtitle="خطوة واحدة قبل البدء" />
    <View style={[styles.hero, { backgroundColor: colors.primary }]}>
      <View style={styles.heroIcon}><Ionicons name="school-outline" size={31} color="#FFFFFF" /></View>
      <Text style={styles.title}>خلّ مراس يعرف مسارك</Text>
      <Text style={styles.copy}>اختر جامعتك وتخصصك ومستواك حتى نرتب لك المواد المناسبة ونربط حسابك بكل الخدمات.</Text>
      <View style={styles.progress}><View style={styles.progressFill} /></View>
      <Text style={styles.progressText}>إعداد الحساب · الخطوة الأخيرة</Text>
    </View>

    <Card style={styles.formCard}>
      <Text style={[styles.formTitle, { color: colors.text }]}>بياناتك الجامعية</Text>
      <Text style={[styles.formCopy, { color: colors.textSoft }]}>يمكنك تعديلها لاحقًا من حسابي. لا نستخدمها إلا لتخصيص خدمات المنصة وربط الطلبات والمحتوى.</Text>
      <Field label="الاسم الكامل" value={form.fullName} onChangeText={(fullName) => setForm({ ...form, fullName })} />
      <Field label="رقم الجوال" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="05xxxxxxxx" />
      <SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={(catalog.data?.institutions || []).map((item) => ({ key: item.slug, label: item.name, detail: item.region }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key, specialty: "" })} />
      <SearchPicker label="التخصص" value={form.specialty} placeholder="اختر التخصص" disabled={!form.universitySlug} items={programs.map((item) => ({ key: item.name, label: item.name, detail: item.degree }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />
      <SearchPicker label="المستوى الدراسي" value={form.academicLevel} placeholder="اختر مستواك الحالي" items={ACADEMIC_LEVELS.map((level) => ({ key: level, label: level, detail: level === "خريج" ? "أنهيت الدراسة" : "مستوى دراسي" }))} onSelect={(item) => setForm({ ...form, academicLevel: item.key })} />
      {error ? <View style={[styles.errorBox, { backgroundColor: `${colors.danger}12` }]}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={[styles.error, { color: colors.danger }]}>{error}</Text></View> : null}
      <AppButton title="حفظ وبدء الجولة التعريفية" icon="arrow-back" loading={loading} disabled={!ready} onPress={submit} />
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 22, alignItems: "flex-end", marginTop: 6, marginBottom: 14 },
  heroIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  copy: { color: "#DCE8FF", fontSize: 12, lineHeight: 22, textAlign: "right", writingDirection: "rtl", marginTop: 7 },
  progress: { width: "100%", height: 5, borderRadius: 4, backgroundColor: "rgba(255,255,255,.20)", marginTop: 18, overflow: "hidden" },
  progressFill: { width: "100%", height: 5, backgroundColor: "#FFFFFF" },
  progressText: { color: "#DCE8FF", fontSize: 9, fontWeight: "800", marginTop: 7 },
  formCard: { marginBottom: 22 },
  formTitle: { fontSize: 18, fontWeight: "900", textAlign: "right" },
  formCopy: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl", marginTop: 5, marginBottom: 18 },
  errorBox: { flexDirection: "row-reverse", alignItems: "center", gap: 7, padding: 10, borderRadius: 12, marginBottom: 12 },
  error: { flex: 1, textAlign: "right", fontSize: 10, fontWeight: "800" },
});
