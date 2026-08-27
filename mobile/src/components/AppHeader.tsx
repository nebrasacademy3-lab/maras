import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandMark } from "@/src/components/Brand";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export function AppHeader({ title, subtitle, back = false, home = false, unread = 0, auth = false }: { title?: string; subtitle?: string; back?: boolean; home?: boolean; unread?: number; auth?: boolean }) {
  const { colors, dark, setMode } = useTheme();
  const { user } = useAuth();
  const cart = useQuery({ queryKey: ["cart", user?.id], queryFn: () => api<{ count?: number; courseSlugs?: string[]; items?: unknown[] }>("/api/cart"), enabled: Boolean(user) && !auth });
  const favorites = useQuery({ queryKey: ["favorites", user?.id], queryFn: () => api<{ courseSlugs: string[] }>("/api/mobile/favorites"), enabled: Boolean(user) && !auth });
  const cartCount = cart.data?.count ?? cart.data?.courseSlugs?.length ?? cart.data?.items?.length ?? 0;
  const favoriteCount = favorites.data?.courseSlugs?.length || 0;
  const badge = (value: number) => value > 0 ? <View style={[styles.badge, { backgroundColor: colors.danger }]}><Text style={styles.badgeText}>{value > 99 ? "99+" : value}</Text></View> : null;
  if (auth) return <View style={styles.authHeader}><BrandMark size={48} whiteTile /><View style={styles.authCopy}><Text numberOfLines={1} style={[styles.authTitle, { color: colors.text }]}>{title || "مراس العلم"}</Text>{subtitle && <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSoft }]}>{subtitle}</Text>}</View><View style={styles.authActions}><Pressable accessibilityRole="button" accessibilityLabel="الرئيسية" onPress={() => router.replace("/(tabs)")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="home-outline" size={20} color={colors.text} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={dark ? "الوضع الفاتح" : "الوضع الليلي"} onPress={() => setMode(dark ? "light" : "dark")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name={dark ? "sunny-outline" : "moon-outline"} size={20} color={colors.text} /></Pressable></View></View>;
  return <View style={styles.header}>
    {back ? <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="arrow-forward" size={21} color={colors.text} /></Pressable> : <BrandMark size={48} whiteTile />}
    {home && <Pressable accessibilityRole="button" accessibilityLabel="الرئيسية" onPress={() => router.replace("/(tabs)")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="home-outline" size={20} color={colors.text} /></Pressable>}
    <View style={styles.copy}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{title || "مراس العلم"}</Text>{subtitle && <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSoft }]}>{subtitle}</Text>}</View>
    {user && <View style={styles.commerceActions}><Pressable accessibilityRole="button" accessibilityLabel={`السلة${cartCount ? `، ${cartCount} مواد` : ""}`} onPress={() => router.push("/cart")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="bag-handle-outline" size={20} color={colors.text} />{badge(cartCount)}</Pressable><Pressable accessibilityRole="button" accessibilityLabel={`المفضلة${favoriteCount ? `، ${favoriteCount} مواد` : ""}`} onPress={() => router.push("/favorites")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="heart" size={20} color={favoriteCount ? colors.danger : colors.text} />{badge(favoriteCount)}</Pressable></View>}
    <Pressable accessibilityRole="button" accessibilityLabel="الإشعارات" onPress={() => router.push("/notifications")} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="notifications-outline" size={21} color={colors.text} />{badge(unread)}</Pressable>
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 62, flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 14 }, authHeader: { minHeight: 62, flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 14 }, authCopy: { flex: 1, alignItems: "flex-end" }, authTitle: { fontSize: 16, fontWeight: "900", writingDirection: "rtl" }, authActions: { flexDirection: "row-reverse", gap: 7 }, copy: { flex: 1, alignItems: "flex-end" }, commerceActions: { flexDirection: "row-reverse", gap: 6 }, title: { fontSize: 18, fontWeight: "900", writingDirection: "rtl" }, subtitle: { fontSize: 10, marginTop: 2, writingDirection: "rtl" }, iconButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" }, badge: { position: "absolute", top: -4, left: -4, minWidth: 18, height: 18, paddingHorizontal: 3, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "white" }, badgeText: { color: "#FFF", fontSize: 8, fontWeight: "900" },
});
