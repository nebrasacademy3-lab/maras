import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { api, jsonBody } from "@/src/lib/api";
import { openInternalRoute } from "@/src/lib/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Notice } from "@/src/types";

export default function Notifications() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const query = useQuery({ queryKey: ["notifications", user?.id], queryFn: () => api<{ notifications: Notice[]; unreadCount?: number }>("/api/mobile/notifications"), enabled: Boolean(user) });
  const read = useMutation({ mutationFn: (payload: { id?: number; all?: boolean }) => api("/api/mobile/notifications", { method: "PATCH", body: jsonBody(payload) }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["notifications"] }); void client.invalidateQueries({ queryKey: ["dashboard"] }); } });

  const rows = query.data?.notifications || [];
  const unread = rows.filter((item) => !item.readAt).length;
  const visible = useMemo(() => filter === "unread" ? rows.filter((item) => !item.readAt) : rows, [filter, rows]);

  if (!user) return <Screen><AppHeader title="الإشعارات" back /><EmptyState title="سجّل الدخول" text="إشعارات الحساب والمواد والطلبات خاصة بك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (query.isLoading) return <Screen><LoadingState /></Screen>;

  return <Screen>
    <AppHeader title="الإشعارات" subtitle={`${unread} غير مقروء`} back unread={unread} />
    <Card style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}>
      <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}><Ionicons name="notifications-outline" size={25} color={colors.primary} /></View>
      <View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.text }]}>مركز تحديثاتك</Text><Text style={[styles.heroText, { color: colors.textSoft }]}>إشعارات المواد والدفع والطلبات والدعم في مكان واحد، وحالة القراءة خاصة بحسابك فقط.</Text></View>
    </Card>

    <View style={styles.toolbar}>
      <View style={styles.filters}>
        <Pressable onPress={() => setFilter("all")} style={[styles.filter, { backgroundColor: filter === "all" ? colors.primary : colors.surface, borderColor: filter === "all" ? colors.primary : colors.border }]}><Text style={{ color: filter === "all" ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>الكل ({rows.length})</Text></Pressable>
        <Pressable onPress={() => setFilter("unread")} style={[styles.filter, { backgroundColor: filter === "unread" ? colors.primary : colors.surface, borderColor: filter === "unread" ? colors.primary : colors.border }]}><Text style={{ color: filter === "unread" ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>غير المقروء ({unread})</Text></Pressable>
      </View>
      {unread > 0 ? <Pressable onPress={() => read.mutate({ all: true })} style={[styles.readAll, { borderColor: colors.border }]}><Ionicons name="checkmark-done-outline" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 9, fontWeight: "900" }}>قراءة الكل</Text></Pressable> : null}
    </View>

    {visible.length ? visible.map((item) => <Pressable key={item.id} onPress={() => { if (!item.readAt) read.mutate({ id: item.id }); if (item.actionUrl) openInternalRoute(item.actionUrl); }}>
      <Card style={[styles.notice, !item.readAt && { borderColor: colors.primary, borderWidth: 1.5 }]}>
        <View style={[styles.icon, { backgroundColor: !item.readAt ? `${colors.primary}18` : colors.surfaceAlt }]}><Ionicons name={!item.readAt ? "notifications" : "notifications-outline"} size={20} color={!item.readAt ? colors.primary : colors.textSoft} /></View>
        <View style={styles.copy}>
          <View style={styles.titleRow}><Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>{!item.readAt ? <View style={[styles.unreadBadge, { backgroundColor: `${colors.primary}16` }]}><Text style={{ color: colors.primary, fontSize: 7, fontWeight: "900" }}>جديد</Text></View> : null}</View>
          <Text style={[styles.body, { color: colors.textSoft }]}>{item.body}</Text>
          {item.actionUrl ? <View style={styles.actionRow}><Ionicons name="arrow-back" size={13} color={colors.primary} /><Text style={[styles.actionLabel, { color: colors.primary }]}>{item.actionLabel || "فتح التفاصيل"}</Text></View> : null}
          <Text style={[styles.date, { color: colors.textSoft }]}>{new Date(item.createdAt).toLocaleString("ar-SA")}</Text>
        </View>
      </Card>
    </Pressable>) : <EmptyState icon="notifications-off-outline" title={filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات"} text={filter === "unread" ? "كل إشعاراتك مقروءة حاليًا." : "ستصلك هنا تحديثات الشراء وطلبات المواد والدعم."} />}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 12 },
  heroIcon: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, alignItems: "flex-end" },
  heroTitle: { fontSize: 15, fontWeight: "900", textAlign: "right" },
  heroText: { fontSize: 9, lineHeight: 17, textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  toolbar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 },
  filters: { flex: 1, flexDirection: "row-reverse", gap: 7 },
  filter: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  readAll: { minHeight: 38, paddingHorizontal: 10, borderWidth: 1, borderRadius: 12, flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  notice: { marginBottom: 9, flexDirection: "row-reverse", alignItems: "flex-start", gap: 11 },
  icon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, alignItems: "flex-end" },
  titleRow: { width: "100%", flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  title: { flex: 1, fontSize: 12, fontWeight: "900", textAlign: "right" },
  unreadBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  body: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  date: { fontSize: 7, marginTop: 7 },
  actionRow: { flexDirection: "row-reverse", gap: 4, alignItems: "center", marginTop: 6 },
  actionLabel: { fontSize: 9, fontWeight: "900", textAlign: "right" },
});
