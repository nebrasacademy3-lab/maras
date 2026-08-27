import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Notice } from "@/src/types";

function openNotificationAction(actionUrl?: string | null) {
  if (!actionUrl || !actionUrl.startsWith("/")) return;
  const [path = "", query] = actionUrl.split("?", 2);
  if (path.startsWith("/learn/")) {
    const slug = decodeURIComponent(path.slice("/learn/".length));
    if (slug) router.push({ pathname: "/course/[slug]", params: { slug } });
  } else if (path === "/courses") router.push("/(tabs)/courses");
  else if (path === "/universities") router.push("/(tabs)/universities");
  else if (path === "/support") router.push("/support");
  else if (path === "/contact") router.push("/contact");
  else if (path === "/request-course") router.push("/requests");
  else if (path === "/supervisor") router.push("/supervisor");
  else if (path === "/admin") router.push("/admin");
  else if (path === "/dashboard") {
    const view = new URLSearchParams(query || "").get("view");
    if (view === "notifications") router.push("/notifications");
    else if (view === "account") router.push("/profile");
    else if (view === "requests") router.push("/requests");
    else router.push("/(tabs)");
  }
}

export default function Notifications() {
  const { user } = useAuth(); const { colors } = useTheme(); const client = useQueryClient(); const query = useQuery({ queryKey: ["notifications", user?.id], queryFn: () => api<{ notifications: Notice[]; unreadCount?: number }>("/api/mobile/notifications"), enabled: Boolean(user) });
  useEffect(() => {
    if (!user || !query.data?.notifications.some((item) => !item.readAt)) return;
    void api("/api/mobile/notifications", { method: "PATCH", body: jsonBody({ all: true }) }).then(() => { void client.invalidateQueries({ queryKey: ["notifications", user.id] }); void client.invalidateQueries({ queryKey: ["dashboard"] }); }).catch(() => undefined);
  }, [client, query.data, user]);
  const read = useMutation({ mutationFn: (payload: { id?: number; all?: boolean }) => api("/api/mobile/notifications", { method: "PATCH", body: jsonBody(payload) }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["notifications"] }); void client.invalidateQueries({ queryKey: ["dashboard"] }); } });
  if (!user) return <Screen><AppHeader title="الإشعارات" back /><EmptyState title="سجّل الدخول" text="إشعارات الحساب والمواد والطلبات خاصة بك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (query.isLoading) return <Screen><LoadingState /></Screen>;
  const rows = query.data?.notifications || []; const unread = rows.filter((item) => !item.readAt).length;
  return <Screen><AppHeader title="الإشعارات" subtitle={`${unread} غير مقروء`} back unread={unread} />{unread > 0 && <View style={styles.readAll}><AppButton title="تحديد الكل كمقروء" variant="soft" icon="checkmark-done-outline" onPress={() => read.mutate({ all: true })} /></View>}{rows.length ? rows.map((item) => <Pressable key={item.id} onPress={() => { if (!item.readAt) read.mutate({ id: item.id }); openNotificationAction(item.actionUrl); }}><Card style={[styles.notice, !item.readAt && { borderColor: colors.primary }]}><View style={[styles.icon, { backgroundColor: !item.readAt ? `${colors.primary}18` : colors.surfaceAlt }]}><Ionicons name={!item.readAt ? "notifications" : "notifications-outline"} size={20} color={!item.readAt ? colors.primary : colors.textSoft} /></View><View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>{item.title}</Text><Text style={[styles.body, { color: colors.textSoft }]}>{item.body}</Text>{item.actionUrl && <Text style={[styles.actionLabel, { color: colors.primary }]}>{item.actionLabel || "فتح التفاصيل"}  ›</Text>}<Text style={[styles.date, { color: colors.textSoft }]}>{new Date(item.createdAt).toLocaleString("ar-SA")}</Text></View>{!item.readAt && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}</Card></Pressable>) : <EmptyState icon="notifications-off-outline" title="لا توجد إشعارات" text="ستصلك هنا تحديثات الشراء وطلبات المواد والدعم." />}</Screen>;
}
const styles = StyleSheet.create({ readAll: { marginBottom: 12 }, notice: { marginBottom: 9, flexDirection: "row-reverse", alignItems: "flex-start", gap: 11 }, icon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" }, copy: { flex: 1, alignItems: "flex-end" }, title: { fontSize: 12, fontWeight: "900", textAlign: "right" }, body: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl", marginTop: 4 }, date: { fontSize: 7, marginTop: 7 }, actionLabel: { fontSize: 9, fontWeight: "900", marginTop: 6, textAlign: "right" }, dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 } });

