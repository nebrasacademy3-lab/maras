import { type Href, router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, Field, Screen } from "@/src/components/ui";
import { ApiError } from "@/src/lib/api";
import { safeInternalPath } from "@/src/lib/notification-routing";
import { authDestination } from "@/src/lib/account-access";
import { SocialSignIn } from "@/src/components/SocialSignIn";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

export default function Login() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const { direction, rowDirection, textAlign, t } = useLanguage();
  const { width } = useWindowDimensions();
  const wide = width >= 780;
  const params = useLocalSearchParams<{ return_to?: string | string[] }>();
  const returnTo = safeInternalPath(Array.isArray(params.return_to) ? params.return_to[0] : params.return_to);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await login({ identifier, password });
      router.replace(authDestination(result.user, result.next, returnTo) as Href);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return <Screen keyboard showFooter={false}><AppHeader title="تسجيل الدخول" subtitle="أهلًا بعودتك إلى مراس" auth />
    <View style={[styles.layout, { direction, flexDirection: wide ? rowDirection : "column" }]}>
      <LinearGradient colors={[colors.hero, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.intro, wide ? styles.introWide : styles.introCompact]}>
        <View style={styles.glow} /><View style={styles.introIcon}><Ionicons name="sparkles-outline" size={24} color="#FFFFFF" /></View>
        <Text style={styles.eyebrow}>مساحتك التعليمية</Text>
        <Text accessibilityRole="header" style={styles.introTitle}>عد إلى ما يهمك.</Text>
        <Text style={styles.introCopy}>موادك وتقدمك وأدوات مراس في مكان واحد، على كل أجهزتك.</Text>
        {wide ? <View style={styles.trustRow}><Ionicons name="shield-checkmark-outline" size={18} color="#D9E8FF" /><Text style={styles.trustCopy}>دخول آمن إلى حسابك</Text></View> : null}
      </LinearGradient>
      <Card style={[styles.formCard, wide && styles.formWide]}>
        <Text accessibilityRole="header" style={[styles.formTitle, { color: colors.text }]}>مرحبًا بعودتك</Text>
        <Text style={[styles.formCopy, { color: colors.textSoft }]}>استخدم البريد الإلكتروني أو رقم الجوال المرتبط بحسابك.</Text>
        <Field label="البريد أو رقم الجوال" icon="person-outline" autoCapitalize="none" autoComplete="username" keyboardType="email-address" value={identifier} onChangeText={setIdentifier} placeholder="name@example.com" />
        <Field label="كلمة المرور" icon="lock-closed-outline" inputDirection="ltr" autoComplete="current-password" secureTextEntry={!show} value={password} onChangeText={setPassword} placeholder="••••••••••" trailing={<Pressable accessibilityRole="button" accessibilityLabel={t(show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور")} onPress={() => setShow((value) => !value)} style={styles.eyeInline}><Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={21} color={colors.textSoft} /></Pressable>} />
        <Pressable accessibilityRole="button" accessibilityLabel={t("نسيت كلمة المرور؟")} style={styles.forgotButton} onPress={() => router.push("/forgot-password")}><Text style={[styles.forgot, { color: colors.primary, textAlign }]}>نسيت كلمة المرور؟</Text></Pressable>
        {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        <AppButton title="دخول آمن" icon="shield-checkmark-outline" loading={loading} disabled={!identifier || password.length < 8} onPress={submit} />
        <View style={styles.social}><SocialSignIn returnTo={returnTo} disabled={loading} /></View>
        <View style={[styles.signup, { direction, flexDirection: rowDirection, borderTopColor: colors.border }]}><Text style={{ color: colors.textSoft }}>ليس لديك حساب؟</Text><Pressable accessibilityRole="button" accessibilityLabel={t("أنشئ حسابك الآن")} onPress={() => router.replace("/(auth)/register")} style={styles.signupButton}><Text style={{ color: colors.primary, fontWeight: "900" }}>أنشئ حسابك الآن</Text></Pressable></View>
      </Card>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  layout: { gap: 16, alignItems: "stretch", marginTop: 4 },
  intro: { borderRadius: 28, padding: 24, overflow: "hidden", justifyContent: "center" },
  introCompact: { minHeight: 180 },
  introWide: { width: "42%", minHeight: 530, padding: 34 },
  glow: { position: "absolute", width: 250, height: 250, borderRadius: 125, top: -125, right: -65, backgroundColor: "rgba(135,189,255,.17)" },
  introIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(255,255,255,.17)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  eyebrow: { color: "#C8D9FF", fontSize: 12, fontWeight: "800", marginBottom: 5 },
  introTitle: { color: "#FFFFFF", fontSize: 28, lineHeight: 37, fontWeight: "900" },
  introCopy: { color: "#DCE8FF", fontSize: 14, lineHeight: 23, marginTop: 8 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 30 },
  trustCopy: { color: "#D9E8FF", fontSize: 13 },
  formCard: { padding: 22, justifyContent: "center" },
  formWide: { flex: 1, minWidth: 0, padding: 30 },
  formTitle: { fontSize: 24, lineHeight: 33, fontWeight: "900" },
  formCopy: { fontSize: 14, lineHeight: 23, marginTop: 6, marginBottom: 23 },
  eyeInline: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  forgotButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: -4, marginBottom: 15 },
  forgot: { fontSize: 13, fontWeight: "800" },
  error: { fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 12 },
  social: { marginTop: 8 },
  signup: { alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 5, borderTopWidth: 1, paddingTop: 17, marginTop: 20 },
  signupButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
});
