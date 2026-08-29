import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, EmptyState, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";
import { ACADEMIC_LEVELS } from "@/src/constants/academic-levels";

export default function Profile() {
  const { user, refresh } = useAuth();
  const { colors } = useTheme();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const [form, setForm] = useState({ fullName: user?.fullName || "", phone: user?.phone || "", universitySlug: user?.universitySlug || "", specialty: user?.specialty || "", academicLevel: user?.academicLevel || "" });
  const [programs, setPrograms] = useState<{ name: string; degree: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({ fullName: user.fullName || "", phone: user.phone || "", universitySlug: user.universitySlug || "", specialty: user.specialty || "", academicLevel: user.academicLevel || "" });
  }, [user]);

  useEffect(() => {
    if (form.universitySlug) api<{ programs: { name: string; degree: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`).then((value) => setPrograms(value.programs)).catch(() => setPrograms([]));
    else setPrograms([]);
  }, [form.universitySlug]);

  if (!user) return <Screen><AppHeader title="بيانات الحساب" back /><EmptyState icon="person-circle-outline" title="سجّل الدخول أولًا" text="ملفك الجامعي وبياناتك محفوظة داخل حسابك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;

  const complete = Boolean(form.fullName.trim().length >= 5 && form.phone.trim() && form.universitySlug && form.specialty && form.academicLevel);
  const save = async () => {
    setSaving(true); setMessage("");
    try {
      await api("/api/profile", { method: "PATCH", body: jsonBody(form) });
      await refresh();
      setMessage("تم حفظ بيانات الحساب ومزامنتها");
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : "تعذر الحفظ");
    } finally { setSaving(false); }
  };

  return <Screen keyboard>
    <AppHeader title="بيانات الحساب" subtitle={user.email} back />
    <Card style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}> 
      <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}><Ionicons name="person-outline" size={25} color={colors.primary} /></View>
      <View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.text }]}>ملفك الجامعي</Text><Text style={[styles.heroText, { color: colors.textSoft }]}>هذه البيانات تحدد توصياتك وموادك وتُستخدم لتخصيص تجربة مراس على الويب والتطبيق.</Text></View>
      <View style={[styles.completion, { backgroundColor: complete ? `${colors.success}18` : `${colors.primary}12` }]}><Ionicons name={complete ? "checkmark-circle" : "information-circle-outline"} size={15} color={complete ? colors.success : colors.primary} /><Text style={{ color: complete ? colors.success : colors.primary, fontSize: 8, fontWeight: "900" }}>{complete ? "مكتمل" : "يحتاج استكمال"}</Text></View>
    </Card>

    <Card>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>البيانات الأساسية</Text>
      <Text style={[styles.note, { color: colors.textSoft }]}>حدّث بياناتك بدقة. ستنعكس التغييرات تلقائيًا في بقية أجزاء المنصة.</Text>
      <Field label="الاسم الكامل" value={form.fullName} onChangeText={(fullName) => setForm({ ...form, fullName })} />
      <Field label="البريد الإلكتروني" value={user.email} editable={false} />
      <Field label="رقم الجوال" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="05xxxxxxxx" />
      <SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={(catalog.data?.institutions || []).map((item) => ({ key: item.slug, label: item.name, detail: item.region }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key, specialty: "" })} />
      <SearchPicker label="التخصص" value={form.specialty} placeholder="اختر التخصص" disabled={!form.universitySlug} items={programs.map((item) => ({ key: item.name, label: item.name, detail: item.degree }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />
      <SearchPicker label="المستوى الدراسي" value={form.academicLevel || undefined} placeholder="اختر مستواك الحالي" items={ACADEMIC_LEVELS.map((level) => ({ key: level, label: level, detail: level === "خريج" ? "أنهيت الدراسة" : "المستوى الحالي" }))} onSelect={(item) => setForm({ ...form, academicLevel: item.key })} />
      {message ? <Text style={[styles.message, { color: message.startsWith("تم") ? colors.success : colors.danger }]}>{message}</Text> : null}
      <AppButton title="حفظ ومزامنة التغييرات" icon="save-outline" loading={saving} disabled={!complete} onPress={save} />
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row-reverse", alignItems: "center", gap: 11, marginBottom: 12 },
  heroIcon: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, alignItems: "flex-end" },
  heroTitle: { fontSize: 15, fontWeight: "900", textAlign: "right" },
  heroText: { fontSize: 9, lineHeight: 17, textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  completion: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6 },
  sectionTitle: { fontSize: 17, fontWeight: "900", textAlign: "right", marginBottom: 5 },
  note: { fontSize: 10, lineHeight: 18, textAlign: "right", marginBottom: 18 },
  message: { textAlign: "center", fontSize: 10, marginBottom: 10, fontWeight: "800" },
});
