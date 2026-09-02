import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, EmptyState, SectionTitle } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { LearningTrack } from "@/src/types";

const statusLabels: Record<LearningTrack["status"], string> = { coming_soon: "قريبًا", enrollment_open: "التسجيل مفتوح", available: "متاح الآن" };
const iconNames: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = { language: "language-outline", calculator: "calculator-outline", presentation: "easel-outline", rocket: "rocket-outline", target: "locate-outline", book: "book-outline", code: "code-slash-outline", briefcase: "briefcase-outline" };

export function useLearningTracks() {
  const { user } = useAuth();
  const tracks = useQuery({ queryKey: ["learning-tracks"], queryFn: () => api<{ ok: true; tracks: LearningTrack[] }>("/api/public/learning-tracks") });
  const interests = useQuery({ queryKey: ["learning-track-interests", user?.id], queryFn: () => api<{ ok: true; authenticated: boolean; activeSlugs: string[] }>("/api/learning-tracks/interest"), enabled: Boolean(user) });
  return { tracks, interests, activeSlugs: new Set(interests.data?.activeSlugs || []) };
}

export function LearningTrackCard({ track, active, compact = false }: { track: LearningTrack; active: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: async () => api<{ ok: true; active: boolean; message: string }>("/api/learning-tracks/interest", { method: active ? "DELETE" : "POST", body: jsonBody({ slug: track.slug, source: "mobile" }) }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["learning-track-interests"] }); void queryClient.invalidateQueries({ queryKey: ["learning-tracks"] }); },
  });
  const press = () => {
    if (!user) { router.push({ pathname: "/(auth)/login", params: { return_to: "/tracks" } }); return; }
    if (track.status !== "coming_soon" && track.destination && track.destination.startsWith("/")) { router.push(track.destination as never); return; }
    toggle.mutate();
  };
  const message = toggle.error instanceof ApiError ? toggle.error.message : "";
  return <Card style={[styles.card, compact && styles.compactCard]}>
    <View style={styles.head}><View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={iconNames[track.iconKey] || "sparkles-outline"} size={20} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>{track.title}</Text><Text style={[styles.subtitle, { color: colors.textSoft }]}>{track.subtitle}</Text></View><Text style={[styles.status, { color: track.status === "coming_soon" ? colors.warning : colors.success }]}>{statusLabels[track.status]}</Text></View>
    {!compact && track.description ? <Text style={[styles.description, { color: colors.textSoft }]}>{track.description}</Text> : null}
    <View style={styles.meta}>{track.showInterestCount ? <Text style={[styles.metaText, { color: colors.textSoft }]}>{track.interestCount} مهتم</Text> : null}{track.launchAt ? <Text style={[styles.metaText, { color: colors.textSoft }]}>الموعد المتوقع: {new Date(track.launchAt).toLocaleDateString("ar-SA")}</Text> : null}</View>
    <AppButton title={track.status !== "coming_soon" && track.destination ? track.ctaLabel || "افتح المسار" : active ? "تم تفعيل التنبيه · إلغاء" : track.ctaLabel || "أبلغني عند الإطلاق"} icon={track.status !== "coming_soon" && track.destination ? "arrow-back-outline" : active ? "notifications-off-outline" : "notifications-outline"} variant={active ? "soft" : "primary"} loading={toggle.isPending} onPress={press} />
    {message ? <Text style={[styles.error, { color: colors.danger }]}>{message}</Text> : null}
  </Card>;
}

export function HomeLearningTracks() {
  const { tracks, activeSlugs } = useLearningTracks();
  const visible = (tracks.data?.tracks || []).slice(0, 3);
  if (!visible.length) return null;
  return <>
    <SectionTitle title="المسارات القادمة" subtitle="سجّل اهتمامك ليصلك إشعار عند الإطلاق" action={<Pressable onPress={() => router.push("/tracks")}><Text style={styles.link}>الكل</Text></Pressable>} />
    <View style={styles.list}>{visible.map((track) => <LearningTrackCard key={track.slug} track={track} active={activeSlugs.has(track.slug)} compact />)}</View>
  </>;
}

export function LearningTracksList() {
  const { tracks, activeSlugs } = useLearningTracks();
  if (tracks.isError) return <EmptyState icon="cloud-offline-outline" title="تعذر تحميل المسارات" text={tracks.error instanceof Error ? tracks.error.message : "حاول مرة أخرى بعد قليل."} action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void tracks.refetch()} />} />;
  const rows = tracks.data?.tracks || [];
  if (!tracks.isLoading && !rows.length) return <EmptyState icon="map-outline" title="لا توجد مسارات معلنة حاليًا" text="سنعلن هنا عن المسارات الجديدة قبل إطلاقها لتسجّل اهتمامك مبكرًا." />;
  return <View style={styles.list}>{rows.map((track) => <LearningTrackCard key={track.slug} track={track} active={activeSlugs.has(track.slug)} />)}</View>;
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: { gap: 10 },
  compactCard: { paddingVertical: 12 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  subtitle: { fontSize: 10, lineHeight: 16, textAlign: "right", writingDirection: "rtl" },
  status: { fontSize: 9, fontWeight: "900" },
  description: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl" },
  meta: { flexDirection: "row-reverse", gap: 12 },
  metaText: { fontSize: 9, fontWeight: "700" },
  error: { fontSize: 10, textAlign: "right" },
  link: { fontSize: 11, fontWeight: "900", color: "#2563eb" },
});
