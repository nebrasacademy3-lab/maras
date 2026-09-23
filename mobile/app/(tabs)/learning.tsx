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
type Filter = "all" | "active" | "complete";

export default function Learning() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { rowDirection, isRTL, t } = useLanguage();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<Filter>("all");
  const dashboard = useQuery({ queryKey: ["dashboard", user?.id], queryFn: ({ signal }) => api<Dashboard>("/api/mobile/dashboard", { signal }), enabled: Boolean(user) });
  if (!user) return <Screen><AppHeader title="موادي" subtitle="مساحتك التعليمية" /><EmptyState icon="lock-closed-outline" title="سجّل الدخول لعرض موادك" text="تقدمك وملاحظاتك محفوظة في حسابك، لتكمل التعلّم من أي جهاز." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (dashboard.isLoading) return <Screen><AppHeader title="موادي" /><LoadingState label="جارٍ تحميل موادك…" /></Screen>;
  if (dashboard.isError) return <Screen><AppHeader title="موادي" /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل موادك" text="لم نتمكن من الوصول إلى حسابك الآن. تحقق من اتصالك وأعد المحاولة." action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void dashboard.refetch()} />} /></Screen>;

  const courses = dashboard.data?.owned || [];
  const expired = dashboard.data?.expired || [];
  const completed = courses.filter((course) => percentage(course.progress) === 100).length;
  const started = courses.filter((course) => percentage(course.progress) > 0 && percentage(course.progress) < 100).length;
  const rows = courses.filter((course) => filter === "all" || (filter === "complete" ? percentage(course.progress) === 100 : percentage(course.progress) > 0 && percentage(course.progress) < 100));
  const resume = courses.find((course) => course.currentLessonId && percentage(course.progress) < 100) || courses.find((course) => percentage(course.progress) < 100);
  const nextLesson = resume?.units.flatMap((unit) => unit.lessons).find((lesson) => lesson.id === resume.currentLessonId);
  const filters: { id: Filter; title: string; count: number }[] = [{ id: "all", title: "كل موادي", count: courses.length }, { id: "active", title: "أتابع تعلّمها", count: started }, { id: "complete", title: "أتممتها", count: completed }];
  return <Screen>
    <AppHeader title="موادي" subtitle="كل خطوة تتعلّمها، تبقى معك" unread={dashboard.data?.notifications.filter((item) => !item.readAt).length || 0} />
    {courses.length ? <>
      <FadeIn><LinearGradient colors={[colors.hero, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View pointerEvents="none" style={styles.orbit} />
        <View style={[styles.heroHead, { flexDirection: rowDirection }]}><View style={styles.flex}><Text style={styles.eyebrow}>رحلتك في مراس</Text><Text accessibilityRole="header" style={styles.heroTitle}>{resume ? "خطوة أخرى، وفهم أعمق." : "أتممتها. وهذا إنجاز."}</Text><Text style={styles.heroCopy}>{resume ? "تقدمك محفوظ. أكمل من آخر نقطة وصلت إليها." : "مكتبتك جاهزة للمراجعة متى احتجت."}</Text></View><View style={styles.heroIcon}><Ionicons name={resume ? "book-outline" : "ribbon-outline"} size={28} color={colors.onPrimary} /></View></View>
        <View style={[styles.stats, { flexDirection: rowDirection }]}>{[{ value: courses.length, title: "مادة متاحة" }, { value: started, title: "قيد التعلّم" }, { value: completed, title: "مكتملة" }].map((item) => <View key={item.title} style={styles.stat}><Text style={styles.statValue}>{item.value}</Text><Text style={styles.statLabel}>{item.title}</Text></View>)}</View>
        {resume ? <Pressable accessibilityRole="button" accessibilityLabel={t("أكمل التعلّم") + ": " + resume.title} onPress={() => router.push({ pathname: "/learn/[slug]", params: { slug: resume.slug } })} style={({ pressed }) => [styles.resume, { backgroundColor: colors.surface, opacity: pressed ? .84 : 1 }]}>
          <View style={[styles.resumeTop, { flexDirection: rowDirection }]}><View style={[styles.resumeIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="play" size={19} color={colors.primary} /></View><View style={styles.flex}><Text style={[styles.resumeLabel, { color: colors.primary }]}>تابع من حيث توقفت</Text><Text numberOfLines={2} style={[styles.resumeTitle, { color: colors.text }]}>{resume.title}</Text>{nextLesson ? <Text numberOfLines={1} style={[styles.resumeLesson, { color: colors.textSoft }]}>الدرس القادم: {nextLesson.title}</Text> : null}</View><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={22} color={colors.primary} /></View>
          <View style={[styles.resumeProgress, { flexDirection: rowDirection }]}><Text style={[styles.resumeProgressLabel, { color: colors.textSoft }]}>التقدم في المادة</Text><Text style={[styles.resumePercent, { color: colors.primary }]}>{percentage(resume.progress)}%</Text></View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percentage(resume.progress) }} style={[styles.resumeTrack, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.resumeFill, { width: `${percentage(resume.progress)}%` as `${number}%`, backgroundColor: colors.primary }]} /></View>
        </Pressable> : null}
      </LinearGradient></FadeIn>
      <SectionTitle title="مكتبتك التعليمية" subtitle="موادك ودروسك وتقدمك في مكان واحد" />
      <View accessibilityRole="radiogroup" style={[styles.filters, { flexDirection: rowDirection }]}>{filters.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: filter === item.id }} onPress={() => setFilter(item.id)} style={[styles.filter, { flexDirection: rowDirection, backgroundColor: filter === item.id ? colors.action : colors.surface, borderColor: filter === item.id ? colors.action : colors.border }]}><Text style={[styles.filterText, { color: filter === item.id ? colors.onPrimary : colors.textSoft }]}>{item.title}</Text><Text style={[styles.filterCount, { color: filter === item.id ? colors.onPrimary : colors.primary }]}>{item.count}</Text></Pressable>)}</View>
      {rows.length ? <View style={[styles.grid, { flexDirection: rowDirection }]}>{rows.map((course) => <LearningCard key={course.slug} course={course} wide={width >= 760} />)}</View> : <EmptyState icon="bookmark-outline" title={filter === "complete" ? "إنجازك القادم يبدأ بدرس" : "ابدأ أول خطوة"} text="افتح إحدى موادك وتابع دروسها، وسيظهر تقدمك هنا تلقائيًا." action={<AppButton title="عرض كل موادي" variant="soft" onPress={() => setFilter("all")} />} />}
    </> : <EmptyState icon="library-outline" title="مكتبتك تنتظر أول مادة" text="استكشف مواد جامعتك وجرّب الدروس المجانية. تظهر اشتراكاتك المفعّلة هنا تلقائيًا." action={<AppButton title="استكشف المواد" onPress={() => router.push("/(tabs)/courses")} />} />}
    {expired.length ? <><SectionTitle title="مواد تحتاج إلى تجديد" subtitle="تقدمك وملاحظاتك محفوظة، لتكمل من حيث توقفت" /><View style={[styles.grid, { flexDirection: rowDirection }]}>{expired.map((course) => <LearningCard key={course.slug} course={course} inactive wide={width >= 760} />)}</View></> : null}
  </Screen>;
}

function LearningCard({ course, inactive = false, wide }: { course: OwnedCourse; inactive?: boolean; wide: boolean }) {
  const { colors } = useTheme();
  const { locale, rowDirection, isRTL, t } = useLanguage();
  const progress = percentage(course.progress);
  const status = inactive ? course.accessState === "scheduled" ? "يبدأ الوصول لاحقًا" : course.accessState === "suspended" ? "الوصول موقوف مؤقتًا" : "تحتاج إلى تجديد" : progress === 100 ? "مكتملة" : progress > 0 ? "قيد التعلّم" : "جاهزة للبداية";
  const destination = inactive ? { pathname: "/course/[slug]" as const, params: { slug: course.slug } } : { pathname: "/learn/[slug]" as const, params: { slug: course.slug } };
  return <Pressable accessibilityRole="button" accessibilityLabel={course.title + ". " + t(status) + ". " + progress + "%"} onPress={() => router.push(destination)} style={({ pressed }) => [styles.card, { width: wide ? "48.8%" : "100%", backgroundColor: colors.surface, borderColor: inactive ? colors.warning : colors.border, opacity: pressed ? .84 : 1 }]}>
    <View style={[styles.cardHead, { flexDirection: rowDirection }]}><LinearGradient colors={courseGradient(course.color)} style={styles.art}><Text style={styles.courseIcon}>{course.icon}</Text></LinearGradient><View style={styles.flex}><Text numberOfLines={1} style={[styles.context, { color: colors.primary }]}>{course.university}</Text><Text numberOfLines={2} style={[styles.courseTitle, { color: colors.text }]}>{course.title}</Text></View></View>
    <View style={[styles.progressMeta, { flexDirection: rowDirection }]}><Text style={[styles.status, { color: inactive ? colors.warning : colors.textSoft }]}>{status}</Text><Text style={[styles.percent, { color: colors.primary }]}>{progress}%</Text></View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }} style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { backgroundColor: inactive ? colors.warning : colors.primary, width: `${progress}%` as `${number}%` }]} /></View>
    <View style={[styles.cardFooter, { flexDirection: rowDirection, borderColor: colors.border }]}><View style={styles.flex}><Text style={[styles.access, { color: colors.textSoft }]}>{course.expiresAt ? "حتى " + new Date(course.expiresAt).toLocaleDateString(locale) : course.access}</Text><Text style={[styles.cardAction, { color: colors.primary }]}>{inactive ? "عرض خيارات المادة" : progress === 100 ? "راجع ما تعلّمته" : progress > 0 ? "أكمل الدروس" : "ابدأ التعلّم"}</Text></View><View style={[styles.cardArrow, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={20} color={colors.primary} /></View></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { borderRadius: 30, padding: 22, overflow: "hidden", borderCurve: "continuous" }, orbit: { position: "absolute", width: 240, height: 240, borderWidth: 1, borderColor: "rgba(255,255,255,.16)", borderRadius: 120, end: -95, top: -105 },
  heroHead: { alignItems: "flex-start", gap: 12 }, eyebrow: { color: "#EAD59F", fontSize: 12, lineHeight: 21, fontWeight: "800" }, heroTitle: { color: "#FFFFFF", fontSize: 28, lineHeight: 40, fontWeight: "900", marginTop: 7, maxWidth: 460 }, heroCopy: { color: "#DFE9F8", fontSize: 13, lineHeight: 23, marginTop: 6 }, heroIcon: { width: 55, height: 55, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.13)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)" },
  stats: { gap: 8, marginTop: 21, marginBottom: 17 }, stat: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", paddingVertical: 12, paddingHorizontal: 3, backgroundColor: "rgba(255,255,255,.1)", borderRadius: 16 }, statValue: { fontSize: 23, fontWeight: "900", color: "#FFFFFF", textAlign: "center" }, statLabel: { fontSize: 11, lineHeight: 18, marginTop: 4, color: "#EAF1FB", textAlign: "center" },
  resume: { borderRadius: 19, padding: 15, gap: 10 }, resumeTop: { alignItems: "center", gap: 12 }, resumeIcon: { width: 45, height: 45, borderRadius: 14, alignItems: "center", justifyContent: "center" }, resumeLabel: { fontSize: 11, lineHeight: 18, fontWeight: "800" }, resumeTitle: { fontSize: 16, fontWeight: "900", lineHeight: 25 }, resumeLesson: { fontSize: 12, lineHeight: 20 }, resumeProgress: { justifyContent: "space-between", alignItems: "center" }, resumeProgressLabel: { fontSize: 11 }, resumePercent: { fontSize: 12, fontWeight: "900" }, resumeTrack: { height: 7, borderRadius: 4, overflow: "hidden" }, resumeFill: { height: 7, borderRadius: 4 },
  filters: { flexWrap: "wrap", gap: 8, marginBottom: 16 }, filter: { alignItems: "center", borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 8, minHeight: 48 }, filterText: { fontSize: 12, lineHeight: 21, fontWeight: "800" }, filterCount: { fontSize: 12, fontWeight: "900" }, grid: { flexWrap: "wrap", justifyContent: "space-between", gap: 13 },
  card: { borderRadius: 23, borderWidth: 1, padding: 17, borderCurve: "continuous" }, cardHead: { gap: 13, alignItems: "center" }, art: { width: 62, height: 68, borderRadius: 17, alignItems: "center", justifyContent: "center" }, courseIcon: { fontSize: 29 }, context: { fontSize: 11, fontWeight: "800", lineHeight: 19 }, courseTitle: { fontSize: 17, lineHeight: 27, fontWeight: "900", marginTop: 3 },
  progressMeta: { alignItems: "center", justifyContent: "space-between", marginTop: 20 }, status: { fontSize: 12, lineHeight: 20 }, percent: { fontSize: 14, fontWeight: "900" }, track: { height: 7, borderRadius: 4, overflow: "hidden", marginTop: 8 }, fill: { height: 7, borderRadius: 4 },
  cardFooter: { borderTopWidth: 1, marginTop: 17, paddingTop: 14, alignItems: "center", gap: 12 }, access: { fontSize: 11, lineHeight: 19 }, cardAction: { fontSize: 13, lineHeight: 22, fontWeight: "800", marginTop: 3 }, cardArrow: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
