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
  const legalRecords = settings ? [
    settings.legal_name ? { key: "legal-name", label: "الاسم النظامي", value: settings.legal_name, verifyUrl: "" } : null,
    settings.commercial_registration_number ? { key: "commercial-registration", label: "السجل التجاري", value: settings.commercial_registration_number, verifyUrl: settings.commercial_registration_verify_url } : null,
    settings.ecommerce_authentication_number ? { key: "ecommerce-authentication", label: "توثيق التجارة الإلكترونية", value: settings.ecommerce_authentication_number, verifyUrl: settings.ecommerce_authentication_verify_url } : null,
    settings.nelc_program_license_number ? {
      key: "program-license",
      label: "ترخيص برنامج التعليم الإلكتروني",
      value: [settings.nelc_program_name, `رقم الترخيص: ${settings.nelc_program_license_number}`].filter(Boolean).join(" · "),
      verifyUrl: settings.nelc_program_license_verify_url,
    } : null,
    settings.vat_number ? { key: "vat", label: "الرقم الضريبي", value: settings.vat_number, verifyUrl: "" } : null,
    settings.legal_address ? { key: "legal-address", label: "العنوان النظامي", value: settings.legal_address, verifyUrl: "" } : null,
  ].filter((item): item is { key: string; label: string; value: string; verifyUrl: string } => Boolean(item)) : [];
  return <View style={[styles.footer, { direction, borderTopColor: colors.border }]}>
    <BrandLogo width={132} />
    <Text style={[styles.copy, { color: colors.textSoft }]}>{settings?.footer_description || "شرح جامعتك في مكان واحد، مع قنوات تواصل تُحدّث مباشرة من الإدارة."}</Text>
    {settings && (settings.ios_app_url || settings.android_app_url) ? <View style={styles.storeSection}><Text style={[styles.storeTitle, { color: colors.text }]}>{settings.app_download_title}</Text><Text style={[styles.storeCopy, { color: colors.textSoft }]}>{settings.app_download_description}</Text><View style={[styles.stores, { flexDirection: rowDirection }]}>{settings.ios_app_url ? <Pressable onPress={() => Linking.openURL(settings.ios_app_url)} style={({ pressed }) => [styles.store, { flexDirection: rowDirection, opacity: pressed ? .72 : 1 }]}><Ionicons name="logo-apple" size={20} color="#FFF" /><View><Text style={styles.storeSmall}>حمّل التطبيق من</Text><Text style={styles.storeName}>App Store</Text></View></Pressable> : null}{settings.android_app_url ? <Pressable onPress={() => Linking.openURL(settings.android_app_url)} style={({ pressed }) => [styles.store, { flexDirection: rowDirection, opacity: pressed ? .72 : 1 }]}><Ionicons name="logo-google-playstore" size={20} color="#FFF" /><View><Text style={styles.storeSmall}>حمّل التطبيق من</Text><Text style={styles.storeName}>Google Play</Text></View></Pressable> : null}</View></View> : null}
    {settings && <View style={[styles.actions, { flexDirection: rowDirection }]}>
      {settings.support_email ? <Pressable onPress={() => Linking.openURL(`mailto:${settings.support_email}`)} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .65 : 1 }]} accessibilityRole="button" accessibilityLabel="البريد الإلكتروني"><Ionicons name="mail-outline" size={17} color={colors.primary} /></Pressable> : null}
      {settings.whatsapp_url ? <Pressable onPress={() => Linking.openURL(settings.whatsapp_url)} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .65 : 1 }]} accessibilityRole="button" accessibilityLabel="واتساب"><Ionicons name="logo-whatsapp" size={17} color="#20A96B" /></Pressable> : null}
      {socials.map((item) => <Pressable key={item.key} onPress={() => Linking.openURL(settings[item.key])} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .65 : 1 }]} accessibilityRole="button" accessibilityLabel={item.label}><Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={17} color={colors.primary} /></Pressable>)}
    </View>}
    <View style={[styles.legalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.legalHead, { flexDirection: rowDirection }]}>
        <View style={[styles.legalIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="business-outline" size={19} color={colors.primary} /></View>
        <View style={styles.legalHeadCopy}><Text style={[styles.legalTitle, { color: colors.text }]}>بيانات المنشأة</Text><Text style={[styles.legalSubtitle, { color: colors.textSoft }]}>تظهر السجلات التي أدخلتها الإدارة فقط</Text></View>
      </View>
      {legalRecords.length ? legalRecords.map((record) => {
        const verifyUrl = record.verifyUrl.startsWith("https://") ? record.verifyUrl : "";
        return <View key={record.key} style={[styles.legalRecord, { borderTopColor: colors.border }]}>
          <Text style={[styles.legalLabel, { color: colors.textSoft }]}>{record.label}</Text>
          <View style={[styles.legalValueRow, { flexDirection: rowDirection }]}>
            <Text selectable style={[styles.legalValue, { color: colors.text }]}>{record.value}</Text>
            {verifyUrl ? <Pressable accessibilityRole="link" accessibilityLabel={`التحقق الرسمي من ${record.label}`} onPress={() => void Linking.openURL(verifyUrl)} style={({ pressed }) => [styles.verifyLink, { backgroundColor: colors.surfaceAlt, opacity: pressed ? .7 : 1 }]}><Text style={[styles.verifyText, { color: colors.primary }]}>تحقق رسمي</Text><Ionicons name="open-outline" size={13} color={colors.primary} /></Pressable> : null}
          </View>
        </View>;
      }) : <View style={[styles.legalRecord, { borderTopColor: colors.border }]}><Text style={[styles.legalValue, { color: colors.textSoft }]}>تُحدّث أرقام السجل والتوثيق والترخيص هنا فور صدورها.</Text></View>}
    </View>
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
  legalBox: { width: "100%", maxWidth: 380, borderWidth: 1, borderRadius: 18, padding: 13, marginTop: 11 },
  legalHead: { flexDirection: "row", alignItems: "center", gap: 9, paddingBottom: 8 },
  legalIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  legalHeadCopy: { flex: 1, alignItems: "flex-start" },
  legalTitle: { fontSize: 11, fontWeight: "900", textAlign: "right" },
  legalSubtitle: { fontSize: 8, lineHeight: 14, marginTop: 2, textAlign: "right" },
  legalRecord: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, marginTop: 7, alignItems: "flex-start" },
  legalLabel: { fontSize: 8, fontWeight: "800", textAlign: "right" },
  legalValueRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  legalValue: { flex: 1, fontSize: 9, lineHeight: 16, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  verifyLink: { minHeight: 31, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 4 },
  verifyText: { fontSize: 8, fontWeight: "900" },
  note: { fontSize: 8, textAlign: "center", marginTop: 7 },
});
