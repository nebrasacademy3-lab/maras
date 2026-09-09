import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { Pressable, StyleSheet, type TextInputProps, View } from "react-native";
import { BrandMark } from "@/src/components/Brand";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Card, Field } from "@/src/components/ui";
import { normalizeEmailCode } from "@/src/lib/account-access";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export function AuthPanel({ icon, eyebrow, title, description, children }: { icon: React.ComponentProps<typeof Ionicons>["name"]; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const { direction, rowDirection } = useLanguage();
  return <Card style={styles.panel}>
    <LinearGradient colors={[colors.surfaceAlt, colors.surface]} style={[styles.intro, { direction }]}>
      <View style={[styles.brandLine, { flexDirection: rowDirection }]}><BrandMark size={40} /><Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text><View style={[styles.icon, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name={icon} size={23} color={colors.primary} /></View></View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSoft }]}>{description}</Text>
    </LinearGradient>
    <View style={styles.body}>{children}</View>
  </Card>;
}

export function VerificationCodeField({ value, onChangeText, ...props }: Omit<TextInputProps, "onChangeText"> & { onChangeText: (value: string) => void }) {
  return <Field {...props} label="رمز التحقق المكوّن من 6 أرقام" value={value} onChangeText={(next) => onChangeText(normalizeEmailCode(next))} keyboardType="number-pad" inputDirection="ltr" textAlign="center" textContentType="oneTimeCode" autoComplete="one-time-code" autoCorrect={false} maxLength={6} placeholder="000000" style={styles.code} />;
}

export function PasswordField(props: TextInputProps & { label: string; error?: string }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  return <Field {...props} inputDirection="ltr" maxLength={128} autoCorrect={false} autoCapitalize="none" secureTextEntry={!visible} icon="lock-closed-outline" trailing={<Pressable accessibilityRole="button" accessibilityLabel={t(visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور")} onPress={() => setVisible((current) => !current)} style={styles.visibility}><Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={21} color={colors.textSoft} /></Pressable>} />;
}

export function passwordRequirements(password: string) {
  return [
    { label: "من 10 إلى 128 حرفًا", met: password.length >= 10 && password.length <= 128 },
    { label: "رقم واحد على الأقل", met: /\d/.test(password) },
    { label: "رمز خاص مثل @ أو #", met: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
}

export function PasswordRequirements({ password }: { password: string }) {
  const { colors } = useTheme();
  const { rowDirection } = useLanguage();
  return <View style={styles.requirements}>{passwordRequirements(password).map((item) => <View key={item.label} style={[styles.requirement, { flexDirection: rowDirection }]}><Ionicons name={item.met ? "checkmark-circle" : "ellipse-outline"} size={16} color={item.met ? colors.success : colors.textSoft} /><Text style={[styles.requirementText, { color: item.met ? colors.success : colors.textSoft }]}>{item.label}</Text></View>)}</View>;
}

const styles = StyleSheet.create({
  panel: { width: "100%", maxWidth: 560, alignSelf: "center", padding: 0, overflow: "hidden", marginTop: 16, borderRadius: 28 },
  intro: { padding: 24, gap: 15 }, brandLine: { alignItems: "center", gap: 10 }, eyebrow: { flex: 1, fontSize: 12, fontWeight: "800", lineHeight: 20 }, icon: { width: 46, height: 46, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 29, lineHeight: 42, fontWeight: "900" }, description: { fontSize: 13, lineHeight: 24 }, body: { padding: 22, gap: 14 }, code: { letterSpacing: 9, fontSize: 29, fontWeight: "800", minHeight: 66, textAlign: "center" }, visibility: { width: 40, minHeight: 44, alignItems: "center", justifyContent: "center" },
  requirements: { gap: 8, marginBottom: 17 }, requirement: { alignItems: "center", gap: 8 }, requirementText: { fontSize: 11, lineHeight: 19, flex: 1 },
});
