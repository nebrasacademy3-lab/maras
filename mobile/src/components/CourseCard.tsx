import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { absoluteUrl } from "@/src/lib/api";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Course } from "@/src/types";

export function courseGradient(color: string): [string, string] {
  if (color.includes("orange") || color.includes("rose")) return ["#F97316", "#E11D48"];
  if (color.includes("emerald")) return ["#0F9F72", "#1377CC"];
  if (color.includes("cyan")) return ["#4338CA", "#06B6D4"];
  return ["#155EEF", "#7B3FF2"];
}

export function CourseCard({ course, compact = false }: { course: Course; compact?: boolean }) {
  const { colors, dark } = useTheme();
  const { width } = useWindowDimensions();
  const { direction, rowDirection, isRTL } = useLanguage();
  const price = course.availableForPurchase ? (course.price ? `${course.price} ر.س` : "مجاني") : "قريبًا";
  const artWidth = width < 380 ? 80 : 96;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${course.title}، ${course.university}، ${price}`}
    accessibilityHint="عرض تفاصيل المادة"
    onPress={() => router.push({ pathname: "/course/[slug]", params: { slug: course.slug } })}
    style={({ pressed }) => [
      styles.card,
      !compact && { width: Math.min(308, Math.max(232, width - 56)) },
      compact && styles.compact,
      compact && { flexDirection: rowDirection },
      {
        direction,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        boxShadow: dark ? "0 8px 20px rgba(0,0,0,.17)" : "0 6px 20px rgba(17,40,80,.06)",
        opacity: pressed ? .84 : 1,
        transform: [{ scale: pressed ? .985 : 1 }],
      },
    ]}
  >
    <View style={[styles.art, compact && { width: artWidth, minHeight: 174, height: "auto" }]}>
      <LinearGradient colors={courseGradient(course.color)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {course.coverImage ? <Image source={{ uri: absoluteUrl(course.coverImage) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={course.slug} /> : null}
      <LinearGradient colors={["rgba(4,16,45,.04)", "rgba(4,16,45,.5)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.artTop}>
        {!course.coverImage ? <Text style={styles.courseIcon}>{course.icon || "✦"}</Text> : <View style={styles.coverBadge}><Ionicons name="book-outline" size={17} color="#FFFFFF" /></View>}
      </View>
      <View style={styles.codeBadge}><Text numberOfLines={1} style={styles.code}>{course.code || "مراس"}</Text></View>
    </View>
    <View style={[styles.body, compact && styles.bodyCompact]}>
      <Text numberOfLines={2} style={[styles.context, { color: colors.primary }]}>{course.university} · {course.specialty}</Text>
      <Text numberOfLines={compact ? 3 : 2} style={[styles.title, compact && styles.titleCompact, { color: colors.text }]}>{course.title}</Text>
      <View style={[styles.meta, { flexDirection: rowDirection }]}>
        <View style={[styles.metaItem, { flexDirection: rowDirection }]}><Ionicons name="play-circle-outline" size={16} color={colors.textSoft} /><Text style={[styles.metaText, { color: colors.textSoft }]}>{course.lessons} درس</Text></View>
        {course.duration ? <View style={[styles.metaItem, { flexDirection: rowDirection }]}><Ionicons name="time-outline" size={16} color={colors.textSoft} /><Text style={[styles.metaText, { color: colors.textSoft }]}>{course.duration}</Text></View> : null}
      </View>
      <View style={[styles.footer, { flexDirection: rowDirection, borderTopColor: colors.border }]}>
        <View style={styles.footerCopy}>
          {course.rating > 0 ? <Text style={[styles.rating, { color: colors.warning }]}>★ {course.rating} <Text style={{ color: colors.textSoft }}>({course.ratingsCount})</Text></Text> : <Text style={[styles.newRating, { color: colors.textSoft }]}>مادة جديدة</Text>}
          <Text style={[styles.price, { color: course.availableForPurchase ? colors.text : colors.primary }]}>{price}</Text>
        </View>
        <View style={[styles.arrowTile, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={17} color={colors.primary} /></View>
      </View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { width: 274, borderRadius: 23, borderWidth: 1, padding: 6, overflow: "hidden", marginEnd: 12, borderCurve: "continuous" },
  compact: { width: "100%", minHeight: 186, marginEnd: 0 },
  art: { height: 156, borderRadius: 18, padding: 12, overflow: "hidden", justifyContent: "space-between" },
  artTop: { alignItems: "flex-start" },
  courseIcon: { fontSize: 36, lineHeight: 48, color: "#FFFFFF" },
  coverBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(3,14,40,.42)", alignItems: "center", justifyContent: "center" },
  codeBadge: { alignSelf: "flex-start", maxWidth: "100%", minHeight: 28, borderRadius: 9, backgroundColor: "rgba(3,14,40,.5)", paddingHorizontal: 8, justifyContent: "center" },
  code: { color: "#FFFFFF", fontSize: 10, lineHeight: 17, fontWeight: "900", writingDirection: "ltr" },
  body: { flex: 1, minWidth: 0, padding: 14, gap: 5 },
  bodyCompact: { padding: 11 },
  context: { fontSize: 11, lineHeight: 18, fontWeight: "800" },
  title: { fontSize: 18, lineHeight: 27, fontWeight: "900", marginTop: 2 },
  titleCompact: { fontSize: 16, lineHeight: 24 },
  meta: { flexWrap: "wrap", gap: 10, marginTop: 7 },
  metaItem: { alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, lineHeight: 18 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: "auto", paddingTop: 10 },
  footerCopy: { flex: 1, minWidth: 0, gap: 2 },
  rating: { fontSize: 11, lineHeight: 17, fontWeight: "800" },
  newRating: { fontSize: 10, lineHeight: 17 },
  price: { fontSize: 14, lineHeight: 22, fontWeight: "900" },
  arrowTile: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
