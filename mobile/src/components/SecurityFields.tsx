import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { ScaledText as Text } from "./ScaledText";
import { Field } from "./ui";
import { useTheme } from "@/src/providers/ThemeProvider";
import { normalizeEmailCode } from "@/src/lib/account-access";
export function CodeField({ value, onChange, disabled, error, label = "رمز التحقق", onSubmit }: { value: string; onChange: (value: string) => void; disabled?: boolean; error?: boolean; label?: string; onSubmit?: () => void }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 9, marginBottom: 14 }}><Text style={{ fontSize: 13, fontWeight: "800", color: colors.text, textAlign: "right" }}>{label}</Text><View style={{ height: 60, direction: "ltr", opacity: disabled ? .65 : 1 }}><View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none" style={{ flexDirection: "row", gap: 7, height: 60 }}>{Array.from({ length: 6 }, (_, index) => <View key={index} style={{ flex: 1, borderRadius: 13, borderWidth: focused && index === Math.min(value.length, 5) ? 2 : 1, borderColor: error ? colors.danger : value[index] || (focused && index === value.length) ? colors.primary : colors.border, backgroundColor: value[index] ? colors.surfaceAlt : colors.surface, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 26, fontWeight: "800", color: colors.text }}>{value[index] || ""}</Text></View>)}</View><TextInput accessibilityLabel={label} accessibilityHint="أدخل ستة أرقام أو الصق الرمز كاملًا" value={value} onChangeText={text => onChange(normalizeEmailCode(text))} editable={!disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} caretHidden selectionColor="transparent" style={[StyleSheet.absoluteFillObject, { color: "transparent", backgroundColor: "transparent", fontSize: 26, writingDirection: "ltr" }]} onSubmitEditing={onSubmit} /></View><Text style={{ color: colors.textSoft, fontSize: 11 }}>يمكنك لصق الرمز المرسل إلى بريدك مباشرة.</Text></View>;
}
export function NewPasswordField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { colors } = useTheme(); const [show, setShow] = useState(false);
  return <Field label={label} value={value} onChangeText={onChange} editable={!disabled} maxLength={128} secureTextEntry={!show} inputDirection="ltr" autoComplete="new-password" icon="lock-closed-outline" trailing={<Pressable accessibilityRole="button" accessibilityLabel={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onPress={() => setShow(!show)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name={show ? "eye-off-outline" : "eye-outline"} color={colors.textSoft} size={21} /></Pressable>} />;
}
export function acceptsPassword(password: string) { return password.length >= 10 && password.length <= 128 && /\d/.test(password) && /[^\p{L}\p{N}\s]/u.test(password); }
