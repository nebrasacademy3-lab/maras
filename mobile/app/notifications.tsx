import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { clearNativeNotificationBadge, setNativeNotificationBadge } from "@/src/hooks/usePushNotifications";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { Notice } from "@/src/types";
import { openNotificationRoute } from "@/src/lib/notification-routing";

type NotificationsPayload = { notifications: Notice[]; unreadCount?: number };
type ReadResult = { readAt: string; unreadCount: number; markedIds: number[] };

function iconFor(item: Notice): React.ComponentProps<typeof Ionicons>["name"] {
  if (item.template === "discount") return "pricetag-outline";
  if (item.template === "new-course") return "book-outline";
  if (item.template === "new-service") return "sparkles-outline";
  if (item.template === "urgent") return "warning-outline";
  if (item.template === "success") return "checkmark-circle-outline";
  return "notifications-outline";
}

export default function Notifications() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { locale, direction, rowDirection, isRTL } = useLanguage();
  const client = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const queryKey = useMemo(() => ["notifications", user?.id] as const, [user?.id]);
  const query = useQuery({
    queryKey,
    queryFn: () => api<NotificationsPayload>("/api/mobile/notifications"),
    enabled: Boolean(user),
  });

  const updateLocalReadState = useCallback((id?: number) => {
    client.setQueryData<NotificationsPayload>(queryKey, (current) => {
      if (!current) return current;
      const notifications = current.notifications.map((item) => !id || item.id === id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item);
      return { ...current, notifications, unreadCount: notifications.filter((item) => !item.readAt).length };
    });
  }, [client, queryKey]);

  const { mutate: markRead, isPending: readPending } = useMutation({
    mutationFn: (payload: { id?: number; all?: boolean }) => api<ReadResult>("/api/mobile/notifications", { method: "PATCH", body: jsonBody(payload) }),
    onMutate: async (payload) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<NotificationsPayload>(queryKey);
      updateLocalReadState(payload.all ? undefined : payload.id);
      return { previous };
    },
    onError: (reason, _payload, context) => {
      const definitiveFailure = reason instanceof ApiError && reason.status >= 400 && reason.status < 500 && reason.status !== 408;
      if (definitiveFailure && context?.previous) client.setQueryData(queryKey, context.previous);
    },
    onSuccess: async (result) => {
      client.setQueryData<NotificationsPayload>(queryKey, (current) => current ? { ...current, unreadCount: result.unreadCount } : current);
      if (result.unreadCount === 0) await clearNativeNotificationBadge();
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["notifications"], refetchType: "active" }),
        client.invalidateQueries({ queryKey: ["dashboard"], refetchType: "active" }),
      ]);
      const current = client.getQueryData<NotificationsPayload>(queryKey);
      if (current) {
        const authoritativeUnread = typeof current.unreadCount === "number" ? current.unreadCount : current.notifications.filter((item) => !item.readAt).length;
        await setNativeNotificationBadge(authoritativeUnread);
      }
    },
  });

  if (!user) return <Screen><AppHeader title="الإشعارات" back /><EmptyState title="سجّل الدخول" text="إشعارات الحساب والمواد والطلبات خاصة بك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (query.isLoading) return <Screen><LoadingState /></Screen>;

  const rows = query.data?.notifications || [];
  const unread = rows.filter((item) => !item.readAt).length;
  const visible = filter === "unread" ? rows.filter((item) => !item.readAt) : rows;
  const groups = new Map<string, Notice[]>();
  for (const item of visible) {
    const date = new Date(item.createdAt);
    const label = Number.isNaN(date.getTime()) ? "تحديثات سابقة" : date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    groups.set(label, [...(groups.get(label) || []), item]);
  }

  return <Screen>
    <AppHeader title="الإشعارات" subtitle={unread ? `${unread} غير مقروء` : "كل الإشعارات مقروءة"} back unread={unread} />
    <View style={[styles.summary, { direction, flexDirection: rowDirection, backgroundColor: colors.primary }]}>
      <View style={styles.summaryOrb}><Ionicons name={unread ? "notifications" : "checkmark-done"} size={27} color="#FFFFFF" /></View>
      <View style={styles.summaryCopy}><Text style={styles.summaryKicker}>مركز تحديثاتك</Text><Text style={styles.summaryTitle}>{unread ? `${unread} إشعار ينتظر اطلاعك` : "أنت مطّلع على كل جديد"}</Text><Text style={styles.summaryBody}>المواد والطلبات والهدايا والدعم في تسلسل واضح.</Text></View>
      {unread > 0 ? <Pressable disabled={readPending} onPress={() => markRead({ all: true })} style={({ pressed }) => [styles.readAll, { opacity: pressed || readPending ? .65 : 1 }]} accessibilityRole="button" accessibilityLabel="قراءة كل الإشعارات"><Ionicons name="checkmark-done-outline" size={17} color="#FFFFFF" /><Text style={styles.readAllText}>قراءة الكل</Text></Pressable> : null}
    </View>
    <View style={[styles.filters, { direction, flexDirection: rowDirection }]}>{(["all", "unread"] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, { backgroundColor: filter === value ? colors.primary : colors.surface, borderColor: filter === value ? colors.primary : colors.border }]}><Text style={[styles.filterText, { color: filter === value ? "#FFFFFF" : colors.text }]}>{value === "all" ? "الكل" : "غير المقروءة"}</Text><View style={[styles.filterCount, { backgroundColor: filter === value ? "rgba(255,255,255,.18)" : colors.surfaceAlt }]}><Text style={[styles.filterCountText, { color: filter === value ? "#FFFFFF" : colors.textSoft }]}>{value === "all" ? rows.length : unread}</Text></View></Pressable>)}</View>
    {visible.length ? [...groups.entries()].map(([label, items]) => <View key={label} style={styles.group}><Text style={[styles.groupTitle, { color: colors.textSoft }]}>{label}</Text>{items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: !item.readAt }} onPress={() => { if (!item.readAt) markRead({ id: item.id }); openNotificationRoute(item.actionUrl); }} style={({ pressed }) => ({ opacity: pressed ? .72 : 1 })}>
      <Card style={[styles.notice, { direction, flexDirection: rowDirection }, !item.readAt && { borderColor: colors.primary, backgroundColor: `${colors.primary}08` }]}>
        <View style={[styles.icon, { backgroundColor: !item.readAt ? `${colors.primary}18` : colors.surfaceAlt }]}><Ionicons name={iconFor(item)} size={21} color={!item.readAt ? colors.primary : colors.textSoft} /></View>
        <View style={styles.copy}><View style={[styles.titleRow, { flexDirection: rowDirection }]}><Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>{!item.readAt ? <Text style={[styles.newLabel, { color: colors.primary, backgroundColor: `${colors.primary}14` }]}>جديد</Text> : null}</View><Text style={[styles.body, { color: colors.textSoft }]}>{item.body}</Text><View style={[styles.meta, { flexDirection: rowDirection }]}><Text style={[styles.date, { color: colors.textSoft }]}>{new Date(item.createdAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}</Text>{item.actionUrl ? <Text style={[styles.actionLabel, { color: colors.primary }]}>{item.actionLabel || "فتح التفاصيل"} <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={11} color={colors.primary} /></Text> : null}</View></View>
        {!item.readAt && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
      </Card>
    </Pressable>)}</View>) : <EmptyState icon={filter === "unread" ? "checkmark-done-circle-outline" : "notifications-off-outline"} title={filter === "unread" ? "قرأت كل الإشعارات" : "لا توجد إشعارات"} text={filter === "unread" ? "لا توجد تحديثات غير مقروءة الآن." : "ستصلك هنا تحديثات الشراء وطلبات المواد والدعم."} />}
  </Screen>;
}

const styles = StyleSheet.create({
  summary: { overflow: "hidden", minHeight: 150, borderRadius: 25, padding: 17, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#0B2D7A", shadowOpacity: .2, shadowRadius: 17, shadowOffset: { width: 0, height: 9 }, elevation: 6 },
  summaryOrb: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.16)" },
  summaryCopy: { flex: 1, alignItems: "flex-start" },
  summaryKicker: { color: "rgba(255,255,255,.72)", fontSize: 9, fontWeight: "800" },
  summaryTitle: { color: "#FFFFFF", fontSize: 16, lineHeight: 25, fontWeight: "900", marginTop: 3, textAlign: "right", writingDirection: "rtl" },
  summaryBody: { color: "rgba(255,255,255,.78)", fontSize: 9, lineHeight: 16, marginTop: 4, textAlign: "right", writingDirection: "rtl" },
  readAll: { minHeight: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: "rgba(255,255,255,.28)", borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "rgba(255,255,255,.12)" },
  readAllText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  filters: { gap: 8, marginTop: 16, marginBottom: 13 },
  filter: { minHeight: 39, paddingHorizontal: 13, borderWidth: 1, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 7 },
  filterText: { fontSize: 10, fontWeight: "900" },
  filterCount: { minWidth: 23, height: 23, paddingHorizontal: 6, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  filterCountText: { fontSize: 8, fontWeight: "900" },
  group: { marginBottom: 13 },
  groupTitle: { fontSize: 9, fontWeight: "900", marginBottom: 7, textAlign: "right" },
  notice: { position: "relative", marginBottom: 8, alignItems: "flex-start", gap: 11, borderWidth: 1 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, alignItems: "flex-start" },
  titleRow: { width: "100%", alignItems: "center", gap: 7 },
  title: { flexShrink: 1, fontSize: 12, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  newLabel: { overflow: "hidden", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, fontSize: 7, fontWeight: "900" },
  body: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl", marginTop: 5 },
  meta: { width: "100%", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  date: { fontSize: 8 },
  actionLabel: { fontSize: 9, fontWeight: "900", textAlign: "right" },
  dot: { position: "absolute", top: 12, end: 12, width: 7, height: 7, borderRadius: 4 },
});
