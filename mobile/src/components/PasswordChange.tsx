import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { normalizeEmailCode } from "@/src/lib/account-access";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export function PasswordChange() {
  const { user, refresh } = useAuth();
  const { colors } = useTheme();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"send" | "confirm" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const send = async () => {
    setBusy("send"); setError(""); setMessage("");
    try {
      const result = await api<{ retryAfterSeconds?: number }>("/api/profile/password", { method: "POST", body: jsonBody({ action: "send" }) });
      setSent(true); setCode(""); setCooldown(Math.max(1, result.retryAfterSeconds || 60)); setMessage("أرسلنا رمز تأكيد تغيير كلمة المرور إلى بريدك الإلكتروني.");
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر إرسال رمز التأكيد."); if (reason instanceof ApiError && reason.retryAfterSeconds) { setCooldown(reason.retryAfterSeconds); setSent(true); } }
    finally { setBusy(null); }
  };
  const confirm = async () => {
    if (busy || code.length !== 6 || password !== confirmation) return;
    setBusy("confirm"); setError(""); setMessage("");
    try {
      await api("/api/profile/password", { method: "POST", body: jsonBody({ action: "confirm", code, newPassword: password }) });
      setCode(""); setPassword(""); setConfirmation(""); setSent(false); setMessage("تم تحديث كلمة المرور بنجاح."); await refresh();
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر تغيير كلمة المرور."); }
    finally { setBusy(null); }
  };
  return <Card style={styles.card}>
    <Text style={[styles.title, { color: colors.text }]}>تعيين أو تغيير كلمة المرور</Text>
    <Text style={[styles.copy, { color: colors.textSoft }]}>نرسل رمزًا إلى بريد حسابك لتأكيد تغيير كلمة المرور. يمكنك استخدامها أيضًا إذا أنشأت حسابك عبر Google أو Apple.</Text>
    <Text style={[styles.email, { color: colors.primary }]}>{user?.email}</Text>
    <AppButton title={cooldown ? `إعادة إرسال الرمز بعد ${cooldown} ثانية` : sent ? "إعادة إرسال رمز التأكيد" : "إرسال رمز التأكيد إلى بريدي"} variant="soft" disabled={Boolean(busy) || cooldown > 0} loading={busy === "send"} onPress={() => void send()} />
    {sent ? <View style={styles.form}>
      <Field label="رمز تأكيد تغيير كلمة المرور" value={code} onChangeText={(value) => setCode(normalizeEmailCode(value))} inputDirection="ltr" keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="one-time-code" />
      <Field label="كلمة المرور الجديدة" value={password} onChangeText={setPassword} inputDirection="ltr" secureTextEntry autoComplete="new-password" placeholder="10 أحرف، رقم ورمز خاص" />
      <Field label="تأكيد كلمة المرور الجديدة" value={confirmation} onChangeText={setConfirmation} inputDirection="ltr" secureTextEntry autoComplete="new-password" />
      <AppButton title="تأكيد وحفظ كلمة المرور" disabled={Boolean(busy) || code.length !== 6 || password.length < 10 || password !== confirmation} loading={busy === "confirm"} onPress={() => void confirm()} />
    </View> : null}
    {message ? <Text style={[styles.copy, { color: colors.success }]}>{message}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={[styles.copy, { color: colors.danger }]}>{error}</Text> : null}
  </Card>;
}

const styles = StyleSheet.create({ card: { marginTop: 16, gap: 12 }, title: { fontSize: 18, fontWeight: "900" }, copy: { fontSize: 12, lineHeight: 22 }, email: { fontSize: 13, writingDirection: "ltr", textAlign: "center" }, form: { marginTop: 6 } });
