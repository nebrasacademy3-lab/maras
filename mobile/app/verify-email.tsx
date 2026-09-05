import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams, type Href } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, Field, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { authDestination, normalizeEmailCode } from "@/src/lib/account-access";
import { safeInternalPath } from "@/src/lib/notification-routing";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { SessionUser } from "@/src/types";

type VerificationStatus = { user: SessionUser; emailVerified: boolean; deliveryConfigured: boolean; cooldownSeconds: number; codeSent: boolean; expiresInSeconds: number };
export default function VerifyEmail() {
  const { user, loading, setUser } = useAuth();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ return_to?: string }>();
  const returnTo = safeInternalPath(params.return_to);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"load" | "send" | "verify" | null>("load");
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const autoSent = useRef<number | null>(null);
  const userId = user?.id;
  const send = useCallback(async () => {
    setBusy("send"); setError("");
    try {
      const result = await api<{ retryAfterSeconds: number }>("/api/auth/email-verification", { method: "POST", body: jsonBody({ action: "send" }) });
      setCooldown(Math.max(1, result.retryAfterSeconds || 60));
      setMessage("أرسلنا رمز التحقق إلى بريدك. راجع البريد الوارد والرسائل غير المرغوب فيها.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "تعذر إرسال الرمز. حاول مرة أخرى.");
      if (reason instanceof ApiError && reason.retryAfterSeconds) setCooldown(reason.retryAfterSeconds);
    } finally { setBusy(null); }
  }, []);
  useEffect(() => {
    if (!userId || autoSent.current === userId) return;

    let active = true;
    void api<VerificationStatus>("/api/auth/email-verification").then(async (status) => {
      if (!active) return;
      autoSent.current = userId;
      setUser(status.user);
      if (status.emailVerified) { router.replace(authDestination(status.user, undefined, returnTo) as Href); return; }
      if (status.codeSent || status.cooldownSeconds > 0) { setCooldown(status.cooldownSeconds); setMessage("أرسلنا لك رمزًا مؤخرًا. أدخله هنا لإتمام التحقق."); setBusy(null); }
      else if (status.deliveryConfigured) await send();
      else { setError("تعذر إرسال البريد حاليًا. يمكنك إعادة المحاولة لاحقًا أو التواصل مع الدعم."); setBusy(null); }
    }).catch((reason: unknown) => { if (active) { setError(reason instanceof ApiError ? reason.message : "تعذر تحميل حالة البريد."); setBusy(null); } });
    return () => { active = false; };
  }, [userId, setUser, returnTo, send]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const verify = async () => {
    if (busy || code.length !== 6) return;
    setBusy("verify"); setError("");
    try {
      const result = await api<{ user: SessionUser; next: string }>("/api/auth/email-verification", { method: "POST", body: jsonBody({ action: "verify", code }) });
      setUser(result.user); router.replace(authDestination(result.user, result.next, returnTo) as Href);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر التحقق من الرمز."); }
    finally { setBusy(null); }
  };
  if (loading) return <Screen><LoadingState /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Screen keyboard><AppHeader title="تأكيد البريد الإلكتروني" back />
    <Card style={styles.card}>
      <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="mail-unread-outline" size={34} color={colors.primary} /></View>
      <Text style={[styles.title, { color: colors.text }]}>خطوة واحدة لحسابك</Text>
      <Text style={[styles.copy, { color: colors.textSoft }]}>تحقق من بريدك مرة واحدة فقط. بعد اكتمال ملفك، يمكنك الشراء دون طلب رمز جديد لكل عملية.</Text>
      <Text style={[styles.email, { color: colors.primary }]}>{user.email}</Text>
      <View style={styles.form}><Field label="رمز التحقق المكوّن من 6 أرقام" value={code} onChangeText={(value) => setCode(normalizeEmailCode(value))} keyboardType="number-pad" inputDirection="ltr" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} placeholder="000000" style={styles.code} onSubmitEditing={() => void verify()} />
        {message ? <Text style={[styles.feedback, { color: colors.textSoft }]}>{message}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.danger }]}>{error}</Text> : null}
        <AppButton title="تأكيد البريد والمتابعة" icon="shield-checkmark-outline" loading={busy === "verify"} disabled={Boolean(busy) || code.length !== 6} onPress={() => void verify()} />
        <AppButton title={cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : "إعادة إرسال الرمز"} variant="ghost" loading={busy === "send"} disabled={Boolean(busy) || cooldown > 0} onPress={() => void send()} />
        <AppButton title="متابعة التصفح" variant="ghost" onPress={() => router.replace("/(tabs)")} />
      </View>
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({ card: { alignItems: "center", gap: 14, marginTop: 20, paddingVertical: 26, maxWidth: 580, width: "100%", alignSelf: "center" }, icon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" }, title: { fontSize: 25, fontWeight: "900", textAlign: "center" }, copy: { fontSize: 12, lineHeight: 23, textAlign: "center" }, email: { fontSize: 14, writingDirection: "ltr", textAlign: "center", fontWeight: "700" }, form: { width: "100%", gap: 10 }, code: { letterSpacing: 8, textAlign: "center", fontSize: 24 }, feedback: { fontSize: 12, lineHeight: 21, textAlign: "center", marginBottom: 6 } });
