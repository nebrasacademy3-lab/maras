import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { api } from "@/src/lib/api";
import { resolveNotificationRoute } from "@/src/lib/notificationRoute";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type Announcement = { id: number; title: string; body: string; actionUrl: string | null; actionLabel: string | null; presentation: "banner" | "modal" | "all"; dismissible: boolean };
const EMPTY_DISMISSED = new Set<number>();
type DismissalState = { identity: string; ids: Set<number> };

export function AnnouncementCampaign() {
  const { colors } = useTheme();
  const { user, loading } = useAuth();
  const identity = user ? `user:${user.id}` : "guest";
  const [dismissalState, setDismissalState] = useState<DismissalState>(() => ({ identity, ids: new Set() }));
  const dismissed = dismissalState.identity === identity ? dismissalState.ids : EMPTY_DISMISSED;
  const query = useQuery({ queryKey: ["announcements", user?.id ?? "guest"], queryFn: () => api<{ announcements: Announcement[] }>("/api/public/announcements"), enabled: !loading });
  const rows = (query.data?.announcements || []).filter((item) => !dismissed.has(item.id));
  const modal = rows.find((item) => (item.presentation === "modal" || item.presentation === "all") && (item.dismissible || Boolean(resolveNotificationRoute(item.actionUrl)))) || null;
  const banner = rows.find((item) => item.presentation === "banner" || item.presentation === "all");
  const close = (id: number) => setDismissalState((current) => ({ identity, ids: new Set(current.identity === identity ? current.ids : []).add(id) }));
  const action = (item: Announcement) => { const route = resolveNotificationRoute(item.actionUrl); if (!route) return null; return <Pressable style={[styles.action, { backgroundColor: colors.primary }]} onPress={() => { close(item.id); requestAnimationFrame(() => router.push(route)); }}><Text style={styles.actionText}>{item.actionLabel || "اعرف المزيد"}</Text><Ionicons name="arrow-back" size={15} color="#FFF" /></Pressable>; };
  return <>{banner && <View style={[styles.banner, { backgroundColor: colors.primary }]}><Ionicons name="megaphone-outline" size={19} color="#FFF" /><View style={styles.bannerCopy}><Text style={styles.bannerTitle}>{banner.title}</Text><Text style={styles.bannerBody} numberOfLines={2}>{banner.body}</Text></View>{action(banner)}{banner.dismissible && <Pressable onPress={() => close(banner.id)} hitSlop={10}><Ionicons name="close" size={19} color="#FFF" /></Pressable>}</View>}{modal && <Modal visible transparent animationType="fade" onRequestClose={() => modal.dismissible && close(modal.id)}><View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: colors.surface }]}><View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="megaphone" size={25} color={colors.primary} /></View><Text style={[styles.kicker, { color: colors.primary }]}>إعلان من مراس</Text><Text style={[styles.modalTitle, { color: colors.text }]}>{modal.title}</Text><Text style={[styles.modalBody, { color: colors.textSoft }]}>{modal.body}</Text>{action(modal)}{modal.dismissible && <Pressable onPress={() => close(modal.id)} style={styles.later}><Text style={{ color: colors.textSoft, fontWeight: "800" }}>لاحقًا</Text></Pressable>}</View></View></Modal>}</>;
}

const styles = StyleSheet.create({ banner: { marginHorizontal: 12, marginTop: 8, padding: 12, borderRadius: 17, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, bannerCopy: { flex: 1, alignItems: "flex-end" }, bannerTitle: { color: "#FFF", fontSize: 11, fontWeight: "900", textAlign: "right" }, bannerBody: { color: "rgba(255,255,255,.82)", fontSize: 9, marginTop: 3, textAlign: "right", writingDirection: "rtl" }, action: { minHeight: 34, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 }, actionText: { color: "#FFF", fontSize: 9, fontWeight: "900" }, backdrop: { flex: 1, backgroundColor: "rgba(3,10,28,.62)", alignItems: "center", justifyContent: "center", padding: 22 }, modal: { width: "100%", borderRadius: 25, padding: 22, alignItems: "flex-end", shadowColor: "#000", shadowOpacity: .2, shadowRadius: 20, elevation: 8 }, icon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" }, kicker: { fontSize: 10, fontWeight: "900", marginTop: 15 }, modalTitle: { fontSize: 21, fontWeight: "900", textAlign: "right", marginTop: 5 }, modalBody: { fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginTop: 10, marginBottom: 17 }, later: { minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, alignSelf: "center" } });
