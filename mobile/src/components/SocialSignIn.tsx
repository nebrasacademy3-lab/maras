import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import React, { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton } from "@/src/components/ui";
import { api, ApiError } from "@/src/lib/api";
import { authDestination } from "@/src/lib/account-access";
import type { SocialProvider } from "@/src/lib/social-auth";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export function SocialSignIn({ returnTo, referralCode, disabled = false }: { returnTo?: string | null; referralCode?: string; disabled?: boolean }) {
  const { colors } = useTheme();
  const { socialLogin } = useAuth();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState("");
  const providers = useQuery({ queryKey: ["oauth-providers"], queryFn: () => api<{ google: boolean; apple: boolean }>("/api/auth/oauth/providers"), staleTime: 60_000 });
  if (Platform.OS === "web" || (!providers.data?.google && !providers.data?.apple)) return null;
  const start = async (provider: SocialProvider) => {
    if (busy || disabled) return;
    setBusy(provider); setError("");
    try {
      const result = await socialLogin(provider, referralCode);
      if (result) router.replace(authDestination(result.user, result.next, returnTo) as Href);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر تسجيل الدخول. حاول مرة أخرى."); }
    finally { setBusy(null); }
  };
  return <View style={styles.wrap}>
    <View style={styles.separator}><View style={[styles.rule, { backgroundColor: colors.border }]} /><Text style={[styles.label, { color: colors.textSoft }]}>أو تابع باستخدام</Text><View style={[styles.rule, { backgroundColor: colors.border }]} /></View>
    {providers.data?.google ? <AppButton title="المتابعة باستخدام Google" icon="logo-google" variant="ghost" loading={busy === "google"} disabled={disabled || Boolean(busy)} onPress={() => void start("google")} /> : null}
    {providers.data?.apple ? <AppButton title="المتابعة باستخدام Apple" icon="logo-apple" variant="ghost" loading={busy === "apple"} disabled={disabled || Boolean(busy)} onPress={() => void start("apple")} /> : null}
    <Text style={[styles.note, { color: colors.textSoft }]}>بعد تسجيل الدخول، أكمل بيانات جامعتك وتخصصك لتجربة تناسبك.</Text>
    {error ? <Text accessibilityRole="alert" style={[styles.note, { color: colors.danger }]}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({ wrap: { gap: 10, marginTop: 18 }, separator: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 }, rule: { height: 1, flex: 1 }, label: { fontSize: 12 }, note: { fontSize: 11, lineHeight: 20, textAlign: "center" } });
