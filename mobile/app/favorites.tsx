import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { AppButton, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

export default function Favorites() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const favorites = useQuery({ queryKey: ["favorites", user?.id], queryFn: () => api<{ courseSlugs: string[] }>("/api/mobile/favorites"), enabled: Boolean(user) });
  if (!user) return <Screen><AppHeader title="المفضلة" subtitle="الدخول إلى مراس" back /><EmptyState icon="heart-outline" title="سجّل الدخول لحفظ المواد" text="أنشئ حسابًا لتبقى موادك المفضلة متزامنة بين الويب والتطبيق." action={<View style={styles.actions}><AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} /><AppButton title="إنشاء حساب" variant="soft" onPress={() => router.push("/(auth)/register")} /></View>} /></Screen>;
  if (catalog.isLoading || favorites.isLoading) return <Screen><LoadingState label="نستدعي موادك المفضلة..." /></Screen>;
  const saved = (catalog.data?.courses || []).filter((course) => favorites.data?.courseSlugs.includes(course.slug));
  async function remove(slug: string) { try { await api("/api/mobile/favorites", { method: "POST", body: jsonBody({ courseSlug: slug, active: false }) }); await client.invalidateQueries({ queryKey: ["favorites"] }); } catch (reason) { if (reason instanceof ApiError) console.warn(reason.message); } }
  if (!saved.length) return <Screen><AppHeader title="المفضلة" subtitle="موادك المحفوظة" back /><EmptyState icon="heart-outline" title="لم تحفظ مواد بعد" text="اضغط على القلب في تفاصيل أي مادة لتعود إليها بسهولة." action={<AppButton title="استكشف المواد" onPress={() => router.push("/(tabs)/courses")} />} /></Screen>;
  return <Screen><AppHeader title="المفضلة" subtitle={`${saved.length} مواد محفوظة`} back /><View style={[styles.hero, { backgroundColor: colors.primary }]}><Ionicons name="heart" size={25} color="#FFF" /><Text style={styles.heroTitle}>موادك المفضلة</Text><Text style={styles.heroCopy}>محفوظة على حسابك وتظهر على الويب والتطبيق معًا.</Text></View>{saved.map((course) => <View key={course.slug} style={styles.item}><CourseCard compact course={course} /><Pressable onPress={() => void remove(course.slug)} style={[styles.remove, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="trash-outline" size={16} color={colors.danger} /><Text style={{ color: colors.danger, fontSize: 10, fontWeight: "800" }}>إزالة من المفضلة</Text></Pressable></View>)}</Screen>;
}

const styles = StyleSheet.create({ actions: { width: "100%", gap: 9 }, hero: { borderRadius: 22, padding: 20, marginBottom: 15 }, heroTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", textAlign: "right", marginTop: 7 }, heroCopy: { color: "rgba(255,255,255,.82)", fontSize: 10, textAlign: "right", marginTop: 3 }, item: { marginBottom: 13 }, remove: { minHeight: 38, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 7 } });
