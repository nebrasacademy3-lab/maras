import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandMark } from "@/src/components/Brand";
import { useTheme } from "@/src/providers/ThemeProvider";

export function AppHeader({ title, subtitle, back = false, home = false, unread = 0 }: { title?: string; subtitle?: string; back?: boolean; home?: boolean; unread?: number }) {
  const { colors } = useTheme();
  return <View style={styles.header}>
    {back ? <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="arrow-forward" size={21} color={colors.text} /></Pressable> : <BrandMark size={48} whiteTile />}
    {home && <Pressable accessibilityRole="button" accessibilityLabel="الرئيسية" onPress={() => router.replace("/(tabs)")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="home-outline" size={20} color={colors.text} /></Pressable>}
    <View style={styles.copy}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{title || "مراس العلم"}</Text>{subtitle && <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSoft }]}>{subtitle}</Text>}</View>
    <Pressable accessibilityRole="button" accessibilityLabel="الإشعارات" onPress={() => router.push("/notifications")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="notifications-outline" size={21} color={colors.text} />{unread > 0 && <View style={[styles.badge, { backgroundColor: colors.danger }]}><Text>{Math.min(unread, 9)}</Text></View>}</Pressable>
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 62, flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 14 },
  copy: { flex: 1, alignItems: "flex-end" },
  title: { fontSize: 18, fontWeight: "900", writingDirection: "rtl" },
  subtitle: { fontSize: 10, marginTop: 2, writingDirection: "rtl" },
  iconButton: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -3, left: -3, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "white" },
});
