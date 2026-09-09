import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { courseGradient } from "@/src/components/CourseCard";
import { AppButton, EmptyState, FadeIn, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { Dashboard, OwnedCourse } from "@/src/types";

const percentage = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;

export default function Learning() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { rowDirection, isRTL, t } = useLanguage();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<"all" | "active" | "complete">("all");
  const dashboard = useQuery({ queryKey: ["dashboard", user?.id], queryFn: () => api<Dashboard>("/api/mobile/dashboard"), enabled: Boolean(user) });
  if (!user) return <Screen><AppHeader title="موادي" subtitle="مساحتك التعليمية" /><EmptyState icon="lock-closed-outline" title="سجّل الدخول لعرض موادك" text="تقدمك وملاحظاتك محفوظة في حسابك، لتكمل التعلّم من أي جهاز." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (dashboard.isLoading) return <Screen><LoadingState label="جارٍ تحميل موادك..." /></Screen>;
  if (dashboard.isError) return <Screen><AppHeader title="موادي" /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل موادك" text="لم نتمكن من الوصول إلى حسابك الآن. تحقق من اتصالك وأعد المحاولة." action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void dashboard.refetch()} />} /></Screen>;
  const courses = dashboard.data?.owned || [];
  const expired = dashboard.data?.expired || [];
  const completed = courses.filter((course) => percentage(course.progress) === 100).length;
  const started = courses.filter((course) => course.progress > 0 && course.progress < 100).length;
  const rows = courses.filter((course) => filter === "all" || (filter === "complete" ? percentage(course.progress) === 100 : course.progress > 0 && course.progress < 100));
  const resume = courses.find((course) => course.currentLessonId && course.progress < 100) || courses.find((course) => course.progress < 100);
  const filters = [{ id: "all" as const, title: "كل موادي", count: courses.length }, { id: "active" as const, title: "أتابع تعلّمها", count: started }, { id: "complete" as const, title: "أتممتها", count: completed }];
  return <Screen><AppHeader title="موادي" subtitle="كل خطوة تتعلّمها، تبقى معك" unread={dashboard.data?.notifications.filter((item) => !item.readAt).length || 0} />
    {courses.length ? <>
      <FadeIn><LinearGradient colors={[colors.primaryDark, colors.primary]} style={styles.hero}>
        <View pointerEvents="none" style={styles.orbit} />
        <View style={[styles.heroHead, { flexDirection: rowDirection }]}><View style={styles.flex}><Text style={styles.eyebrow}>مساحتك للفهم والإنجاز</Text><Text style={styles.heroTitle}>{resume ? "خطوة أخرى،\nوفهم أعمق." : "أتممتها. وهذا إنجاز."}</Text></View><View style={styles.heroIcon}><Ionicons name={resume ? "book-outline" : "ribbon-outline"} size={31} color={colors.onPrimary} /></View></View>
        <View style={[styles.stats, { flexDirection: rowDirection }]}>{[{ value: courses.length, title: "مادة متاحة" }, { value: started, title: "قيد التعلّم" }, { value: completed, title: "مادة مكتملة" }].map((item) => <View key={item.title} style={styles.stat}><Text style={styles.statValue}>{item.value}</Text><Text style={styles.statLabel}>{item.title}</Text></View>)}</View>
        {resume ? <Pressable accessibilityRole="button" accessibilityLabel={t("أكمل التعلّم") + ": " + resume.title} onPress={() => router.push({ pathname: "/learn/[slug]", params: { slug: resume.slug } })} style={({ pressed }) => [styles.resume, { flexDirection: rowDirection, backgroundColor: colors.surface, opacity: pressed ? .85 : 1 }]}><View style={[styles.resumeIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="play" size={20} color={colors.primary} /></View><View style={styles.flex}><Text style={[styles.resumeLabel, { color: colors.textSoft }]}>أكمل التعلّم</Text><Text numberOfLines={2} style={[styles.resumeTitle, { color: colors.text }]}>{resume.title}</Text></View><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={21} color={colors.primary} /></Pressable> : null}
      </LinearGradient></FadeIn>
      <SectionTitle title="مكتبتك التعليمية" subtitle="دروسك وملاحظاتك وتقدمك في مكان واحد" />
      <View style={[styles.filters, { flexDirection: rowDirection }]}>{filters.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: filter === item.id }} onPress={() => setFilter(item.id)} style={[styles.filter, { flexDirection: rowDirection, backgroundColor: filter === item.id ? colors.primary : colors.surface, borderColor: filter === item.id ? colors.primary : colors.border }]}><Text style={[styles.filterText, { color: filter === item.id ? colors.onPrimary : colors.textSoft }]}>{item.title}</Text><Text style={[styles.filterCount, { color: filter === item.id ? colors.onPrimary : colors.primary }]}>{item.count}</Text></Pressable>)}</View>
      {rows.length ? <View style={[styles.grid, { flexDirection: rowDirection }]}>{rows.map((course) => <LearningCard key={course.slug} course={course} wide={width >= 760} />)}</View> : <EmptyState icon="bookmark-outline" title={filter === "complete" ? "إنجازك القادم يبدأ بدرس" : "ابدأ أول خطوة"} text="افتح إحدى موادك وتابع دروسها، وسيظهر تقدمك هنا تلقائيًا." action={<AppButton title="عرض كل موادي" variant="soft" onPress={() => setFilter("all")} />} />}
    </> : <EmptyState icon="library-outline" title="مكتبتك تنتظر أول مادة" text="استكشف مواد جامعتك وجرّب الدروس المجانية. تظهر اشتراكاتك المفعّلة هنا تلقائيًا." action={<AppButton title="استكشف المواد" onPress={() => router.push("/(tabs)/courses")} />} />}
    {expired.length ? <><SectionTitle title="مواد تحتاج إلى تجديد" subtitle="تقدمك وملاحظاتك محفوظة، لتكمل من حيث توقفت" /><View style={[styles.grid, { flexDirection: rowDirection }]}>{expired.map((course) => <LearningCard key={course.slug} course={course} inactive wide={width >= 760} />)}</View></> : null}
  </Screen>;
}

function LearningCard({ course, inactive = false, wide }: { course: OwnedCourse; inactive?: boolean; wide: boolean }) {
  const { colors } = useTheme();
  const { locale, rowDirection, isRTL, t } = useLanguage();
  const progress = percentage(course.progress);
  const status = inactive ? course.accessState === "suspended" ? "الوصول موقوف مؤقتًا" : "تحتاج إلى تجديد" : progress === 100 ? "مكتملة" : progress > 0 ? "قيد التعلّم" : "جاهزة للبداية";
  return <Pressable accessibilityRole="button" accessibilityLabel={course.title + ". " + t(status) + ". " + progress + "%"} onPress={() => router.push(inactive ? { pathname: "/course/[slug]", params: { slug: course.slug } } : { pathname: "/learn/[slug]", params: { slug: course.slug } })} style={({ pressed }) => [styles.card, { width: wide ? "48.8%" : "100%", backgroundColor: colors.surface, borderColor: inactive ? colors.warning : colors.border, opacity: pressed ? .85 : 1 }]}>
    <View style={[styles.cardHead, { flexDirection: rowDirection }]}><LinearGradient colors={courseGradient(course.color)} style={styles.art}><Text style={styles.courseIcon}>{course.icon}</Text></LinearGradient><View style={styles.flex}><Text style={[styles.context, { color: colors.primary }]}>{course.university}</Text><Text style={[styles.courseTitle, { color: colors.text }]}>{course.title}</Text></View></View>
    <View style={[styles.progressMeta, { flexDirection: rowDirection }]}><Text style={[styles.status, { color: inactive ? colors.warning : colors.textSoft }]}>{status}</Text><Text style={[styles.percent, { color: colors.primary }]}>{progress}%</Text></View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }} style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { backgroundColor: inactive ? colors.warning : colors.primary, width: progress + "%" as `${number}%` }]} /></View>
    <View style={[styles.cardFooter, { flexDirection: rowDirection, borderColor: colors.border }]}><View style={styles.flex}><Text style={[styles.access, { color: colors.textSoft }]}>{course.expiresAt ? "حتى " + new Date(course.expiresAt).toLocaleDateString(locale) : course.access}</Text><Text style={[styles.cardAction, { color: colors.primary }]}>{inactive ? "عرض خيارات المادة" : progress === 100 ? "راجع ما تعلّمته" : "افتح المادة"}</Text></View><View style={[styles.cardArrow, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={19} color={colors.primary} /></View></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, hero: { borderRadius: 28, padding: 23, overflow: "hidden" }, orbit: { position: "absolute", width: 230, height: 230, borderWidth: 1, borderColor: "rgba(255,255,255,.16)", borderRadius: 115, end: -90, top: -90 }, heroHead: { alignItems: "center", gap: 15 }, eyebrow: { color: "rgba(255,255,255,.85)", fontSize: 11, lineHeight: 20 }, heroTitle: { color: "#FFFFFF", fontSize: 30, lineHeight: 42, fontWeight: "900", marginTop: 9 }, heroIcon: { width: 64, height: 64, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.12)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)" },
  stats: { gap: 9, marginTop: 24, marginBottom: 20 }, stat: { flex: 1, alignItems: "center", paddingVertical: 13, paddingHorizontal: 5, backgroundColor: "rgba(255,255,255,.09)", borderRadius: 16 }, statValue: { fontSize: 23, fontWeight: "900", color: "#FFFFFF", textAlign: "center" }, statLabel: { fontSize: 10, lineHeight: 18, marginTop: 4, color: "rgba(255,255,255,.9)", textAlign: "center" }, resume: { borderRadius: 17, padding: 13, alignItems: "center", gap: 12 }, resumeIcon: { width: 41, height: 41, borderRadius: 14, alignItems: "center", justifyContent: "center" }, resumeLabel: { fontSize: 10, lineHeight: 18 }, resumeTitle: { fontSize: 13, fontWeight: "800", lineHeight: 22 },
  filters: { flexWrap: "wrap", gap: 8, marginBottom: 16 }, filter: { alignItems: "center", borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 11, gap: 8, minHeight: 44 }, filterText: { fontSize: 11, fontWeight: "700" }, filterCount: { fontSize: 11, fontWeight: "900" }, grid: { flexWrap: "wrap", justifyContent: "space-between", gap: 14 },
  card: { borderRadius: 23, borderWidth: 1, padding: 18 }, cardHead: { gap: 13, alignItems: "center" }, art: { width: 61, height: 70, borderRadius: 18, alignItems: "center", justifyContent: "center" }, courseIcon: { fontSize: 29 }, context: { fontSize: 10, fontWeight: "700", lineHeight: 18 }, courseTitle: { fontSize: 17, lineHeight: 27, fontWeight: "900", marginTop: 3 }, progressMeta: { alignItems: "center", justifyContent: "space-between", marginTop: 23 }, status: { fontSize: 11, lineHeight: 19 }, percent: { fontSize: 13, fontWeight: "900" }, track: { height: 6, borderRadius: 4, overflow: "hidden", marginTop: 8 }, fill: { height: 6, borderRadius: 4 }, cardFooter: { borderTopWidth: 1, marginTop: 18, paddingTop: 14, alignItems: "center", gap: 12 }, access: { fontSize: 10, lineHeight: 18 }, cardAction: { fontSize: 12, lineHeight: 21, fontWeight: "800", marginTop: 3 }, cardArrow: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
