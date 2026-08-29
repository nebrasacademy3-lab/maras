import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { useAuthRestoreState } from "@/src/components/AuthRestoreState";
import { CourseCard } from "@/src/components/CourseCard";
import { FeatureDisabledNotice, usePlatformControls } from "@/src/components/PlatformControls";
import { AppButton, EmptyState, ErrorState, LoadingState, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

export default function Favorites() {
  const { user, authReady, restoration } = useAuthRestoreState({ title: "المفضلة", loadingLabel: "جارٍ استعادة موادك المفضلة...", back: true });
  const { colors } = useTheme();
  const controls = usePlatformControls(); const registrationEnabled = controls.enabled("registration");
  const client = useQueryClient();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const favorites = useQuery({ queryKey: ["favorites", user?.id], queryFn: () => api<{ courseSlugs: string[] }>("/api/mobile/favorites"), enabled: authReady && Boolean(user) });
  if (restoration) return restoration;
  if (!user) return <Screen><AppHeader title="المفضلة" subtitle="الدخول إلى مراس" back /><EmptyState icon="heart-outline" title="سجّل الدخول لحفظ المواد" text={registrationEnabled ? "أنشئ حسابًا لتبقى موادك المفضلة متزامنة بين الويب والتطبيق." : "سجّل الدخول إلى حسابك الحالي لمزامنة المواد المفضلة."} action={<View style={styles.actions}><AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login?return_to=%2Ffavorites")} />{registrationEnabled ? <AppButton title="إنشاء حساب" variant="soft" disabled={controls.loading} onPress={() => router.push("/(auth)/register?return_to=%2Ffavorites")} /> : <FeatureDisabledNotice title="التسجيل غير متاح الآن" message={controls.messageFor("يمكنك تصفح المواد والعودة إلى حسابك الحالي.")} />}</View>} /></Screen>;
  if (catalog.isLoading || favorites.isLoading) return <Screen><LoadingState label="نستدعي موادك المفضلة..." /></Screen>;
  if (catalog.isError || favorites.isError) return <Screen><AppHeader title="المفضلة" back /><ErrorState title="تعذر تحميل المفضلة" text="لم نتمكن من مزامنة المواد المحفوظة." onRetry={() => { void catalog.refetch(); void favorites.refetch(); }} /></Screen>;
  const saved = (catalog.data?.courses || []).filter((course) => favorites.data?.courseSlugs.includes(course.slug));
  async function remove(slug: string) { try { await api("/api/mobile/favorites", { method: "POST", body: jsonBody({ courseSlug: slug, active: false }) }); await client.invalidateQueries({ queryKey: ["favorites"] }); } catch (reason) { if (reason instanceof ApiError) console.warn(reason.message); } }
  if (!saved.length) return <Screen><AppHeader title="المفضلة" subtitle="موادك المحفوظة" back /><EmptyState icon="heart-outline" title="لم تحفظ مواد بعد" text="اضغط على القلب في تفاصيل أي مادة لتعود إليها بسهولة." action={<AppButton title="استكشف المواد" onPress={() => router.push("/(tabs)/courses")} />} /></Screen>;
  return <Screen><AppHeader title="المفضلة" subtitle={`${saved.length} مواد محفوظة`} back /><View style={[styles.hero, { backgroundColor: colors.primary }]}><Ionicons name="heart" size={25} color="#FFF" /><Text style={styles.heroTitle}>موادك المفضلة</Text><Text style={styles.heroCopy}>محفوظة على حسابك وتظهر على الويب والتطبيق معًا.</Text></View>{saved.map((course) => <View key={course.slug} style={styles.item}><CourseCard compact course={course} /><Pressable onPress={() => void remove(course.slug)} style={[styles.remove, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="trash-outline" size={16} color={colors.danger} /><Text style={{ color: colors.danger, fontSize: 10, fontWeight: "800" }}>إزالة من المفضلة</Text></Pressable></View>)}</Screen>;
}

const styles = StyleSheet.create({ actions: { width: "100%", gap: 9 }, hero: { borderRadius: 22, padding: 20, marginBottom: 15 }, heroTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", textAlign: "right", marginTop: 7 }, heroCopy: { color: "rgba(255,255,255,.82)", fontSize: 10, textAlign: "right", marginTop: 3 }, item: { marginBottom: 13 }, remove: { minHeight: 38, borderWidth: 1, borderRadius: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 7 } });
