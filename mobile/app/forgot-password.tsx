import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, Field, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

export default function ForgotPassword() {
  const { colors } = useTheme(); const [identifier, setIdentifier] = useState(""); const [loading, setLoading] = useState(false); const [message, setMessage] = useState("");
  const submit = async () => { if (loading) return; setLoading(true); setMessage(""); try { const result = await api<{ message?: string }>("/api/auth/forgot-password", { method: "POST", body: jsonBody({ email: identifier }) }); setMessage(result.message || "إذا كان البريد مسجلًا فستصلك تعليمات الاستعادة."); } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر إرسال الطلب"); } finally { setLoading(false); } };
  return <Screen keyboard><AppHeader title="استعادة الحساب" subtitle="خطوات آمنة دون كشف الحسابات" back /><Card style={styles.card}><View style={{ width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt, marginBottom: 18 }}><Ionicons name="key-outline" size={30} color={colors.primary} /></View><Text style={[styles.title, { color: colors.text }]}>نسيت كلمة المرور؟</Text><Text style={[styles.copy, { color: colors.textSoft }]}>أدخل بريد حسابك وسنرسل رابط الاستعادة إذا كان مرتبطًا بحساب.</Text><Field label="البريد الإلكتروني" icon="mail-outline" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" maxLength={180} editable={!loading} autoComplete="email" inputDirection="ltr" /><AppButton title="إرسال رابط الاستعادة" loading={loading} disabled={!identifier.includes("@")} onPress={submit} />{message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}</Card></Screen>;
}
const styles = StyleSheet.create({ card: { marginTop: 28, padding: 26, width: "100%", maxWidth: 540, alignSelf: "center", borderRadius: 26 }, title: { fontSize: 22, fontWeight: "900", textAlign: "right" }, copy: { fontSize: 14, lineHeight: 25, textAlign: "right", marginVertical: 10 }, message: { fontSize: 11, lineHeight: 19, textAlign: "center", marginTop: 13 } });
