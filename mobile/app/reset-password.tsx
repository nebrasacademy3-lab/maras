import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Screen } from "@/src/components/ui";
import { AppHeader } from "@/src/components/AppHeader";
import { NewPasswordField, acceptsPassword } from "@/src/components/SecurityFields";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>(); const { colors } = useTheme();
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  const validLink = typeof token === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(token);
  const submit = async () => {
    if (busy || !validLink) return;
    if (!acceptsPassword(password)) { setError("استخدم 10 أحرف على الأقل مع رقم ورمز خاص."); return; }
    if (password !== confirmation) { setError("كلمتا المرور غير متطابقتين."); return; }
    setBusy(true); setError("");
    try { await api("/api/auth/reset-password", { method: "POST", body: jsonBody({ token, password }) }); setPassword(""); setConfirmation(""); setDone(true); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر الاتصال. تحقق من الإنترنت ثم حاول مرة أخرى."); }
    finally { setBusy(false); }
  };
  return <Screen keyboard showFooter={false}><AppHeader title="كلمة مرور جديدة" back /><Card style={{ width: "100%", maxWidth: 540, alignSelf: "center", marginTop: 24, padding: 24, borderRadius: 26 }}><View style={{ width: 68, height: 68, backgroundColor: colors.surfaceAlt, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 18 }}><Ionicons name={done ? "checkmark-circle-outline" : "key-outline"} size={32} color={colors.primary} /></View><Text style={{ color: colors.text, fontSize: 25, lineHeight: 37, fontWeight: "900", marginBottom: 12 }}>{done ? "تم تحديث كلمة المرور" : validLink ? "بداية جديدة لحسابك" : "لنحصل على رابط جديد"}</Text>{done ? <><Text style={{ color: colors.textSoft, fontSize: 14, lineHeight: 25, marginBottom: 20 }}>أُغلقت الجلسات السابقة. سجّل الدخول بكلمة المرور الجديدة.</Text><AppButton title="تسجيل الدخول" onPress={() => router.replace("/(auth)/login")} /></> : !validLink ? <AppButton title="طلب رابط استعادة جديد" onPress={() => router.replace("/forgot-password")} /> : <><Text style={{ color: colors.textSoft, fontSize: 13, lineHeight: 24, marginBottom: 20 }}>10 أحرف على الأقل مع رقم ورمز خاص. لا تستخدم كلمة مرور من حساب آخر.</Text><NewPasswordField label="كلمة المرور الجديدة" value={password} onChange={setPassword} disabled={busy} /><NewPasswordField label="تأكيد كلمة المرور الجديدة" value={confirmation} onChange={setConfirmation} disabled={busy} />{error ? <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 24, marginBottom: 12 }}>{error}</Text> : null}<AppButton title="حفظ كلمة المرور" loading={busy} onPress={() => void submit()} /><AppButton title="الرابط منتهي؟ طلب رابط جديد" variant="ghost" onPress={() => router.replace("/forgot-password")} /></>}</Card></Screen>;
}
