import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { courseGradient } from "@/src/components/CourseCard";
import { AppButton, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Dashboard, PublicSettings } from "@/src/types";

export default function Learning() {
  const { user } = useAuth(); const { colors } = useTheme(); const dashboard = useQuery({ queryKey: ["dashboard", user?.id], queryFn: () => api<Dashboard>("/api/mobile/dashboard"), enabled: Boolean(user) }); const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: PublicSettings }>("/api/public/settings"), staleTime: 5_000 });
  if (!user) return <Screen><AppHeader title="موادي" subtitle="مساحتك التعليمية" /><EmptyState icon="lock-closed-outline" title="سجّل الدخول لعرض موادك" text="تقدمك وصلاحيات المواد محفوظة في حسابك وتعمل على جميع أجهزتك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (dashboard.isLoading) return <Screen><LoadingState label="جارٍ تحميل موادك..." /></Screen>;
  const rows = dashboard.data?.owned || [];
  return <Screen><AppHeader title="موادي" subtitle={`${rows.length} مادة بصلاحية نشطة`} unread={dashboard.data?.notifications.filter((item) => !item.readAt).length || 0} />{rows.length ? <View style={styles.list}>{rows.map((course) => <Pressable key={course.slug} onPress={() => router.push({ pathname: "/learn/[slug]", params: { slug: course.slug } })} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><LinearGradient colors={courseGradient(course.color)} style={styles.art}><Text style={styles.icon}>{course.icon}</Text><Ionicons name="play" size={23} color="#FFFFFF" /></LinearGradient><View style={styles.body}><Text style={[styles.context, { color: colors.primary }]}>{course.university}</Text><Text style={[styles.title, { color: colors.text }]}>{course.title}</Text><View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { backgroundColor: colors.primary, width: `${course.progress}%` }]} /></View><View style={styles.footer}><Text style={[styles.soft, { color: colors.textSoft }]}>{course.expiresAt ? `حتى ${new Date(course.expiresAt).toLocaleDateString("ar-SA")}` : course.access}</Text><Text style={[styles.percent, { color: colors.primary }]}>{course.progress}%</Text></View></View></Pressable>)}</View> : <EmptyState icon="library-outline" title="لا توجد مواد مفعّلة" text={settings.data?.settings.course_requests_enabled === "false" ? "استكشف المواد المتاحة واشترك بالمادة المناسبة من موقع مراس." : "استكشف المواد المتاحة، ثم اشترك عبر موقع مراس أو اطلب مادة غير متوفرة."} action={<AppButton title="استكشف المواد" onPress={() => router.push("/(tabs)/courses")} />} />}</Screen>;
}
const styles = StyleSheet.create({ list: { gap: 13 }, card: { borderWidth: 1, borderRadius: 22, overflow: "hidden", flexDirection: "row-reverse", minHeight: 150 }, art: { width: 112, padding: 14, alignItems: "center", justifyContent: "space-between" }, icon: { fontSize: 35 }, body: { flex: 1, padding: 15, alignItems: "flex-end" }, context: { fontSize: 9, fontWeight: "800" }, title: { fontSize: 16, lineHeight: 24, fontWeight: "900", textAlign: "right", marginTop: 5 }, track: { width: "100%", height: 7, borderRadius: 4, overflow: "hidden", marginTop: 15 }, fill: { height: 7, borderRadius: 4 }, footer: { width: "100%", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 8 }, soft: { fontSize: 8 }, percent: { fontSize: 11, fontWeight: "900" } });

