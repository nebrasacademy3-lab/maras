import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field, SectionTitle } from "@/src/components/ui";
import { api, jsonBody } from "@/src/lib/api";
import { MerasAlert } from "@/src/lib/interaction-events";
import { DEVICE_ACTIONS, DEVICE_ACTION_DESCRIPTIONS, DEVICE_ACTION_LABELS, devicePolicyLabel, type DeviceAction, type DeviceReturnPolicy } from "@/src/lib/device-access-policy";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type Device = { id: number; deviceLabel: string; platform: string; firstSeenAt: string; lastSeenAt: string; current?: boolean; revokedAt?: string | null; revocationReason?: string | null; returnPolicy?: DeviceReturnPolicy; blockedUntil?: string | null; policyVersion?: number };
type Snapshot = { registeredDevices: Device[]; deviceLimit: number; serverTime?: string; historyMayBeTruncated?: boolean };
type Command = { action: DeviceAction; deviceId: number; expectedRevision: number; reason: string; durationHours?: number };
export function RegisteredDevices({ studentEmail }: { studentEmail?: string }) {
  const { user } = useAuth();
  if (!user || (!studentEmail && user.role !== "student")) return null;
  return <DevicePanel key={`${user.id}:${studentEmail || "self"}`} studentEmail={studentEmail} userId={user.id} />;
}
function DevicePanel({ studentEmail, userId }: { studentEmail?: string; userId: number }) {
  const { colors } = useTheme(); const { direction, locale } = useLanguage(); const client = useQueryClient(); const admin = Boolean(studentEmail);
  const access = useQuery({ queryKey: ["admin-device-permissions", userId], queryFn: ({ signal }) => api<{ permissions: string[]; user: { isPlatformOwner?: boolean } }>("/api/admin/me", { signal }), enabled: admin, staleTime: 0, retry: false });
  const canManage = admin && !access.isError && Boolean(access.data?.user.isPlatformOwner || access.data?.permissions.includes("students.devices.manage"));
  const canRead = !admin || canManage || (!access.isError && Boolean(access.data?.permissions.includes("students.devices.view")));
  const [expanded, setExpanded] = useState(!admin); const [selected, setSelected] = useState<Device | null>(null);
  const [action, setAction] = useState<DeviceAction>("end_sessions"); const [reason, setReason] = useState(""); const [hours, setHours] = useState("24"); const [feedback, setFeedback] = useState("");
  const mounted = useRef(true); const writer = useRef<AbortController | null>(null); const submitting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; writer.current?.abort(); }; }, []);
  const path = admin ? `/api/admin/students/${encodeURIComponent(studentEmail!)}/devices` : "/api/profile/sessions";
  const queryKey = ["registered-devices", userId, studentEmail || "self"];
  const query = useQuery({ queryKey, queryFn: ({ signal }) => api<Snapshot>(path, { signal }), enabled: canRead && expanded, staleTime: 15000 });
  const mutation = useMutation({
    mutationFn: async (command: Command) => {
      const controller = new AbortController(); writer.current = controller;
      // An older read must not overwrite the authoritative mutation response.
      await client.cancelQueries({ queryKey, exact: true });
      if (!mounted.current || controller.signal.aborted) throw new Error("أُلغي الإجراء بعد مغادرة ملف الطالب.");
      return api<Snapshot>(path, { method: "POST", body: jsonBody(command), signal: controller.signal });
    },
    onSuccess: async result => {
      if (!mounted.current) return;
      client.setQueryData(queryKey, result); setSelected(null); setReason("");
      setFeedback("تم تنفيذ الإجراء وتوثيقه دون إعادة أي جلسة قديمة.");
      try { await client.invalidateQueries({ queryKey: ["admin-student-profile", studentEmail] }); }
      catch { if (mounted.current) setFeedback("تم الإجراء، لكن تحديث ملخص الطالب تعثر. حدّث الملخص دون تكرار العملية."); }
    },
    onSettled: () => { submitting.current = false; },
  });
  function confirm() {
    if (!selected || !canManage || submitting.current || mutation.isPending || reason.trim().length < 4) return;
    const command: Command = { action, deviceId: selected.id, expectedRevision: selected.policyVersion || 0, reason: reason.trim(), ...(action === "block_until" ? { durationHours: Number(hours) } : {}) };
    MerasAlert.alert(DEVICE_ACTION_LABELS[action], `${selected.deviceLabel}\n${DEVICE_ACTION_DESCRIPTIONS[action]}\nالسبب: ${command.reason}${action === "block_until" ? `\nمدة الحظر: ${hours} ساعة` : ""}`, [{ text: "إلغاء", style: "cancel" }, { text: "تأكيد الإجراء", style: action === "allow_return" ? "default" : "destructive", onPress: () => {
      if (!mounted.current || submitting.current) return;
      submitting.current = true;
      mutation.mutate(command);
    } }]);
  }
  if (!canRead) return null;
  const devices = query.data?.registeredDevices || []; const active = devices.filter(device => !device.revokedAt);
  const now = query.data?.serverTime ? Date.parse(query.data.serverTime) : 0;
  const text = { color: colors.text, fontSize: 14, lineHeight: 24, textAlign: "right" as const };
  const date = (value: string) => new Date(value).toLocaleString(locale);
  return <View style={{ direction, gap: 12 }}>
    {admin ? <AppButton title={expanded ? "إخفاء الأجهزة" : "أجهزة الطالب وسياسة العودة"} icon="phone-portrait-outline" variant="soft" disabled={mutation.isPending} onPress={() => setExpanded(value => !value)} /> : <SectionTitle title="أجهزتك المعتمدة" subtitle="تسجيل الخروج ينهي الجلسة، ولا يسحب اعتماد الجهاز" />}
    {expanded && <Card style={{ gap: 14 }}><Text selectable style={{ ...text, color: colors.textSoft }}>{admin ? "إنهاء الجلسة مختلف عن سحب الاعتماد. السماح بالعودة لا يعيد جلسات قديمة ولا يتجاوز الحد أو المصادقة." : "راجع أجهزتك واتصل بالدعم عند الحاجة للاستبدال أو مراجعة المنع. حافظ على سرية بيانات الدخول."}</Text>
      {query.isPending ? <Text style={text}>جارٍ تحميل الأجهزة…</Text> : query.isError ? <><Text accessibilityRole="alert" style={{ ...text, color: colors.danger }}>تعذر تحميل حالة الأجهزة.</Text><AppButton title="إعادة المحاولة" variant="soft" disabled={mutation.isPending} onPress={() => void query.refetch()} /></> : <>
        <Text style={{ ...text, color: colors.primary, fontWeight: "800" }}>{active.length} من {query.data?.deviceLimit || 2} أجهزة معتمدة</Text>
        {(admin ? devices : active).map(device => <View key={device.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 14, gap: 8 }}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}><Ionicons name={device.platform === "web" ? "desktop-outline" : "phone-portrait-outline"} size={24} color={colors.primary}/><Text selectable style={{ ...text, flex: 1, fontWeight: "800" }}>{device.deviceLabel || "جهاز مراس"}</Text></View>
          <Text style={{ ...text, color: colors.textSoft }}>{admin ? devicePolicyLabel({ ...device, revokedAt: device.revokedAt || null }, now) : device.current ? "الجهاز الحالي" : "معتمد"}</Text><Text style={{ ...text, color: colors.textSoft }}>آخر نشاط: {date(device.lastSeenAt)}</Text>
          {admin && device.revocationReason && <Text selectable style={text}>السبب المسجل: {device.revocationReason}</Text>}{admin && device.blockedUntil && <Text style={text}>انتهاء الحظر: {date(device.blockedUntil)} — يلزم دخول جديد</Text>}
          {canManage && <AppButton title="إدارة الجهاز" variant="soft" disabled={mutation.isPending} onPress={() => { setSelected(device); setAction(device.revokedAt ? "allow_return" : "end_sessions"); setReason(""); setHours("24"); setFeedback(""); mutation.reset(); }} />}
        </View>)}{!devices.length && <Text style={text}>لا توجد أجهزة مسجلة.</Text>}{query.data?.historyMayBeTruncated && <Text style={{ ...text, color: colors.textSoft }}>يعرض هذا الجزء حتى 500 سجل؛ لا يمثل قائمة تاريخية كاملة.</Text>}
      </>}{feedback && <Text accessibilityLiveRegion="polite" style={{ ...text, color: colors.success }}>{feedback}</Text>}
    </Card>}
    {expanded && selected && canManage && <Card style={{ gap: 12 }}><Text style={{ ...text, fontWeight: "800", fontSize: 19 }}>{selected.deviceLabel}</Text>
      {DEVICE_ACTIONS.filter(value => value !== "allow_return" || Boolean(selected.revokedAt)).map(value => <AppButton key={value} title={`${action === value ? "✓ " : ""}${DEVICE_ACTION_LABELS[value]}`} variant={action === value ? "primary" : "soft"} disabled={mutation.isPending} onPress={() => setAction(value)} />)}
      <Text selectable style={{ ...text, color: colors.textSoft }}>{DEVICE_ACTION_DESCRIPTIONS[action]}</Text>
      {action === "block_until" && <Field label="مدة الحظر بالساعات (1–2160)" value={hours} onChangeText={setHours} keyboardType="number-pad" maxLength={4} editable={!mutation.isPending}/>}
      <Field label="سبب الإجراء" value={reason} onChangeText={setReason} multiline maxLength={600} editable={!mutation.isPending}/>
      {mutation.error && <Text accessibilityRole="alert" selectable style={{ ...text, color: colors.danger }}>{mutation.error instanceof Error ? mutation.error.message : "تعذر التنفيذ؛ لم تفقد بيانات النموذج."}</Text>}
      <AppButton title="مراجعة وتأكيد" loading={mutation.isPending} disabled={reason.trim().length < 4} onPress={confirm}/><AppButton title="إلغاء" variant="soft" disabled={mutation.isPending} onPress={() => setSelected(null)}/>
    </Card>}
  </View>;
}
