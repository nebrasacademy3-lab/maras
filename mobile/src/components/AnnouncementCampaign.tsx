import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { api } from "@/src/lib/api";
import { openInternalRoute } from "@/src/lib/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type Announcement = { id: number; title: string; body: string; actionUrl: string | null; actionLabel: string | null; presentation: "banner" | "modal" | "all"; dismissible: boolean };
const DISMISSED_KEY = "meras_dismissed_announcements";

export function AnnouncementCampaign() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  const [dismissalsReady, setDismissalsReady] = useState(false);

  useEffect(() => {
    void SecureStore.getItemAsync(DISMISSED_KEY).then((value) => {
      try {
        const parsed = JSON.parse(value || "[]");
        if (Array.isArray(parsed)) setDismissed(new Set(parsed.filter((item): item is number => Number.isSafeInteger(item)).slice(-100)));
      } catch { /* Ignore invalid local state. */ }
      setDismissalsReady(true);
    }).catch(() => setDismissalsReady(true));
  }, []);

  const query = useQuery({
    queryKey: ["announcements", user?.id || "guest"],
    queryFn: () => api<{ announcements: Announcement[] }>("/api/public/announcements"),
    staleTime: 5_000,
  });
  const rows = dismissalsReady ? (query.data?.announcements || []).filter((item) => !dismissed.has(item.id)) : [];
  const modal = rows.find((item) => item.presentation === "modal" || item.presentation === "all") || null;
  const banner = rows.find((item) => item.presentation === "banner" || item.presentation === "all");

  const close = (id: number) => {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(id);
      const compact = [...next].slice(-100);
      void SecureStore.setItemAsync(DISMISSED_KEY, JSON.stringify(compact)).catch(() => undefined);
      return new Set(compact);
    });
  };

  const action = (item: Announcement) => item.actionUrl ? (
    <Pressable style={[styles.action, { backgroundColor: colors.primary }]} onPress={() => { close(item.id); openInternalRoute(item.actionUrl); }}>
      <Text style={styles.actionText}>{item.actionLabel || "اعرف المزيد"}</Text>
      <Ionicons name="arrow-back" size={15} color="#FFF" />
    </Pressable>
  ) : null;

  return <>
    {banner && <View style={[styles.banner, { backgroundColor: colors.primary }]}>
      <Ionicons name="megaphone-outline" size={19} color="#FFF" />
      <View style={styles.bannerCopy}><Text style={styles.bannerTitle}>{banner.title}</Text><Text style={styles.bannerBody} numberOfLines={2}>{banner.body}</Text></View>
      {action(banner)}
      {banner.dismissible && <Pressable onPress={() => close(banner.id)} hitSlop={10}><Ionicons name="close" size={19} color="#FFF" /></Pressable>}
    </View>}
    {modal && <Modal visible transparent animationType="fade" onRequestClose={() => modal.dismissible && close(modal.id)}>
      <View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: colors.surface }]}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="megaphone" size={25} color={colors.primary} /></View>
        <Text style={[styles.kicker, { color: colors.primary }]}>إعلان من مراس</Text>
        <Text style={[styles.modalTitle, { color: colors.text }]}>{modal.title}</Text>
        <Text style={[styles.modalBody, { color: colors.textSoft }]}>{modal.body}</Text>
        {action(modal)}
        {modal.dismissible && <Pressable onPress={() => close(modal.id)} style={styles.later}><Text style={{ color: colors.textSoft, fontWeight: "800" }}>لاحقًا</Text></Pressable>}
      </View></View>
    </Modal>}
  </>;
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 12, marginTop: 8, padding: 12, borderRadius: 17, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  bannerCopy: { flex: 1, alignItems: "flex-end" },
  bannerTitle: { color: "#FFF", fontSize: 11, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  bannerBody: { color: "rgba(255,255,255,.82)", fontSize: 9, marginTop: 3, textAlign: "right", writingDirection: "rtl" },
  action: { minHeight: 34, borderRadius: 10, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 },
  actionText: { color: "#FFF", fontSize: 9, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(3,10,28,.62)", alignItems: "center", justifyContent: "center", padding: 22 },
  modal: { width: "100%", borderRadius: 25, padding: 22, alignItems: "flex-end", shadowColor: "#000", shadowOpacity: .2, shadowRadius: 20, elevation: 8 },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  kicker: { fontSize: 10, fontWeight: "900", marginTop: 15 },
  modalTitle: { fontSize: 21, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 5 },
  modalBody: { fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginTop: 10, marginBottom: 17 },
  later: { minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, alignSelf: "center" },
});
