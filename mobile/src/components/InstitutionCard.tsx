import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { absoluteUrl } from "@/src/lib/api";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Institution } from "@/src/types";

export function InstitutionCard({ institution, compact = false }: { institution: Institution; compact?: boolean }) {
  const { colors, dark } = useTheme();
  const { direction, rowDirection, isRTL } = useLanguage();
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = absoluteUrl(institution.logo || `/institutions/${institution.slug}.png`);
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${institution.name}، ${institution.region}، ${institution.courses} مادة`}
    accessibilityHint="عرض تخصصات الجامعة وموادها"
    onPress={() => router.push({ pathname: "/university/[slug]", params: { slug: institution.slug } })}
    style={({ pressed }) => [
      styles.card,
      compact && styles.compact,
      compact && { flexDirection: rowDirection },
      {
        direction,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        boxShadow: dark ? "0 8px 20px rgba(0,0,0,.16)" : "0 6px 20px rgba(17,40,80,.055)",
        opacity: pressed ? .82 : 1,
        transform: [{ scale: pressed ? .985 : 1 }],
      },
    ]}
  >
    <View style={[styles.logoWrap, compact && styles.logoCompact, { borderColor: colors.border }]}>
      {logoFailed ? <Ionicons name="school-outline" size={compact ? 27 : 32} color={colors.primary} /> : <Image source={{ uri: logo }} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" recyclingKey={institution.slug} transition={120} onError={() => setLogoFailed(true)} />}
    </View>
    <View style={[styles.copy, compact && styles.copyCompact]}>
      <Text style={[styles.name, { color: colors.text }]}>{institution.name}</Text>
      <View style={[styles.location, { flexDirection: rowDirection }]}>
        <Ionicons name="location-outline" size={14} color={colors.textSoft} />
        <Text style={[styles.meta, { color: colors.textSoft }]}>{institution.region} · {institution.type}</Text>
      </View>
      <View style={[styles.footer, { flexDirection: rowDirection }]}>
        <View style={[styles.countPill, { backgroundColor: colors.surfaceAlt, flexDirection: rowDirection }]}><Ionicons name="library-outline" size={14} color={colors.primary} /><Text style={[styles.count, { color: colors.primary }]}>{institution.courses} مادة</Text></View>
        {!compact ? <View style={[styles.countPill, { backgroundColor: colors.surfaceAlt, flexDirection: rowDirection }]}><Ionicons name="layers-outline" size={14} color={colors.primary} /><Text style={[styles.count, { color: colors.primary }]}>{institution.specialties} تخصص</Text></View> : null}
        <View style={[styles.arrowTile, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={16} color={colors.primary} /></View>
      </View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { width: 218, minHeight: 218, borderRadius: 23, borderWidth: 1, padding: 15, marginEnd: 12, gap: 10, borderCurve: "continuous" },
  compact: { width: "100%", minHeight: 110, marginEnd: 0, alignItems: "center", gap: 12, padding: 11 },
  logoWrap: { width: 68, height: 68, flexShrink: 0, borderRadius: 18, borderWidth: 1, padding: 8, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoCompact: { width: 68, height: 68 },
  logo: { width: "100%", height: "100%" },
  copy: { flex: 1, minWidth: 0, width: "100%", gap: 5 },
  copyCompact: { width: "auto" },
  name: { fontSize: 15, lineHeight: 23, fontWeight: "900" },
  location: { alignItems: "center", gap: 3 },
  meta: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 18 },
  footer: { marginTop: "auto", paddingTop: 7, alignItems: "center", flexWrap: "wrap", gap: 5 },
  countPill: { minHeight: 27, paddingHorizontal: 7, borderRadius: 9, alignItems: "center", gap: 3 },
  count: { fontSize: 10, lineHeight: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  arrowTile: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginStart: "auto" },
});
