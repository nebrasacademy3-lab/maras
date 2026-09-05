import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { absoluteUrl } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { Course } from "@/src/types";

export function courseGradient(color: string): [string, string] {
  if (color.includes("orange") || color.includes("rose")) return ["#F97316", "#E11D48"];
  if (color.includes("emerald")) return ["#0F9F72", "#1377CC"];
  if (color.includes("cyan")) return ["#4338CA", "#06B6D4"];
  return ["#155EEF", "#7B3FF2"];
}

export function CourseCard({ course, compact = false }: { course: Course; compact?: boolean }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { direction, rowDirection } = useLanguage();
  return <Pressable onPress={() => router.push({ pathname: "/course/[slug]", params: { slug: course.slug } })} style={({ pressed }) => [styles.card, !compact && { width: Math.min(300, Math.max(210, width - 56)) }, compact && styles.compact, compact && { flexDirection: rowDirection }, { direction, backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .83 : 1 }]}><View style={[styles.art, compact && styles.artCompact, compact && width < 380 && { width: 76, paddingHorizontal: 10 }]}><LinearGradient colors={courseGradient(course.color)} style={styles.artBackground} />{course.coverImage ? <Image source={{ uri: absoluteUrl(course.coverImage) }} style={styles.coverImage} resizeMode="cover" /> : null}<Text style={styles.icon}>{course.coverImage ? "" : course.icon}</Text><Text numberOfLines={1} style={styles.code}>{course.code || "مراس"}</Text></View><View style={styles.body}><Text style={[styles.context, { color: colors.primary }]}>{course.university} · {course.specialty}</Text><Text style={[styles.title, { color: colors.text }]}>{course.title}</Text><View style={[styles.meta, { flexDirection: rowDirection }]}><Text style={[styles.metaText, { color: colors.textSoft }]}><Ionicons name="play-circle-outline" size={13} /> {course.lessons} درس</Text><Text style={[styles.metaText, { color: colors.textSoft }]}><Ionicons name="time-outline" size={13} /> {course.duration}</Text></View><View style={[styles.footer, { flexDirection: rowDirection }]}><View>{course.rating > 0 ? <Text style={styles.rating}>★ {course.rating} <Text style={{ color: colors.textSoft }}>({course.ratingsCount})</Text></Text> : <Text style={[styles.newRating, { color: colors.textSoft }]}>جديد</Text>}</View><Text style={[styles.price, { color: course.availableForPurchase ? colors.text : colors.primary }]}>{course.availableForPurchase ? (course.price ? `${course.price} ر.س` : "مجاني") : "قريبًا"}</Text></View></View></Pressable>;
}

const styles = StyleSheet.create({
  card: { width: 270, borderRadius: 22, borderWidth: 1, overflow: "hidden", marginEnd: 12 }, artBackground: { ...StyleSheet.absoluteFill }, coverImage: { ...StyleSheet.absoluteFill, opacity: .92 }, compact: { width: "100%", flexDirection: "row", marginEnd: 0, marginBottom: 12 }, art: { height: 135, padding: 16, justifyContent: "space-between", overflow: "hidden" }, artCompact: { width: 112, height: "auto", minHeight: 148 }, icon: { fontSize: 34 }, code: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", textAlign: "left" }, body: { flex: 1, padding: 15 }, context: { fontSize: 9, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, title: { fontSize: 16, fontWeight: "900", lineHeight: 25, textAlign: "right", writingDirection: "rtl", marginTop: 5 }, meta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 11 }, metaText: { fontSize: 9 }, footer: { flexWrap: "wrap", gap: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }, rating: { color: "#F7A810", fontSize: 11, fontWeight: "800" }, newRating: { fontSize: 10 }, price: { fontSize: 14, fontWeight: "900" },
});
