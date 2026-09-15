import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";
import { api, jsonBody } from "@/src/lib/api";
import { MerasAlert } from "@/src/lib/interaction-events";
import type { StaffMember, StaffResponse } from "@/src/lib/staff-contracts";
type Draft = { id?: number; fullName: string; email: string; phone: string; password: string; permissions: string[]; expectedUpdatedAt?: string };
const blank = (): Draft => ({ fullName: "", email: "", phone: "", password: "", permissions: [] });
export function StaffManager() {
  const { colors } = useTheme();
  const [q, setQ] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null); const [permissionQuery, setPermissionQuery] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const query = useQuery({ queryKey: ["admin-staff", search, page], queryFn: ({ signal }) => api<StaffResponse>(`/api/admin/staff?q=${encodeURIComponent(search)}&page=${page}`, { signal }), retry: 1 });
  async function action(payload: Record<string, unknown>) {
    if (busy) return false; setBusy(true); setError("");
    try { await api("/api/admin/staff", { method: "POST", body: jsonBody(payload) }); await query.refetch(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر التنفيذ"); return false; }
    finally { setBusy(false); }
  }
  function manage(member: StaffMember, kind: string, sessionId?: number | "all") {
    if (member.isPlatformOwner) return;
    if (reason.trim().length < 4) { setError("اكتب سبب الإجراء أولًا (أربعة أحرف على الأقل)"); return; }
    const label = kind === "resetMfa" ? "إعادة ضبط MFA" : kind === "revokeSession" ? "إنهاء الجلسات المحددة" : kind === "activate" ? "تفعيل الحساب" : "إيقاف الحساب";
    MerasAlert.alert(label, `${member.fullName}\n${reason}\nسيُسجّل هذا الإجراء باسم المدير الأعلى.`, [{ text: "إلغاء", style: "cancel" }, { text: "تأكيد", style: kind === "activate" ? "default" : "destructive", onPress: () => { void action({ action: kind, id: member.id, sessionId, reason, expectedUpdatedAt: member.updatedAt }); } }]);
  }
  const text = { color: colors.text, textAlign: "right" as const, fontSize: 15, lineHeight: 26 };
  return <View style={{ gap: 16 }}>
    <Card style={{ gap: 12 }}><Ionicons name="shield-checkmark-outline" size={28} color={colors.primary}/><Text style={{ ...text, fontSize: 22, fontWeight: "800" }}>الفريق والصلاحيات</Text><Text style={{ ...text, color: colors.textSoft }}>كل حساب غير المدير الأعلى هو مشرف بصلاحيات محددة. تغييرها يلغي جلساته الحالية، ويُسجل في سجل التدقيق.</Text><AppButton title="إضافة مشرف" disabled={busy} onPress={() => { setDraft(blank()); setPermissionQuery(""); }}/></Card>
    {(error || query.error) && <Text accessibilityRole="alert" selectable style={{ ...text, color: colors.danger }}>{error || (query.error as Error).message}</Text>}
    <Card style={{ gap: 12 }}><Field label="البحث بالاسم أو البريد" value={q} onChangeText={setQ}/><AppButton title="بحث وتحديث" variant="soft" loading={query.isFetching} onPress={() => { setSearch(q.trim()); setPage(1); void query.refetch(); }}/><Text style={text}>{query.data?.total ?? "—"} حساب إدارة</Text></Card>
    {draft && <Card style={{ gap: 14 }}><Text style={{ ...text, fontSize: 20, fontWeight: "800" }}>{draft.id ? "تعديل المشرف" : "مشرف جديد"}</Text><Field label="الاسم الكامل" value={draft.fullName} onChangeText={value => setDraft({ ...draft, fullName: value })} maxLength={120}/><Field label="البريد الإلكتروني" value={draft.email} editable={!draft.id} autoCapitalize="none" keyboardType="email-address" onChangeText={value => setDraft({ ...draft, email: value })} maxLength={180}/><Field label="الجوال (اختياري)" value={draft.phone} keyboardType="phone-pad" onChangeText={value => setDraft({ ...draft, phone: value })}/><Field label={draft.id ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور الأولية"} value={draft.password} secureTextEntry autoComplete="new-password" onChangeText={value => setDraft({ ...draft, password: value })} maxLength={128}/><Field label="البحث في الصلاحيات" value={permissionQuery} onChangeText={setPermissionQuery}/>
      <AppButton title="تحديد كل الصلاحيات القابلة للتفويض" variant="soft" onPress={() => setDraft({ ...draft, permissions: query.data?.permissions.map(p => p.key) || [] })}/><AppButton title="إلغاء التحديد" variant="soft" onPress={() => setDraft({ ...draft, permissions: [] })}/>
      {query.data?.permissions.filter(p => p.label.includes(permissionQuery)).map(permission => { const checked = draft.permissions.includes(permission.key); return <Pressable key={permission.key} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setDraft({ ...draft, permissions: checked ? draft.permissions.filter(key => key !== permission.key) : [...draft.permissions, permission.key] })} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: checked ? colors.surfaceAlt : colors.surface, borderWidth: 1, borderColor: checked ? colors.primary : colors.border }}><Ionicons name={checked ? "checkbox" : "square-outline"} color={colors.primary} size={23}/><View style={{ flex: 1 }}><Text style={text}>{permission.label}</Text><Text style={{ color: colors.textSoft, fontSize: 11, writingDirection: "ltr" }}>{permission.key}</Text></View></Pressable>; })}
      <AppButton title="حفظ المشرف" loading={busy} disabled={draft.fullName.trim().length < 5 || !draft.email || !draft.id && !draft.password} onPress={() => { void action({ action: "save", role: "supervisor", ...draft }).then(ok => { if (ok) setDraft(null); }); }}/><AppButton title="إغلاق المحرر" disabled={busy} variant="soft" onPress={() => setDraft(null)}/>
    </Card>}
    <Field label="سبب الإيقاف أو إنهاء الجلسة أو إعادة ضبط MFA" value={reason} onChangeText={setReason} multiline maxLength={600} placeholder="يُحفظ في سجل التدقيق"/>
    {query.data?.staff.map(member => <Card key={member.id} style={{ gap: 12 }}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}><Ionicons name={member.isPlatformOwner ? "shield-checkmark" : "person-outline"} size={28} color={colors.primary}/><View style={{ flex: 1 }}><Text style={{ ...text, fontWeight: "800", fontSize: 19 }}>{member.fullName}</Text><Text selectable style={{ color: colors.textSoft, writingDirection: "ltr", fontSize: 13 }}>{member.email}</Text></View></View><Text style={text}>{member.isPlatformOwner ? "المدير الأعلى · حساب محمي" : member.status === "active" ? "مشرف نشط" : "مشرف متوقف"}</Text><Text style={{ ...text, color: colors.textSoft }}>MFA: {member.mfaEnabled ? "مفعّل" : "غير مفعّل"} · {member.sessions.length}{member.sessionsMayBeTruncated ? "+" : ""} جلسات نشطة</Text>
      {!member.isPlatformOwner && <><AppButton title="تعديل الصلاحيات" disabled={busy} variant="soft" onPress={() => { setDraft({ id: member.id, fullName: member.fullName, email: member.email, phone: member.phone || "", password: "", permissions: [...member.permissions], expectedUpdatedAt: member.updatedAt }); setPermissionQuery(""); }}/><AppButton title={member.status === "active" ? "إيقاف الحساب" : "تفعيل الحساب"} variant="soft" disabled={busy} onPress={() => manage(member, member.status === "active" ? "suspend" : "activate")}/><AppButton title="إنهاء كل الجلسات" variant="soft" disabled={busy} onPress={() => manage(member, "revokeSession", "all")}/>{member.mfaEnabled && <AppButton title="إعادة ضبط MFA" variant="soft" disabled={busy} onPress={() => manage(member, "resetMfa")}/>}<AppButton title={expanded === member.id ? "إخفاء الأجهزة" : "الأجهزة والجلسات"} variant="soft" onPress={() => setExpanded(expanded === member.id ? null : member.id)}/>{expanded === member.id && (member.sessions.length ? member.sessions.map(session => <View key={session.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 8 }}><Text style={text}>{session.deviceLabel || session.platform || "جهاز"}</Text><Text style={{ ...text, color: colors.textSoft }}>آخر نشاط: {new Date(session.lastSeenAt).toLocaleString("ar-SA")}</Text><AppButton title="إنهاء هذه الجلسة" variant="soft" disabled={busy} onPress={() => manage(member, "revokeSession", session.id)}/></View>) : <Text style={text}>لا توجد جلسات نشطة.</Text>)}</>}
    </Card>)}
    {query.data && query.data.total > query.data.pageSize && <Card style={{ gap: 10 }}><Text style={text}>صفحة {page}</Text><AppButton title="السابق" disabled={page === 1 || query.isFetching} variant="soft" onPress={() => setPage(page - 1)}/><AppButton title="التالي" disabled={page * query.data.pageSize >= query.data.total || query.isFetching} variant="soft" onPress={() => setPage(page + 1)}/></Card>}
  </View>;
}
