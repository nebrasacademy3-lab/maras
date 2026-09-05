import { useQuery } from "@tanstack/react-query";
import { Redirect, router, useLocalSearchParams, type Href } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, EmptyState, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { authDestination } from "@/src/lib/account-access";
import { safeInternalPath } from "@/src/lib/notification-routing";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog, SessionUser } from "@/src/types";
import { ACADEMIC_LEVELS } from "@/src/constants/academic-levels";

export default function CompleteProfile() {
  const { user, loading: authLoading } = useAuth();
  if (authLoading) return <Screen><LoadingState /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  return <ProfileForm key={user.id} user={user} />;
}

function ProfileForm({ user }: { user: SessionUser }) {
  const { refresh } = useAuth();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ return_to?: string }>();
  const returnTo = safeInternalPath(params.return_to);
  const [form, setForm] = useState({ fullName: user.fullName || "", phone: user.phone || "", universitySlug: user.universitySlug || "", specialty: user.specialty || "", academicLevel: user.academicLevel || "" });
  const [accepted, setAccepted] = useState(user.profileCompleted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const programs = useQuery({ queryKey: ["programs", form.universitySlug], queryFn: () => api<{ programs: { name: string; degree: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`), enabled: Boolean(form.universitySlug) });
  const submit = async () => {
    setLoading(true); setError("");
    try {
      const result = await api<{ user?: SessionUser; next: string }>("/api/profile", { method: "PATCH", body: jsonBody({ ...form, termsAccepted: accepted }) });
      const updated = await refresh();
      if (!updated) throw new Error("تعذر تحديث حالة الحساب. حاول مرة أخرى.");

      router.replace(authDestination(updated, result.next, returnTo) as Href);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر حفظ الملف"); }
    finally { setLoading(false); }
  };
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  return <Screen keyboard><AppHeader title="إكمال الملف" subtitle="خطوة أخيرة لتجربة تناسب مسارك" />
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.text }]}>أكمل بياناتك الجامعية</Text>
      <Text style={[styles.copy, { color: colors.textSoft }]}>اختر جامعتك وتخصصك ومستواك الدراسي. يُتاح الشراء عند اكتمال الملف وتأكيد بريد الحساب مرة واحدة.</Text>
      {catalog.isError ? <EmptyState title="تعذر تحميل الجامعات" text={catalog.error instanceof ApiError ? catalog.error.message : "تحقق من الشبكة ثم أعد المحاولة."} action={<AppButton title="إعادة المحاولة" onPress={() => void catalog.refetch()} />} /> : null}
      <Field label="الاسم الكامل" value={form.fullName} onChangeText={(fullName) => setForm({ ...form, fullName })} />
      <Field label="رقم الجوال السعودي" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} />
      <SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={(catalog.data?.institutions || []).map((item) => ({ key: item.slug, label: item.name, detail: item.region }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key, specialty: "" })} />
      <SearchPicker label="التخصص" value={form.specialty} placeholder={programs.isFetching ? "جارٍ تحميل التخصصات..." : "اختر التخصص"} disabled={!form.universitySlug || programs.isFetching} items={(programs.data?.programs || []).map((item) => ({ key: item.name, label: item.name, detail: item.degree }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />
      {programs.isError ? <AppButton title="إعادة تحميل التخصصات" variant="ghost" onPress={() => void programs.refetch()} /> : null}
      <SearchPicker label="المستوى الدراسي" value={form.academicLevel} placeholder="اختر مستواك الحالي" items={ACADEMIC_LEVELS.map((level) => ({ key: level, label: level }))} onSelect={(item) => setForm({ ...form, academicLevel: item.key })} />
      {!user.profileCompleted ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} style={styles.terms}><Ionicons name={accepted ? "checkbox" : "square-outline"} size={24} color={colors.primary} /><Text style={[styles.termsText, { color: colors.textSoft }]}>أوافق على شروط الاستخدام وسياسة الخصوصية ومعالجة بيانات الحساب.</Text></Pressable> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <AppButton title="حفظ والمتابعة" loading={loading} disabled={!accepted || form.fullName.trim().length < 5 || !form.phone || !form.universitySlug || !form.specialty || !form.academicLevel} onPress={() => void submit()} />
    </Card>
  </Screen>;
}
const styles = StyleSheet.create({ card: { maxWidth: 660, width: "100%", alignSelf: "center", marginTop: 18 }, title: { fontSize: 24, fontWeight: "900", marginBottom: 10 }, copy: { fontSize: 12, lineHeight: 23, marginBottom: 22 }, terms: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 }, termsText: { flex: 1, fontSize: 12, lineHeight: 21 }, error: { textAlign: "center", fontSize: 12, marginBottom: 12 } });
