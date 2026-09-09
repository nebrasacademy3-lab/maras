import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { AuthPanel } from "@/src/components/AuthPanel";
import { AppButton, Field, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

export default function ForgotPassword() {
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());
  const submit = async () => {
    if (loading || cooldown || !validEmail) return;
    setLoading(true); setError("");
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: jsonBody({ email: identifier.trim() }) });
      setSent(true); setCooldown(60);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "تعذر إرسال الطلب. حاول مرة أخرى.");
      if (reason instanceof ApiError && reason.retryAfterSeconds) setCooldown(reason.retryAfterSeconds);
    } finally { setLoading(false); }
  };
  return <Screen keyboard><AppHeader title="استعادة الحساب" back />
    <AuthPanel icon={sent ? "mail-open-outline" : "key-outline"} eyebrow="دائمًا، طريق للعودة" title={sent ? "راجع بريدك الإلكتروني" : "لنُعِدك إلى التعلّم."} description={sent ? "إذا كان البريد مرتبطًا بحساب، ستصلك رسالة تحتوي على رابط لإنشاء كلمة مرور جديدة." : "نسيت كلمة المرور؟ أدخل بريد حسابك، وسنساعدك على العودة بخطوات بسيطة."}>
      {sent ? <View style={[styles.success, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="mail-outline" size={25} color={colors.primary} /><Text selectable style={[styles.email, { color: colors.text }]}>{identifier.trim()}</Text><Text style={[styles.hint, { color: colors.textSoft }]}>راجع البريد الوارد والرسائل غير المرغوب فيها، وافتح أحدث رسالة للاستعادة.</Text></View> : <Field label="البريد الإلكتروني" icon="mail-outline" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="name@example.com" editable={!loading} onSubmitEditing={() => void submit()} returnKeyType="send" />}
      {error ? <Text accessibilityRole="alert" style={[styles.hint, { color: colors.danger }]}>{error}</Text> : null}
      <AppButton title={cooldown ? `إعادة الإرسال بعد ${cooldown} ثانية` : sent ? "إعادة إرسال الرابط" : "إرسال رابط الاستعادة"} icon="mail-outline" loading={loading} disabled={!validEmail || cooldown > 0} onPress={() => void submit()} />
      {sent ? <AppButton title="استخدام بريد آخر" variant="ghost" onPress={() => { setSent(false); setError(""); }} /> : null}
      <AppButton title="العودة إلى تسجيل الدخول" variant="ghost" onPress={() => router.replace("/(auth)/login")} />
    </AuthPanel>
  </Screen>;
}
const styles = StyleSheet.create({ success: { padding: 20, borderRadius: 18, alignItems: "center", gap: 12 }, email: { fontSize: 14, fontWeight: "700", writingDirection: "ltr", textAlign: "center" }, hint: { fontSize: 12, lineHeight: 23, textAlign: "center" } });
