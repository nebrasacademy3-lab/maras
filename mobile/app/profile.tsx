import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

export default function Profile() {
  const { user, refresh } = useAuth(); const { colors } = useTheme(); const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") }); const [form, setForm] = useState({ fullName: user?.fullName || "", phone: user?.phone || "", universitySlug: user?.universitySlug || "", specialty: user?.specialty || "" }); const [programs, setPrograms] = useState<{ name: string; degree: string }[]>([]); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { if (form.universitySlug) api<{ programs: { name: string; degree: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`).then((value) => setPrograms(value.programs)).catch(() => setPrograms([])); }, [form.universitySlug]);
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  const save = async () => { setSaving(true); setMessage(""); try { await api("/api/profile", { method: "PATCH", body: jsonBody(form) }); await refresh(); setMessage("تم حفظ بيانات الحساب"); } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر الحفظ"); } finally { setSaving(false); } };
  return <Screen keyboard><AppHeader title="بيانات الحساب" subtitle={user?.email} back /><Card><Text style={[styles.note, { color: colors.textSoft }]}>يجب أن تبقى هذه البيانات مكتملة حتى تظهر توصياتك وتعمل طلبات المواد والشراء بصورة صحيحة.</Text><Field label="الاسم الكامل" value={form.fullName} onChangeText={(fullName) => setForm({ ...form, fullName })} /><Field label="البريد الإلكتروني" value={user?.email || ""} editable={false} /><Field label="رقم الجوال" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} /><SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={(catalog.data?.institutions || []).map((item) => ({ key: item.slug, label: item.name, detail: item.region }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key, specialty: "" })} /><SearchPicker label="التخصص" value={form.specialty} placeholder="اختر التخصص" disabled={!form.universitySlug} items={programs.map((item) => ({ key: item.name, label: item.name, detail: item.degree }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />{message ? <Text style={[styles.message, { color: message.startsWith("تم") ? colors.success : colors.danger }]}>{message}</Text> : null}<AppButton title="حفظ التغييرات" loading={saving} onPress={save} /></Card></Screen>;
}
const styles = StyleSheet.create({ note: { fontSize: 10, lineHeight: 18, textAlign: "right", marginBottom: 18 }, message: { textAlign: "center", fontSize: 10, marginBottom: 10 } });

