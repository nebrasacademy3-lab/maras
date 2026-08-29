import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

type Announcement = { id: number; title: string; body: string; actionUrl: string | null; actionLabel: string | null; presentation: "banner" | "modal" | "all"; dismissible: boolean };
const DISMISSED_KEY = "meras-dismissed-announcements";
function routeFor(url: string | null) { if (!url || !url.startsWith("/") || url.startsWith("//")) return null; if (url === "/courses") return "/(tabs)/courses"; if (url === "/universities") return "/(tabs)/universities"; if (url.startsWith("/learn/")) return { pathname: "/course/[slug]" as const, params: { slug: decodeURIComponent(url.slice("/learn/".length)) } }; return url as never; }
async function readDismissed() { try { const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(DISMISSED_KEY) : await SecureStore.getItemAsync(DISMISSED_KEY); const values = raw ? JSON.parse(raw) as unknown : []; return new Set(Array.isArray(values) ? values.filter((item): item is number => Number.isInteger(item)) : []); } catch { return new Set<number>(); } }
async function writeDismissed(values: Set<number>) { try { const raw = JSON.stringify([...values].slice(-200)); if (Platform.OS === "web") globalThis.localStorage?.setItem(DISMISSED_KEY, raw); else await SecureStore.setItemAsync(DISMISSED_KEY, raw); } catch { /* Storage can be unavailable in private mode. */ } }

export function AnnouncementCampaign() {
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { let active = true; void readDismissed().then((values) => { if (active) { setDismissed(values); setHydrated(true); } }); return () => { active = false; }; }, []);
  const query = useQuery({ queryKey: ["announcements"], queryFn: () => api<{ announcements: Announcement[] }>("/api/public/announcements"), refetchInterval: 60_000, staleTime: 20_000 });
  const rows = hydrated ? (query.data?.announcements || []).filter((item) => !dismissed.has(item.id)) : [];
  const modal = rows.find((item) => item.presentation === "modal" || item.presentation === "all") || null;
  const banner = rows.find((item) => item.presentation === "banner" || item.presentation === "all");
  const close = (id: number) => setDismissed((current) => { const next = new Set(current).add(id); void writeDismissed(next); return next; });
  const action = (item: Announcement) => { const route = routeFor(item.actionUrl); if (!route) return null; return <Pressable style={[styles.action, { backgroundColor: colors.primary }]} onPress={() => { close(item.id); router.push(route); }}><Text style={styles.actionText}>{item.actionLabel || "اعرف المزيد"}</Text><Ionicons name="arrow-back" size={15} color="#FFF" /></Pressable>; };
  return <>{banner && <View style={[styles.banner, { backgroundColor: colors.primary }]}><Ionicons name="megaphone-outline" size={19} color="#FFF" /><View style={styles.bannerCopy}><Text style={styles.bannerTitle}>{banner.title}</Text><Text style={styles.bannerBody} numberOfLines={2}>{banner.body}</Text></View>{action(banner)}{banner.dismissible && <Pressable onPress={() => close(banner.id)} hitSlop={10}><Ionicons name="close" size={19} color="#FFF" /></Pressable>}</View>}{modal && <Modal visible transparent animationType="fade" onRequestClose={() => modal.dismissible && close(modal.id)}><View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: colors.surface }]}><View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="megaphone" size={25} color={colors.primary} /></View><Text style={[styles.kicker, { color: colors.primary }]}>إعلان من مراس</Text><Text style={[styles.modalTitle, { color: colors.text }]}>{modal.title}</Text><Text style={[styles.modalBody, { color: colors.textSoft }]}>{modal.body}</Text>{action(modal)}{modal.dismissible && <Pressable onPress={() => close(modal.id)} style={styles.later}><Text style={{ color: colors.textSoft, fontWeight: "800" }}>لاحقًا</Text></Pressable>}</View></View></Modal>}</>;
}

const styles = StyleSheet.create({ banner: { marginHorizontal: 12, marginTop: 8, padding: 12, borderRadius: 17, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, bannerCopy: { flex: 1, alignItems: "flex-end" }, bannerTitle: { color: "#FFF", fontSize: 11, fontWeight: "900", textAlign: "right" }, bannerBody: { color: "rgba(255,255,255,.82)", fontSize: 9, marginTop: 3, textAlign: "right", writingDirection: "rtl" }, action: { minHeight: 34, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 }, actionText: { color: "#FFF", fontSize: 9, fontWeight: "900" }, backdrop: { flex: 1, backgroundColor: "rgba(3,10,28,.62)", alignItems: "center", justifyContent: "center", padding: 22 }, modal: { width: "100%", borderRadius: 25, padding: 22, alignItems: "flex-end", shadowColor: "#000", shadowOpacity: .2, shadowRadius: 20, elevation: 8 }, icon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" }, kicker: { fontSize: 10, fontWeight: "900", marginTop: 15 }, modalTitle: { fontSize: 21, fontWeight: "900", textAlign: "right", marginTop: 5 }, modalBody: { fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginTop: 10, marginBottom: 17 }, later: { minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, alignSelf: "center" } });
