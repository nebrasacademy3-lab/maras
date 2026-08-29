import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, ErrorState, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { mergeServerFormWithEdits, updateDirtyForm, type DirtyFormEdits } from "@/src/lib/profileFormHydration";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog, SessionUser } from "@/src/types";

type ProfileValues = { fullName: string; phone: string; universitySlug: string; specialty: string };

export default function Profile() {
  const { user, loading, offline, token, authError, refresh } = useAuth();

  if (loading) return <Screen><LoadingState label="جارٍ استعادة بيانات حسابك..." /></Screen>;
  if (!user && offline && token) return <Screen><AppHeader title="بيانات الحساب" back /><ErrorState title="تعذر استعادة الجلسة" text={authError || "تحقق من اتصالك ثم أعد المحاولة."} onRetry={() => void refresh()} /></Screen>;
  if (!user) return <Redirect href="/(auth)/login?return_to=%2Fprofile" />;

  return <ProfileForm key={user.id} initialUser={user} />;
}

function ProfileForm({ initialUser }: { initialUser: SessionUser }) {
  const { refresh } = useAuth();
  const { colors } = useTheme();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const serverForm: ProfileValues = {
    fullName: initialUser.fullName || "",
    phone: initialUser.phone || "",
    universitySlug: initialUser.universitySlug || "",
    specialty: initialUser.specialty || "",
  };
  const [edits, setEdits] = useState<DirtyFormEdits<ProfileValues>>({});
  const form = mergeServerFormWithEdits(serverForm, edits);
  const [programs, setPrograms] = useState<{ name: string; degree: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!form.universitySlug) return;
    let active = true;
    void api<{ programs: { name: string; degree: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`)
      .then((value) => { if (active) setPrograms(value.programs); })
      .catch(() => { if (active) setPrograms([]); });
    return () => { active = false; };
  }, [form.universitySlug]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api("/api/profile", { method: "PATCH", body: jsonBody(form) });
      const updated = await refresh();
      if (updated && updated !== initialUser) setEdits({});
      setMessage("تم حفظ بيانات الحساب");
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  if (catalog.isError) return <Screen><AppHeader title="بيانات الحساب" back /><ErrorState title="تعذر تحميل الجامعات" onRetry={() => void catalog.refetch()} /></Screen>;

  return <Screen keyboard><AppHeader title="بيانات الحساب" subtitle={initialUser.email} back /><Card><Text style={[styles.note, { color: colors.textSoft }]}>يجب أن تبقى هذه البيانات مكتملة حتى تظهر توصياتك وتعمل طلبات المواد والشراء بصورة صحيحة.</Text><Field label="الاسم الكامل" value={form.fullName} onChangeText={(fullName) => setEdits((current) => updateDirtyForm(current, { fullName }))} /><Field label="البريد الإلكتروني" value={initialUser.email} editable={false} /><Field label="رقم الجوال" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setEdits((current) => updateDirtyForm(current, { phone }))} /><SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={(catalog.data?.institutions || []).map((item) => ({ key: item.slug, label: item.name, detail: item.region }))} onSelect={(item) => setEdits((current) => updateDirtyForm(current, { universitySlug: item.key, specialty: "" }))} /><SearchPicker label="التخصص" value={form.specialty} placeholder="اختر التخصص" disabled={!form.universitySlug} items={programs.map((item) => ({ key: item.name, label: item.name, detail: item.degree }))} onSelect={(item) => setEdits((current) => updateDirtyForm(current, { specialty: item.key }))} />{message ? <Text style={[styles.message, { color: message.startsWith("تم") ? colors.success : colors.danger }]}>{message}</Text> : null}<AppButton title="حفظ التغييرات" loading={saving} onPress={() => void save()} /></Card></Screen>;
}

const styles = StyleSheet.create({
  note: { fontSize: 10, lineHeight: 18, textAlign: "right", marginBottom: 18 },
  message: { textAlign: "center", fontSize: 10, marginBottom: 10 },
});
