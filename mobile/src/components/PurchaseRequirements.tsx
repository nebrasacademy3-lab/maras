import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card } from "@/src/components/ui";
import { hasCompleteAcademicProfile, purchaseAccountRequirement } from "@/src/lib/account-access";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export function PurchaseRequirements({ returnTo = "/cart" }: { returnTo?: string }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const requirement = purchaseAccountRequirement(user);
  if (!requirement) return null;
  return <Card style={styles.card}>
    <View style={styles.head}><Ionicons name="shield-checkmark-outline" size={24} color={colors.primary} /><Text style={[styles.title, { color: colors.text }]}>جهّز حسابك للاشتراك</Text></View>
    <Text style={[styles.copy, { color: colors.textSoft }]}>الشراء يتطلب ملفًا مكتملًا وبريدًا تم التحقق منه. تأكيد البريد مرة واحدة للحساب، وليس مع كل عملية شراء.</Text>
    <Text style={[styles.status, { color: user?.emailVerified ? colors.success : colors.textSoft }]}>{user?.emailVerified ? "✓ البريد الإلكتروني مؤكد" : "○ تأكيد البريد الإلكتروني"}</Text>
    <Text style={[styles.status, { color: hasCompleteAcademicProfile(user) ? colors.success : colors.textSoft }]}>{hasCompleteAcademicProfile(user) ? "✓ بيانات الملف مكتملة" : "○ إكمال بيانات الجامعة والتخصص والجوال"}</Text>
    <AppButton title={!user ? "تسجيل الدخول" : requirement === "/verify-email" ? "تأكيد بريدي الإلكتروني" : "إكمال بيانات الملف"} onPress={() => router.push(`${requirement}?return_to=${encodeURIComponent(returnTo)}` as Href)} />
  </Card>;
}

const styles = StyleSheet.create({ card: { gap: 10, marginVertical: 14 }, head: { flexDirection: "row", gap: 10, alignItems: "center" }, title: { flex: 1, fontSize: 16, fontWeight: "900" }, copy: { fontSize: 12, lineHeight: 22 }, status: { fontSize: 12, lineHeight: 20 } });
