import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field, SectionTitle } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type RegisteredDevice = { id: number; deviceLabel: string; platform: string; firstSeenAt: string; lastSeenAt: string; current?: boolean; revokedAt?: string | null };
type StudentDevices = { registeredDevices: RegisteredDevice[]; deviceLimit: number };

export function RegisteredDevices({ studentEmail }: { studentEmail?: string }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { direction, locale } = useLanguage();
  const client = useQueryClient();
  const admin = Boolean(studentEmail);
  const [expanded, setExpanded] = useState(!admin);
  const [selected, setSelected] = useState<RegisteredDevice | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const path = admin ? `/api/admin/students/${encodeURIComponent(studentEmail!)}/devices` : "/api/profile/sessions";
  const queryKey = ["registered-devices", admin ? studentEmail : user?.id];
  const query = useQuery({ queryKey, queryFn: () => api<StudentDevices>(path), enabled: Boolean(user) && expanded, staleTime: 15_000 });
  const remove = useMutation({
    mutationFn: () => api(path, { method: "DELETE", body: jsonBody({ deviceId: selected!.id, reason: reason.trim() }) }),
    onSuccess: async () => {
      setSelected(null); setReason(""); setFeedback("تم إيقاف اعتماد الجهاز وجلساته. يمكن للطالب تسجيل جهاز بديل.");
      await Promise.all([client.invalidateQueries({ queryKey: ["registered-devices"] }), client.invalidateQueries({ queryKey: ["admin"] })]);
    },
  });
  const devices = query.data?.registeredDevices || [];
  const active = devices.filter((device) => !device.revokedAt);
  const date = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }); };
  const contents = <>
    <Text style={[styles.description, { color: colors.textSoft }]}>الحساب مرتبط بأول جهازين تسجّل منهما. تسجيل الخروج ينهي الجلسة ويبقي الجهاز معتمدًا؛ استبدال الجهاز يتم عبر الإدارة.</Text>
    {query.isPending ? <Text style={[styles.description, { color: colors.textSoft }]}>جارٍ تحميل الأجهزة المسجّلة…</Text> : query.isError ? <><Text style={[styles.description, { color: colors.danger }]}>تعذر تحميل الأجهزة. أعد المحاولة لعرض الحالة الحالية.</Text><AppButton title="إعادة المحاولة" variant="soft" icon="refresh-outline" onPress={() => void query.refetch()} /></> : <>
      <Text style={[styles.count, { color: colors.primary }]}>{active.length} من {query.data?.deviceLimit || 2} أجهزة مسجّلة</Text>
      {active.map((device) => <View key={device.id} style={[styles.row, { borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={device.platform === "web" ? "desktop-outline" : "phone-portrait-outline"} size={23} color={colors.primary} /></View>
        <View style={styles.copy}><Text style={[styles.name, { color: colors.text }]}>{device.deviceLabel || "جهاز مراس"}</Text><Text style={[styles.meta, { color: colors.textSoft }]}>آخر نشاط: {date(device.lastSeenAt)}</Text>{device.current ? <Text style={[styles.current, { color: colors.success }]}>هذا الجهاز</Text> : null}{admin ? <Pressable accessibilityRole="button" onPress={() => { setSelected(device); setReason(""); remove.reset(); setFeedback(""); }} style={styles.replace}><Text style={[styles.replaceText, { color: colors.danger }]}>استبدال الجهاز</Text><Ionicons name="swap-horizontal-outline" size={16} color={colors.danger} /></Pressable> : null}</View>
      </View>)}
      {!active.length ? <Text style={[styles.description, { color: colors.textSoft }]}>لا توجد أجهزة معتمدة حاليًا.</Text> : null}
    </>}
    {feedback ? <Text accessibilityRole="alert" style={[styles.description, { color: colors.success }]}>{feedback}</Text> : null}
  </>;
  if (!user || (!admin && user.role !== "student")) return null;
  return <View style={{ direction }}>
    {admin ? <AppButton title={expanded ? "إخفاء الأجهزة المعتمدة" : "الأجهزة المعتمدة واستبدالها"} icon="phone-portrait-outline" variant="soft" onPress={() => setExpanded((value) => !value)} /> : <SectionTitle title="أجهزتك المعتمدة" subtitle="جهازان لحسابك، مع استمرار الوصول بعد تسجيل الخروج" />}
    {expanded ? <Card style={styles.card}>{contents}</Card> : null}
    {admin ? <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => { if (!remove.isPending) setSelected(null); }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.overlay, { direction, backgroundColor: colors.overlay }]}><ScrollView keyboardShouldPersistTaps="handled" style={styles.dialogScroll} contentContainerStyle={{ paddingVertical: 12 }}><Card style={styles.dialog}>
      <Ionicons name="phone-portrait-outline" size={32} color={colors.danger} /><Text style={[styles.dialogTitle, { color: colors.text }]}>استبدال جهاز الطالب</Text><Text style={[styles.description, { color: colors.textSoft }]}>سيُوقف اعتماد «{selected?.deviceLabel || "الجهاز المحدد"}» وتنتهي جلساته. يُتاح مكانه لجهاز بديل عند تسجيل الدخول التالي.</Text>
      <Field label="سبب الاستبدال" value={reason} onChangeText={setReason} placeholder="مثال: استبدال الهاتف بطلب من الطالب" multiline maxLength={500} editable={!remove.isPending} />
      {remove.error ? <Text accessibilityRole="alert" style={[styles.description, { color: colors.danger }]}>{remove.error instanceof ApiError ? remove.error.message : "تعذر استبدال الجهاز. حاول مجددًا."}</Text> : null}
      <AppButton title="تأكيد إيقاف اعتماد الجهاز" variant="danger" loading={remove.isPending} disabled={reason.trim().length < 4 || !selected} onPress={() => remove.mutate()} /><AppButton title="إلغاء" variant="ghost" disabled={remove.isPending} onPress={() => setSelected(null)} />
    </Card></ScrollView></KeyboardAvoidingView></Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 10, gap: 12 }, description: { fontSize: 12, lineHeight: 23 }, count: { fontSize: 14, lineHeight: 23, fontWeight: "900" }, row: { flexDirection: "row", alignItems: "flex-start", gap: 11, borderTopWidth: 1, paddingTop: 14 }, icon: { width: 43, height: 43, flexShrink: 0, borderRadius: 14, alignItems: "center", justifyContent: "center" }, copy: { flex: 1, minWidth: 0 }, name: { fontSize: 14, lineHeight: 23, fontWeight: "800" }, meta: { fontSize: 11, lineHeight: 20, marginTop: 3 }, current: { fontSize: 11, lineHeight: 19, marginTop: 4, fontWeight: "800" }, replace: { flexDirection: "row", gap: 7, minHeight: 44, alignItems: "center" }, replaceText: { fontSize: 12, fontWeight: "800" }, overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }, dialogScroll: { width: "100%", maxWidth: 500, flexGrow: 0 }, dialog: { width: "100%", maxWidth: 500, gap: 12 }, dialogTitle: { fontSize: 22, lineHeight: 32, fontWeight: "900" },
});
