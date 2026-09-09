import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandMark } from "@/src/components/Brand";
import { api, STORE_COMMERCE_ENABLED } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

export function AppHeader({ title, subtitle, back = false, home = false, unread = 0, auth = false, onBack }: { title?: string; subtitle?: string; back?: boolean; home?: boolean; unread?: number; auth?: boolean; onBack?: () => void }) {
  const { colors, dark, setMode } = useTheme();
  const { isRTL, direction, rowDirection, t } = useLanguage();
  const { user } = useAuth();
  const cart = useQuery({ queryKey: ["cart", user?.id], queryFn: () => api<{ count?: number; courseSlugs?: string[]; items?: unknown[] }>("/api/cart"), enabled: STORE_COMMERCE_ENABLED && Boolean(user) && !auth });
  const favorites = useQuery({ queryKey: ["favorites", user?.id], queryFn: () => api<{ courseSlugs: string[] }>("/api/mobile/favorites"), enabled: Boolean(user) && !auth });
  const cartCount = cart.data?.count ?? cart.data?.courseSlugs?.length ?? cart.data?.items?.length ?? 0;
  const favoriteCount = favorites.data?.courseSlugs?.length || 0;
  const badge = (value: number) => value > 0 ? <View style={[styles.badge, { backgroundColor: colors.danger }]}><Text style={styles.badgeText}>{value > 99 ? "99+" : value}</Text></View> : null;
  const button = (label: string, icon: React.ComponentProps<typeof Ionicons>["name"], onPress: () => void, count = 0, color = colors.text) => <Pressable accessibilityRole="button" accessibilityLabel={t(label)} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .65 : 1 }]}><Ionicons name={icon} size={21} color={color} />{badge(count)}</Pressable>;
  const goHome = () => router.replace("/(tabs)");

  if (auth) return <View style={[styles.authHeader, { direction, flexDirection: rowDirection }]}>
    <BrandMark size={42} whiteTile />
    <View style={styles.authCopy}><Text style={[styles.authTitle, { color: colors.text }]}>{title || "مراس العلم"}</Text>{subtitle && <Text style={[styles.subtitle, { color: colors.textSoft }]}>{subtitle}</Text>}</View>
    <View style={[styles.actions, { flexDirection: rowDirection }]}>{button("الرئيسية", "home-outline", goHome)}{button(dark ? "الوضع الفاتح" : "الوضع الليلي", dark ? "sunny-outline" : "moon-outline", () => setMode(dark ? "light" : "dark"))}</View>
  </View>;

  return <View style={[styles.header, { direction }]}>
    <View testID="app-header-toolbar" style={[styles.toolbar, { flexDirection: rowDirection }]}>
      <View style={[styles.identity, { flexDirection: rowDirection }]}>
        {back ? button("رجوع", isRTL ? "arrow-forward" : "arrow-back", () => onBack ? onBack() : (router.canGoBack() ? router.back() : goHome())) : <BrandMark size={44} whiteTile />}
        {home ? button("الرئيسية", "home-outline", goHome) : <Text numberOfLines={2} style={[styles.brandName, { color: colors.text }]}>مراس العلم</Text>}
      </View>
      <View testID="app-header-actions" style={[styles.actions, { flexDirection: rowDirection }]}>
        {STORE_COMMERCE_ENABLED ? button("السلة", "bag-handle-outline", () => router.push("/cart"), cartCount) : button("موادي", "library-outline", () => router.push("/(tabs)/learning"))}
        {button("المفضلة", "heart-outline", () => router.push("/favorites"), favoriteCount, favoriteCount ? colors.danger : colors.text)}
        {button("الإشعارات", "notifications-outline", () => router.push("/notifications"), unread)}
      </View>
    </View>
    <View testID="app-header-title" style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>{title || "مراس العلم"}</Text>{subtitle && <Text style={[styles.subtitle, { color: colors.textSoft }]}>{subtitle}</Text>}</View>
  </View>;
}

const styles = StyleSheet.create({
  header: { gap: 16, paddingTop: 4, marginBottom: 20 },
  toolbar: { minHeight: 48, alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "nowrap" },
  identity: { flex: 1, minWidth: 0, alignItems: "center", gap: 9 },
  brandName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  actions: { flexShrink: 0, alignItems: "center", gap: 6, flexWrap: "nowrap" },
  copy: { gap: 4, width: "100%" }, title: { fontSize: 23, lineHeight: 34, fontWeight: "900" }, subtitle: { fontSize: 11, lineHeight: 19 },
  authHeader: { minHeight: 62, alignItems: "center", gap: 9, marginBottom: 18, flexWrap: "nowrap" },
  authCopy: { flex: 1, minWidth: 0, gap: 3 }, authTitle: { fontSize: 15, lineHeight: 23, fontWeight: "900" },
  iconButton: { width: 44, height: 44, flexShrink: 0, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, end: -4, minWidth: 18, height: 18, paddingHorizontal: 3, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "white" }, badgeText: { color: "#FFF", fontSize: 8, fontWeight: "900", textAlign: "center" },
});
