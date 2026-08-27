import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, Field, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

export default function ForgotPassword() {
  const { colors } = useTheme(); const [identifier, setIdentifier] = useState(""); const [loading, setLoading] = useState(false); const [message, setMessage] = useState("");
  const submit = async () => { setLoading(true); setMessage(""); try { const result = await api<{ message?: string }>("/api/auth/forgot-password", { method: "POST", body: jsonBody({ identifier }) }); setMessage(result.message || "إذا كانت البيانات مسجلة فستصلك تعليمات الاستعادة."); } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر إرسال الطلب"); } finally { setLoading(false); } };
  return <Screen keyboard><AppHeader title="استعادة الحساب" subtitle="خطوات آمنة دون كشف الحسابات" back /><Card style={styles.card}><Text style={[styles.title, { color: colors.text }]}>نسيت كلمة المرور؟</Text><Text style={[styles.copy, { color: colors.textSoft }]}>أدخل بريدك أو رقم جوالك وسنرسل تعليمات الاستعادة إذا كان مرتبطًا بحساب.</Text><Field label="البريد أو الجوال" icon="mail-outline" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" /><AppButton title="إرسال التعليمات" loading={loading} disabled={!identifier} onPress={submit} />{message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}</Card></Screen>;
}
const styles = StyleSheet.create({ card: { marginTop: 34 }, title: { fontSize: 22, fontWeight: "900", textAlign: "right" }, copy: { fontSize: 12, lineHeight: 21, textAlign: "right", marginVertical: 10 }, message: { fontSize: 11, lineHeight: 19, textAlign: "center", marginTop: 13 } });

