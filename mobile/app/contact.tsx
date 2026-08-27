import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
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

export default function Contact() {
  const { colors } = useTheme();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: PublicSettings }>("/api/public/settings") });
  const publicSettings = settings.data?.settings;
  if (settings.isLoading) return <Screen><LoadingState /></Screen>;
  if (!publicSettings) return <Screen><AppHeader title="تواصل معنا" back /><Text style={[styles.empty, { color: colors.textSoft }]}>تعذر تحميل قنوات التواصل حاليًا.</Text></Screen>;
  const socials = socialChannels.filter((item) => publicSettings[item.key].startsWith("https://"));
  const whatsapp = publicSettings.whatsapp_url;
  return <Screen><AppHeader title="تواصل معنا" subtitle="قنوات مراس الرسمية" back /><View style={[styles.hero, { backgroundColor: colors.primary }]}><Ionicons name="chatbubbles-outline" size={28} color="#FFF" /><Text style={styles.heroTitle}>نحن قريبون منك</Text><Text style={styles.heroCopy}>للاستفسارات العامة والشراكات والاقتراحات، اختر القناة الأنسب لك.</Text></View><View style={styles.channelGrid}>{whatsapp ? <Pressable style={{ width: "48%" }} onPress={() => Linking.openURL(whatsapp)}><Card style={styles.channel}><Ionicons name="logo-whatsapp" size={28} color="#20A96B" /><Text style={[styles.channelTitle, { color: colors.text }]}>واتساب</Text><Text style={[styles.channelCopy, { color: colors.textSoft }]}>محادثة مباشرة</Text></Card></Pressable> : null}<Pressable style={{ width: whatsapp ? "48%" : "100%" }} onPress={() => Linking.openURL(`mailto:${publicSettings.support_email}`)}><Card style={styles.channel}><Ionicons name="mail-outline" size={28} color={colors.primary} /><Text style={[styles.channelTitle, { color: colors.text }]}>البريد</Text><Text style={[styles.channelCopy, { color: colors.textSoft }]}>{publicSettings.support_email}</Text></Card></Pressable></View><SectionTitle title="تابعنا" subtitle="آخر المواد والإعلانات التعليمية" />{socials.length ? <View style={styles.socialGrid}>{socials.map((item) => <Pressable key={item.key} onPress={() => Linking.openURL(publicSettings[item.key])} style={[styles.social, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary} /><Text style={[styles.socialText, { color: colors.text }]}>{item.label}</Text><Ionicons name="open-outline" size={14} color={colors.textSoft} /></Pressable>)}</View> : <Card><Text style={[styles.empty, { color: colors.textSoft }]}>ستُضاف الحسابات الاجتماعية من لوحة الإدارة قريبًا.</Text></Card>}<Card style={[styles.supportCard, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="headset-outline" size={25} color={colors.primary} /><Text style={[styles.supportTitle, { color: colors.text }]}>تحتاج متابعة خاصة؟</Text><Text style={[styles.supportCopy, { color: colors.textSoft }]}>الدعم الفني يتطلب تسجيل الدخول حتى تبقى تذاكرك وردود الفريق مرتبطة بحسابك بأمان.</Text><AppButton title="الدخول إلى الدعم الفني" onPress={() => router.push("/support")} /></Card></Screen>;
}

const styles = StyleSheet.create({ hero: { borderRadius: 22, padding: 22, marginBottom: 18 }, heroTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", textAlign: "right", marginTop: 10 }, heroCopy: { color: "rgba(255,255,255,.84)", fontSize: 11, lineHeight: 20, textAlign: "right", marginTop: 5 }, channelGrid: { flexDirection: "row-reverse", justifyContent: "space-between" }, channel: { alignItems: "center", minHeight: 125 }, channelTitle: { fontSize: 13, fontWeight: "900", marginTop: 8 }, channelCopy: { fontSize: 9, marginTop: 3, textAlign: "center" }, socialGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }, social: { width: "48%", minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 7 }, socialText: { flex: 1, fontSize: 10, fontWeight: "800", textAlign: "right" }, supportCard: { marginTop: 20, alignItems: "flex-end" }, supportTitle: { fontSize: 16, fontWeight: "900", marginTop: 8 }, supportCopy: { fontSize: 10, lineHeight: 19, textAlign: "right", marginVertical: 8 }, empty: { textAlign: "center", fontSize: 11, lineHeight: 20, padding: 12 } });
