import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { clearNativeNotificationBadge } from "@/src/hooks/usePushNotifications";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { Notice } from "@/src/types";
import { openNotificationRoute } from "@/src/lib/notification-routing";

type NotificationsPayload = { notifications: Notice[]; unreadCount?: number };

export default function Notifications() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { locale } = useLanguage();
  const client = useQueryClient();
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
    mutationFn: (payload: { id?: number; all?: boolean }) => api<{ unreadCount?: number }>("/api/mobile/notifications", { method: "PATCH", body: jsonBody(payload) }),
    onMutate: async (payload) => {
      updateLocalReadState(payload.all ? undefined : payload.id);
      if (payload.all) await clearNativeNotificationBadge();
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["notifications"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  // A short grace period lets the user see which items were new, then opening the inbox
  // itself counts as reading it. The explicit button remains available for immediate use.
  useFocusEffect(useCallback(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      const rows = client.getQueryData<NotificationsPayload>(queryKey)?.notifications || [];
      if (rows.some((item) => !item.readAt)) markRead({ all: true });
      else void clearNativeNotificationBadge();
    }, 900);
    return () => clearTimeout(timer);
  }, [client, markRead, queryKey, user]));

  if (!user) return <Screen><AppHeader title="الإشعارات" back /><EmptyState title="سجّل الدخول" text="إشعارات الحساب والمواد والطلبات خاصة بك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (query.isLoading) return <Screen><LoadingState /></Screen>;

  const rows = query.data?.notifications || [];
  const unread = rows.filter((item) => !item.readAt).length;

  return <Screen>
    <AppHeader title="الإشعارات" subtitle={unread ? `${unread} غير مقروء` : "كل الإشعارات مقروءة"} back unread={unread} />
    <View style={styles.toolbar}>
      <AppButton
        title="قراءة الكل"
        variant="soft"
        icon="checkmark-done-outline"
        disabled={unread === 0 || readPending}
        loading={readPending && unread > 0}
        onPress={() => markRead({ all: true })}
      />
    </View>
    {rows.length ? rows.map((item) => <Pressable key={item.id} onPress={() => {
      if (!item.readAt) markRead({ id: item.id });
      openNotificationRoute(item.actionUrl);
    }}>
      <Card style={[styles.notice, !item.readAt && { borderColor: colors.primary }]}>
        <View style={[styles.icon, { backgroundColor: !item.readAt ? `${colors.primary}18` : colors.surfaceAlt }]}><Ionicons name={!item.readAt ? "notifications" : "notifications-outline"} size={20} color={!item.readAt ? colors.primary : colors.textSoft} /></View>
        <View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>{item.title}</Text><Text style={[styles.body, { color: colors.textSoft }]}>{item.body}</Text>{item.actionUrl && <Text style={[styles.actionLabel, { color: colors.primary }]}>{item.actionLabel || "فتح التفاصيل"}  ›</Text>}<Text style={[styles.date, { color: colors.textSoft }]}>{new Date(item.createdAt).toLocaleString(locale)}</Text></View>
        {!item.readAt && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
      </Card>
    </Pressable>) : <EmptyState icon="notifications-off-outline" title="لا توجد إشعارات" text="ستصلك هنا تحديثات الشراء وطلبات المواد والدعم." />}
  </Screen>;
}

const styles = StyleSheet.create({
  toolbar: { marginBottom: 12, alignItems: "flex-start" },
  notice: { marginBottom: 9, flexDirection: "row", alignItems: "flex-start", gap: 11 },
  icon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, alignItems: "flex-start" },
  title: { fontSize: 12, fontWeight: "900", textAlign: "right" },
  body: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  date: { fontSize: 7, marginTop: 7 },
  actionLabel: { fontSize: 9, fontWeight: "900", marginTop: 6, textAlign: "right" },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
});
