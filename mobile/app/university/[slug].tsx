import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { absoluteUrl, api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

export default function UniversityDetails() {
  const { slug } = useLocalSearchParams<{ slug: string }>(); const { colors } = useTheme();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const programs = useQuery({ queryKey: ["programs", slug], queryFn: () => api<{ programs: { name: string; degree: string; area: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(slug || "")}`), enabled: Boolean(slug) });
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  const institution = catalog.data?.institutions.find((item) => item.slug === slug); const courses = catalog.data?.courses.filter((item) => item.universitySlug === slug) || [];
  if (!institution) return <Screen><AppHeader title="الجامعة" back /><EmptyState title="الجهة غير موجودة" text="تحقق من الرابط أو عد إلى دليل الجامعات." /></Screen>;
  return <Screen><AppHeader title={institution.name} subtitle={`${institution.region} · ${institution.type}`} back /><Card style={styles.hero}><View style={styles.logoWrap}><Image source={{ uri: absoluteUrl(institution.logo || `/institutions/${institution.slug}.png`) }} style={styles.logo} contentFit="contain" /></View><Text style={[styles.name, { color: colors.text }]}>{institution.name}</Text><Text style={[styles.en, { color: colors.textSoft }]}>{institution.nameEn}</Text><View style={styles.counts}><Text style={{ color: colors.primary }}>{programs.data?.programs.length || institution.specialties} تخصص</Text><Text style={{ color: colors.primary }}>{courses.length} مادة</Text></View></Card><SectionTitle title="التخصصات" subtitle="البرامج المرتبطة بهذه الجهة" />{programs.isLoading ? <LoadingState label="جارٍ تحميل التخصصات..." /> : <View style={styles.programs}>{programs.data?.programs.map((program) => <View key={`${program.name}-${program.degree}`} style={[styles.program, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.programName, { color: colors.text }]}>{program.name}</Text><Text style={[styles.programMeta, { color: colors.textSoft }]}>{program.degree} · {program.area}</Text></View>)}</View>}<SectionTitle title="المواد المتاحة" subtitle="يمكن لأي طالب الاشتراك في مواد هذه الجهة" />{courses.length ? courses.map((course) => <CourseCard compact key={course.slug} course={course} />) : <EmptyState title="لا توجد مواد منشورة بعد" text="يمكنك طلب مادة ورفع السلايدات ليصل الطلب إلى المشرف." />}</Screen>;
}
const styles = StyleSheet.create({ hero: { alignItems: "center", paddingVertical: 26 }, logoWrap: { width: 116, height: 116, borderRadius: 30, backgroundColor: "#FFFFFF", padding: 14, alignItems: "center", justifyContent: "center" }, logo: { width: "100%", height: "100%" }, name: { fontSize: 21, fontWeight: "900", textAlign: "center", marginTop: 15 }, en: { fontSize: 10, marginTop: 4 }, counts: { flexDirection: "row-reverse", gap: 20, marginTop: 15 }, programs: { gap: 9 }, program: { borderWidth: 1, borderRadius: 16, padding: 14, alignItems: "flex-end" }, programName: { fontSize: 13, fontWeight: "900", textAlign: "right" }, programMeta: { fontSize: 9, marginTop: 4 } });

