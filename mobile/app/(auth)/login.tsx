import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/src/components/AppHeader";
import { FeatureDisabledNotice, FIRST_RUN_ONBOARDING_KEY, usePlatformControls } from "@/src/components/PlatformControls";
import { AppButton, Field, Screen } from "@/src/components/ui";
import { ApiError } from "@/src/lib/api";
import { authGateHref, resolveAuthReturnRoute } from "@/src/lib/authReturnRoute";
import { syncOnboardingCompletion } from "@/src/lib/onboardingSync";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export default function Login() {
  const { login, refresh } = useAuth(); const { colors } = useTheme(); const controls = usePlatformControls();
  const { return_to: returnToParam } = useLocalSearchParams<{ return_to?: string | string[] }>();
  const returnRoute = resolveAuthReturnRoute(returnToParam);
  const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const submit = async () => { setLoading(true); setError(""); try { const result = await login({ identifier, password }); if (result.next === "/complete-profile") { router.replace(authGateHref("/complete-profile", returnRoute)); return; } if (result.next === "/onboarding") { let onboardingSeen = false; try { onboardingSeen = Boolean(await SecureStore.getItemAsync(FIRST_RUN_ONBOARDING_KEY)); } catch { /* Show onboarding if local state cannot be read. */ } const explicitlyDisabled = controls.ready && !controls.enabled("onboarding"); if (!onboardingSeen && !explicitlyDisabled) { router.replace(authGateHref("/onboarding", returnRoute)); return; } if ((onboardingSeen || explicitlyDisabled) && await syncOnboardingCompletion(result.user)) await refresh(); } router.replace(returnRoute?.href || "/(tabs)"); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر تسجيل الدخول"); } finally { setLoading(false); } };
  return <Screen keyboard><AppHeader title="تسجيل الدخول" subtitle="أهلًا بعودتك إلى مراس" auth /><Text style={[styles.title, { color: colors.text }]}>تابع تعلمك من حيث توقفت</Text><Text style={[styles.copy, { color: colors.textSoft }]}>استخدم البريد الإلكتروني أو رقم الجوال المرتبط بحسابك.</Text><Field label="البريد أو رقم الجوال" icon="person-outline" autoCapitalize="none" keyboardType="email-address" value={identifier} onChangeText={setIdentifier} placeholder="name@example.com" /><View><Field label="كلمة المرور" icon="lock-closed-outline" secureTextEntry={!show} value={password} onChangeText={setPassword} placeholder="••••••••••" /><Pressable onPress={() => setShow((value) => !value)} style={styles.eye}><Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSoft} /></Pressable></View><Pressable onPress={() => router.push("/forgot-password")}><Text style={[styles.forgot, { color: colors.primary }]}>نسيت كلمة المرور؟</Text></Pressable>{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AppButton title="دخول آمن" icon="shield-checkmark-outline" loading={loading} disabled={!identifier || password.length < 8} onPress={submit} />{controls.enabled("registration") ? <View style={styles.signup}><Text style={{ color: colors.textSoft }}>ليس لديك حساب؟</Text><Pressable onPress={() => router.replace(returnRoute ? { pathname: "/(auth)/register", params: { return_to: returnRoute.path } } : "/(auth)/register")}><Text style={{ color: colors.primary, fontWeight: "900" }}>أنشئ حسابك الآن</Text></Pressable></View> : <View style={{ marginTop: 18 }}><FeatureDisabledNotice title="التسجيل غير متاح الآن" message={controls.messageFor("يمكنك تسجيل الدخول إلى حسابك الحالي أو العودة لاحقًا.")} /></View>}</Screen>;
}

const styles = StyleSheet.create({ title: { fontSize: 25, lineHeight: 36, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 10 }, copy: { fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginBottom: 24 }, eye: { position: "absolute", left: 15, top: 36, padding: 6 }, forgot: { fontSize: 11, fontWeight: "800", textAlign: "left", marginTop: -6, marginBottom: 18 }, error: { fontSize: 11, lineHeight: 19, textAlign: "center", marginBottom: 12 }, signup: { flexDirection: "row-reverse", gap: 5, justifyContent: "center", marginTop: 20 },
});
