import { type Href, router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Field, Screen } from "@/src/components/ui";
import { ApiError } from "@/src/lib/api";
import { safeInternalPath } from "@/src/lib/notification-routing";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

export default function Login() {
  const { login } = useAuth(); const { colors } = useTheme(); const { direction, rowDirection, textAlign } = useLanguage();
  const params = useLocalSearchParams<{ return_to?: string | string[] }>();
  const returnTo = safeInternalPath(Array.isArray(params.return_to) ? params.return_to[0] : params.return_to);
  const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const submit = async () => { setLoading(true); setError(""); try { const result = await login({ identifier, password }); if (result.next === "/onboarding") router.replace("/onboarding"); else if (result.next === "/complete-profile") router.replace("/complete-profile"); else if (returnTo) router.replace(returnTo as Href); else router.replace("/(tabs)"); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر تسجيل الدخول"); } finally { setLoading(false); } };
  return <Screen keyboard><AppHeader title="تسجيل الدخول" subtitle="أهلًا بعودتك إلى مراس" auth /><Text style={[styles.title, { color: colors.text }]}>تابع تعلمك من حيث توقفت</Text><Text style={[styles.copy, { color: colors.textSoft }]}>استخدم البريد الإلكتروني أو رقم الجوال المرتبط بحسابك.</Text><Field label="البريد أو رقم الجوال" icon="person-outline" autoCapitalize="none" keyboardType="email-address" value={identifier} onChangeText={setIdentifier} placeholder="name@example.com" /><Field label="كلمة المرور" icon="lock-closed-outline" inputDirection="ltr" secureTextEntry={!show} value={password} onChangeText={setPassword} placeholder="••••••••••" trailing={<Pressable onPress={() => setShow((value) => !value)} style={styles.eyeInline}><Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSoft} /></Pressable>} /><Pressable style={{ alignSelf: "flex-start" }} onPress={() => router.push("/forgot-password")}><Text style={[styles.forgot, { color: colors.primary, textAlign }]}>نسيت كلمة المرور؟</Text></Pressable>{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AppButton title="دخول آمن" icon="shield-checkmark-outline" loading={loading} disabled={!identifier || password.length < 8} onPress={submit} /><View style={[styles.signup, { direction, flexDirection: rowDirection }]}><Text style={{ color: colors.textSoft }}>ليس لديك حساب؟</Text><Pressable onPress={() => router.replace("/(auth)/register")}><Text style={{ color: colors.primary, fontWeight: "900" }}>أنشئ حسابك الآن</Text></Pressable></View></Screen>;
}

const styles = StyleSheet.create({ title: { fontSize: 25, lineHeight: 36, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 10 }, copy: { fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginBottom: 24 }, eyeInline: { padding: 6, marginHorizontal: -4 }, forgot: { fontSize: 11, fontWeight: "800", textAlign: "left", marginTop: -6, marginBottom: 18 }, error: { fontSize: 11, lineHeight: 19, textAlign: "center", marginBottom: 12 }, signup: { flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 20 },
});

