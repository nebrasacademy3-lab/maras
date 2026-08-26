import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

export default function CompleteProfile() {
  const { user, refresh } = useAuth(); const { colors } = useTheme(); const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const [form, setForm] = useState({ fullName: user?.fullName || "", phone: user?.phone || "", universitySlug: user?.universitySlug || "", specialty: user?.specialty || "" }); const [programs, setPrograms] = useState<{ name: string; degree: string }[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (form.universitySlug) api<{ programs: { name: string; degree: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`).then((value) => setPrograms(value.programs)).catch(() => setPrograms([])); }, [form.universitySlug]);
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  const submit = async () => { setLoading(true); setError(""); try { await api("/api/profile", { method: "PATCH", body: jsonBody(form) }); await refresh(); router.replace("/onboarding"); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر حفظ الملف"); } finally { setLoading(false); } };
  return <Screen keyboard><AppHeader title="إكمال الملف" subtitle="هذه البيانات مطلوبة للتعلم والشراء" /><Text style={[styles.title, { color: colors.text }]}>أكمل بياناتك الجامعية</Text><Text style={[styles.copy, { color: colors.textSoft }]}>لن تتمكن من الاشتراك أو طلب مادة قبل اكتمال هذه البيانات.</Text><Field label="الاسم الكامل" value={form.fullName} onChangeText={(fullName) => setForm({ ...form, fullName })} /><Field label="رقم الجوال" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} /><SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={(catalog.data?.institutions || []).map((item) => ({ key: item.slug, label: item.name, detail: item.region }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key, specialty: "" })} /><SearchPicker label="التخصص" value={form.specialty} placeholder="اختر التخصص" disabled={!form.universitySlug} items={programs.map((item) => ({ key: item.name, label: item.name, detail: item.degree }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AppButton title="حفظ والمتابعة" loading={loading} disabled={!form.fullName || !form.phone || !form.universitySlug || !form.specialty} onPress={submit} /></Screen>;
}
const styles = StyleSheet.create({ title: { fontSize: 24, fontWeight: "900", textAlign: "right", marginTop: 14 }, copy: { fontSize: 12, lineHeight: 21, textAlign: "right", marginBottom: 22 }, error: { textAlign: "center", fontSize: 11, marginBottom: 12 } });

