import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field } from "@/src/components/ui";
import { api, jsonBody } from "@/src/lib/api";
import { MerasAlert, nativeToast } from "@/src/lib/interaction-events";
import { useTheme } from "@/src/providers/ThemeProvider";
type Status = { available: boolean; enabled: boolean; pendingSetup: boolean; recoveryCodesRemaining: number };
export function AccountMfaPanel() {
  const { colors } = useTheme();
  const status = useQuery({ queryKey: ["account-mfa"], queryFn: () => api<Status>("/api/account/mfa") });
  const [password, setPassword] = useState(""); const [code, setCode] = useState(""); const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(action: string) {
    setBusy(true); setError("");
    try {
      const result = await api<{ secret?: string; recoveryCodes?: string[] }>("/api/account/mfa", { method: "POST", body: jsonBody({ action, password, code }) });
      if (result.secret) setSecret(result.secret);
      if (result.recoveryCodes) setCodes(result.recoveryCodes);
      if (action !== "setup") { setSecret(""); setPassword(""); setCode(""); await status.refetch(); }
      nativeToast("تم تحديث أمان الحساب", "success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحديث الأمان"); }
    finally { setBusy(false); }
  }
  function sensitive(action: string) {
    MerasAlert.alert(action === "disable" ? "تعطيل التحقق الإضافي؟" : "استبدال رموز الاستعادة؟", action === "disable" ? "ستصبح كلمة المرور كافية لتسجيل الدخول. ستُلغى جلسات الأجهزة الأخرى." : "ستتوقف الرموز السابقة عن العمل. احفظ الرموز الجديدة في مكان خاص وآمن.", [{ text: "إلغاء", style: "cancel" }, { text: "تأكيد", style: "destructive", onPress: () => void submit(action) }]);
  }
  return <Card style={{ gap: 15, marginTop: 16 }}><View style={{ flexDirection: "row-reverse", gap: 12, alignItems: "center" }}><Ionicons name="shield-checkmark-outline" color={colors.primary} size={28} /><Text style={{ color: colors.text, fontWeight: "800", fontSize: 19, flex: 1, textAlign: "right" }}>المصادقة متعددة العوامل</Text></View><Text selectable style={{ color: colors.textSoft, fontSize: 14, lineHeight: 25, textAlign: "right" }}>{status.data?.enabled ? "مفعّلة لحسابك" : "حماية إضافية اختيارية"} · يطلب الرمز عند الدخول، حتى باستخدام Google أو Apple.</Text>
    {(error || status.error) && <Text selectable accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 24 }}>{error || "تعذر تحميل الإعداد. أعد المحاولة."}</Text>}
    {!status.data && <AppButton title="إعادة التحميل" loading={status.isFetching} onPress={() => void status.refetch()} variant="soft" />}
    {status.data && !status.data.available && <Text style={{ color: colors.textSoft }}>الخدمة تحتاج إعدادًا من الإدارة قبل التفعيل.</Text>}
    {status.data?.available && <><Field label="كلمة المرور الحالية" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} autoComplete="current-password" />
      {secret && <View style={{ padding: 16, gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: 16 }}><Text style={{ color: colors.textSoft, lineHeight: 24 }}>أضف المفتاح إلى تطبيق المصادقة. النوع TOTP، ستة أرقام، 30 ثانية. لا تشاركه.</Text><Text selectable style={{ color: colors.text, fontSize: 17, textAlign: "center", writingDirection: "ltr" }}>{secret}</Text></View>}
      {(secret || status.data.enabled || status.data.pendingSetup) && <Field label="رمز تطبيق المصادقة" value={code} onChangeText={value => setCode(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" placeholder="000000" />}
      {!status.data.enabled ? <><AppButton title={secret ? "إنشاء مفتاح جديد" : "بدء التفعيل"} disabled={!password} loading={busy} onPress={() => void submit("setup")} />{(secret || status.data.pendingSetup) && <AppButton title="تحقق وفعّل" disabled={!password || code.length !== 6} loading={busy} onPress={() => void submit("verify")} />}</> : <><Text selectable style={{ color: colors.textSoft }}>{status.data.recoveryCodesRemaining} رموز استعادة غير مستخدمة.</Text><AppButton title="إنشاء رموز استعادة جديدة" disabled={!password || code.length !== 6 || busy} variant="soft" onPress={() => sensitive("recovery")} /><AppButton title="تعطيل التحقق الإضافي" disabled={!password || code.length !== 6 || busy} variant="danger" onPress={() => sensitive("disable")} /></>}
    </>}
    {codes.length > 0 && <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.surfaceAlt, gap: 12 }}><Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>احفظ الرموز الآن — تظهر مرة واحدة</Text><Text style={{ color: colors.textSoft, lineHeight: 24 }}>كل رمز يُستخدم مرة واحدة. لا ترسله للدعم أو لأي شخص.</Text>{codes.map(value => <Text key={value} selectable style={{ color: colors.text, fontSize: 16, textAlign: "center", writingDirection: "ltr" }}>{value}</Text>)}<AppButton title="حفظ نسخة خاصة" variant="soft" onPress={() => { void Share.share({ title: "رموز استعادة مراس — سرية", message: `رموز استعادة مراس العلم — احتفظ بها سرًا\n${codes.join("\n")}` }).catch(() => setError("تعذر حفظ النسخة. انسخ الرموز يدويًا.")); }} /><AppButton title="حفظتها — إخفاء" variant="soft" onPress={() => setCodes([])} /></View>}
  </Card>;
}
