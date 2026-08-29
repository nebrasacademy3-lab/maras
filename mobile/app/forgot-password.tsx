import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, Field, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

export default function ForgotPassword() {
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async () => {
    setLoading(true); setMessage("");
    try { const result = await api<{ message?: string }>("/api/auth/forgot-password", { method: "POST", body: jsonBody({ email: identifier }) }); setMessage(result.message || "إذا كان البريد مسجلًا فستصلك تعليمات الاستعادة."); }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر إرسال الطلب"); }
    finally { setLoading(false); }
  };

  return <Screen keyboard footer={false}>
    <AppHeader title="استعادة الحساب" subtitle="خطوات آمنة دون كشف الحسابات" back />
    <View style={[styles.hero, { backgroundColor: colors.primary }]}>
      <View style={styles.heroIcon}><Ionicons name="key-outline" size={30} color="#FFFFFF" /></View>
      <Text style={styles.heroTitle}>استعد وصولك بأمان</Text>
      <Text style={styles.heroCopy}>نرسل رابط الاستعادة إلى البريد المسجل فقط، ولا نكشف ما إذا كان البريد مرتبطًا بحساب حفاظًا على الخصوصية.</Text>
    </View>
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.text }]}>أدخل بريد الحساب</Text>
      <Text style={[styles.copy, { color: colors.textSoft }]}>تحقق من كتابة البريد بشكل صحيح ثم راجع صندوق الوارد والرسائل غير المرغوبة.</Text>
      <Field label="البريد الإلكتروني" icon="mail-outline" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" />
      <AppButton title="إرسال رابط الاستعادة" icon="mail-unread-outline" loading={loading} disabled={!identifier.includes("@")} onPress={submit} />
      {message ? <View style={[styles.messageBox, { backgroundColor: `${colors.primary}10` }]}><Ionicons name="information-circle-outline" size={17} color={colors.primary} /><Text style={[styles.message, { color: colors.primary }]}>{message}</Text></View> : null}
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 25, padding: 21, alignItems: "flex-end", marginBottom: 14 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,.15)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", textAlign: "right", marginTop: 12 },
  heroCopy: { color: "#DCE8FF", fontSize: 10, lineHeight: 19, textAlign: "right", writingDirection: "rtl", marginTop: 5 },
  card: { marginTop: 0 },
  title: { fontSize: 19, fontWeight: "900", textAlign: "right" },
  copy: { fontSize: 11, lineHeight: 20, textAlign: "right", marginVertical: 8, writingDirection: "rtl" },
  messageBox: { flexDirection: "row-reverse", alignItems: "center", gap: 7, padding: 11, borderRadius: 12, marginTop: 13 },
  message: { flex: 1, fontSize: 10, lineHeight: 18, textAlign: "right" },
});
