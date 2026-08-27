import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { absoluteUrl } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Institution } from "@/src/types";

export function InstitutionCard({ institution, compact = false }: { institution: Institution; compact?: boolean }) {
  const { colors } = useTheme();
  const logo = absoluteUrl(institution.logo || `/institutions/${institution.slug}.png`);
  return <Pressable onPress={() => router.push({ pathname: "/university/[slug]", params: { slug: institution.slug } })} style={({ pressed }) => [styles.card, compact && styles.compact, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .82 : 1 }]}><View style={[styles.logoWrap, { backgroundColor: "#FFFFFF", borderColor: colors.border }]}><Image source={{ uri: logo }} style={styles.logo} contentFit="contain" transition={180} /></View><View style={styles.copy}><Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{institution.name}</Text><Text numberOfLines={1} style={[styles.meta, { color: colors.textSoft }]}>{institution.region} · {institution.type}</Text><Text style={[styles.count, { color: colors.primary }]}>{institution.courses} مادة · {institution.specialties} تخصص</Text></View></Pressable>;
}

const styles = StyleSheet.create({
  card: { width: 205, minHeight: 190, borderRadius: 22, borderWidth: 1, padding: 15, marginLeft: 12, alignItems: "flex-end" }, compact: { width: "100%", minHeight: 96, flexDirection: "row-reverse", alignItems: "center", marginLeft: 0, marginBottom: 11 }, logoWrap: { width: 72, height: 72, borderRadius: 20, borderWidth: 1, padding: 9, alignItems: "center", justifyContent: "center" }, logo: { width: "100%", height: "100%" }, copy: { flex: 1, alignItems: "flex-end", marginTop: 11 }, name: { fontSize: 14, lineHeight: 22, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, meta: { fontSize: 9, marginTop: 3, textAlign: "right" }, count: { fontSize: 10, fontWeight: "800", marginTop: 9, textAlign: "right" },
});

