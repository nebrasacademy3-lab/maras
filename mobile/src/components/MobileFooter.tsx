import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { BrandLogo } from "@/src/components/Brand";
import type { PublicSettings } from "@/src/types";

const socialChannels = [
  { key: "social_x", label: "X", icon: "at-outline" },
  { key: "social_instagram", label: "Instagram", icon: "logo-instagram" },
  { key: "social_tiktok", label: "TikTok", icon: "musical-notes-outline" },
  { key: "social_youtube", label: "YouTube", icon: "logo-youtube" },
  { key: "social_telegram", label: "Telegram", icon: "paper-plane-outline" },
  { key: "social_linkedin", label: "LinkedIn", icon: "logo-linkedin" },
  { key: "social_facebook", label: "Facebook", icon: "logo-facebook" },
  { key: "social_snapchat", label: "Snapchat", icon: "logo-snapchat" },
  { key: "social_threads", label: "Threads", icon: "at-outline" },
] as const;

export function MobileFooter() {
  const { colors } = useTheme();
  const { direction, rowDirection } = useLanguage();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: PublicSettings }>("/api/public/settings"), staleTime: 5_000 });
  const settings = settingsQuery.data?.settings;
  const socials = settings ? socialChannels.filter((item) => settings[item.key].startsWith("https://")) : [];
  return <View style={[styles.footer, { direction, borderTopColor: colors.border }]}>
    <BrandLogo width={132} />
    <Text style={[styles.copy, { color: colors.textSoft }]}>{settings?.footer_description || "شرح جامعتك في مكان واحد، مع قنوات تواصل تُحدّث مباشرة من الإدارة."}</Text>
    {settings && (settings.ios_app_url || settings.android_app_url) ? <View style={styles.storeSection}><Text style={[styles.storeTitle, { color: colors.text }]}>{settings.app_download_title}</Text><Text style={[styles.storeCopy, { color: colors.textSoft }]}>{settings.app_download_description}</Text><View style={[styles.stores, { flexDirection: rowDirection }]}>{settings.ios_app_url ? <Pressable onPress={() => Linking.openURL(settings.ios_app_url)} style={({ pressed }) => [styles.store, { flexDirection: rowDirection, opacity: pressed ? .72 : 1 }]}><Ionicons name="logo-apple" size={20} color="#FFF" /><View><Text style={styles.storeSmall}>حمّل التطبيق من</Text><Text style={styles.storeName}>App Store</Text></View></Pressable> : null}{settings.android_app_url ? <Pressable onPress={() => Linking.openURL(settings.android_app_url)} style={({ pressed }) => [styles.store, { flexDirection: rowDirection, opacity: pressed ? .72 : 1 }]}><Ionicons name="logo-google-playstore" size={20} color="#FFF" /><View><Text style={styles.storeSmall}>حمّل التطبيق من</Text><Text style={styles.storeName}>Google Play</Text></View></Pressable> : null}</View></View> : null}
    {settings && <View style={[styles.actions, { flexDirection: rowDirection }]}>
      <Pressable onPress={() => Linking.openURL(`mailto:${settings.support_email}`)} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .65 : 1 }]} accessibilityRole="button" accessibilityLabel="البريد الإلكتروني"><Ionicons name="mail-outline" size={17} color={colors.primary} /></Pressable>
      {settings.whatsapp_url ? <Pressable onPress={() => Linking.openURL(settings.whatsapp_url)} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .65 : 1 }]} accessibilityRole="button" accessibilityLabel="واتساب"><Ionicons name="logo-whatsapp" size={17} color="#20A96B" /></Pressable> : null}
      {socials.map((item) => <Pressable key={item.key} onPress={() => Linking.openURL(settings[item.key])} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .65 : 1 }]} accessibilityRole="button" accessibilityLabel={item.label}><Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={17} color={colors.primary} /></Pressable>)}
    </View>}
    <Text style={[styles.note, { color: colors.textSoft }]}>© 2026 مراس العلم · جميع الحقوق محفوظة</Text>
  </View>;
}

const styles = StyleSheet.create({
  footer: { alignItems: "center", paddingTop: 28, paddingBottom: 30, marginTop: 30, borderTopWidth: 1, gap: 7 },
  copy: { maxWidth: 330, fontSize: 10, lineHeight: 17, textAlign: "center", writingDirection: "rtl" },
  storeSection: { width: "100%", maxWidth: 380, alignItems: "center", marginTop: 10 },
  storeTitle: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  storeCopy: { maxWidth: 330, fontSize: 8, lineHeight: 14, textAlign: "center", marginTop: 3 },
  stores: { width: "100%", flexDirection: "row", gap: 7, marginTop: 10 },
  store: { flex: 1, minHeight: 50, paddingHorizontal: 11, borderRadius: 15, backgroundColor: "#071127", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  storeSmall: { color: "#AEBEE3", fontSize: 7, textAlign: "right" },
  storeName: { color: "#FFF", fontSize: 10, fontWeight: "900", textAlign: "right", marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7, maxWidth: 340, marginTop: 8 },
  action: { width: 37, height: 37, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  note: { fontSize: 8, textAlign: "center", marginTop: 7 },
});
