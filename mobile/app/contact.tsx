import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { PublicSettings } from "@/src/types";
import { mobileSocialLinks } from "@/src/lib/public-social-links";
import { useLanguage } from "@/src/providers/LanguageProvider";

export default function Contact() {
  const { colors } = useTheme();
  const { isRTL, rowDirection } = useLanguage();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ settings: PublicSettings }>("/api/public/settings"),
    staleTime: 5_000,
  });
  const publicSettings = settings.data?.settings;
  if (settings.isLoading) return <Screen><LoadingState /></Screen>;
  if (!publicSettings) {
    return <Screen><AppHeader title="تواصل معنا" back /><Text style={[styles.empty, { color: colors.textSoft }]}>تعذر تحميل قنوات التواصل حاليًا.</Text></Screen>;
  }

  const links = mobileSocialLinks(publicSettings);
  const socials = links.filter((link) => link.id !== "whatsapp");
  const whatsapp = links.find((link) => link.id === "whatsapp")?.url;
  const telegram = links.find(link => link.id === "telegram")?.url;
  const supportEmail = publicSettings.support_email;

  return <Screen>
    <AppHeader title="تواصل معنا" subtitle="قنوات مراس الرسمية" back />
    <View style={[styles.hero, { backgroundColor: colors.primary }]}>
      <Ionicons name="chatbubbles-outline" size={28} color="#FFF" />
      <Text style={styles.heroTitle}>نحن قريبون منك</Text>
      <Text style={styles.heroCopy}>للاستفسارات العامة والشراكات والاقتراحات، اختر القناة الأنسب لك.</Text>
    </View>
    {whatsapp || supportEmail ? <View style={styles.channelGrid}>
      {whatsapp ? <Pressable style={{ width: supportEmail ? "48%" : "100%" }} onPress={() => void Linking.openURL(whatsapp)}>
        <Card style={styles.channel}><Ionicons name="logo-whatsapp" size={28} color="#20A96B" /><Text style={[styles.channelTitle, { color: colors.text }]}>واتساب</Text><Text style={[styles.channelCopy, { color: colors.textSoft }]}>محادثة مباشرة</Text></Card>
      </Pressable> : null}
      {supportEmail ? <Pressable style={{ width: whatsapp ? "48%" : "100%" }} onPress={() => void Linking.openURL(`mailto:${supportEmail}`)}>
        <Card style={styles.channel}><Ionicons name="mail-outline" size={28} color={colors.primary} /><Text style={[styles.channelTitle, { color: colors.text }]}>البريد</Text><Text style={[styles.channelCopy, { color: colors.textSoft }]}>{supportEmail}</Text></Card>
      </Pressable> : null}
    </View> : null}
    {telegram ? <Card style={{ marginTop: 14, gap: 10 }}><Ionicons name="paper-plane-outline" size={26} color={colors.primary} /><Text style={[styles.channelTitle, { color: colors.text }]}>تيليجرام مراس</Text><Text style={[styles.supportCopy, { color: colors.textSoft }]}>قناتنا الرسمية لمستجدات المنصة والتواصل.</Text><AppButton title="افتح تيليجرام" variant="soft" onPress={() => void Linking.openURL(telegram).catch(() => Alert.alert("تعذر فتح الرابط", "تحقق من الاتصال ثم حاول مرة أخرى."))} /></Card> : null}
    {socials.length ? <>
      <SectionTitle title="تابعنا" subtitle="آخر المواد والإعلانات التعليمية" />
      <View style={styles.socialGrid}>{socials.map((item) => <Pressable
        key={item.id}
        accessibilityRole="link"
        accessibilityLabel={isRTL ? item.labelAr : item.label}
        onPress={() => void Linking.openURL(item.url).catch(() => Alert.alert(isRTL ? "تعذر فتح الرابط" : "Could not open link", isRTL ? "تحقق من اتصالك ثم حاول مرة أخرى." : "Check your connection and try again."))}
        style={[styles.social, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: rowDirection }]}
      >
        <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary} />
        <Text style={[styles.socialText, { color: colors.text }]}>{isRTL ? item.labelAr : item.label}</Text>
        <Ionicons name="open-outline" size={14} color={colors.textSoft} />
      </Pressable>)}</View>
    </> : null}
    <Card style={[styles.supportCard, { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name="headset-outline" size={25} color={colors.primary} />
      <Text style={[styles.supportTitle, { color: colors.text }]}>تحتاج متابعة خاصة؟</Text>
      <Text style={[styles.supportCopy, { color: colors.textSoft }]}>الدعم الفني يتطلب تسجيل الدخول حتى تبقى تذاكرك وردود الفريق مرتبطة بحسابك بأمان.</Text>
      <AppButton title="الدخول إلى الدعم الفني" onPress={() => router.push("/support")} />
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, padding: 22, marginBottom: 18 },
  heroTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", textAlign: "right", marginTop: 10 },
  heroCopy: { color: "rgba(255,255,255,.84)", fontSize: 11, lineHeight: 20, textAlign: "right", marginTop: 5 },
  channelGrid: { flexDirection: "row", justifyContent: "space-between" },
  channel: { alignItems: "center", minHeight: 125 },
  channelTitle: { fontSize: 13, fontWeight: "900", marginTop: 8 },
  channelCopy: { fontSize: 12, marginTop: 3, textAlign: "center" },
  socialGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  social: { flexBasis: "47%", flexGrow: 1, minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7 },
  socialText: { flex: 1, fontSize: 12, fontWeight: "800", textAlign: "right" },
  supportCard: { marginTop: 20, alignItems: "flex-start" },
  supportTitle: { fontSize: 16, fontWeight: "900", marginTop: 8 },
  supportCopy: { fontSize: 13, lineHeight: 23, textAlign: "right", marginVertical: 8 },
  empty: { textAlign: "center", fontSize: 11, lineHeight: 20, padding: 12 },
});
