import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { EmptyState } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

type RawSettings = Record<string, string | boolean | number | null | undefined>;
type PublicSettingsResponse = { ok?: true; settings?: RawSettings };
export type PlatformFeature = "registration" | "purchases" | "courseRequests" | "support" | "onboarding";
export const FIRST_RUN_ONBOARDING_KEY = "meras_first_run_onboarding_v2";

const settingKeys: Record<PlatformFeature, string> = {
  registration: "registration_enabled",
  purchases: "purchases_enabled",
  courseRequests: "course_requests_enabled",
  support: "support_enabled",
  onboarding: "onboarding_enabled",
};

function isEnabled(value: RawSettings[string]) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["false", "0", "off", "no", "disabled"].includes(value.trim().toLowerCase());
}

export function usePlatformControls() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<PublicSettingsResponse>("/api/public/settings"),
    staleTime: 30_000,
  });
  const settings = query.data?.settings || {};
  const availabilityMessage = query.isLoading
    ? "جارٍ التحقق من توفر الخدمة..."
    : query.isError
      ? "تعذر التحقق من إعدادات المنصة الآن. تحقق من اتصالك ثم أعد المحاولة."
      : "";
  return {
    loading: query.isLoading,
    error: query.isError ? availabilityMessage : "",
    ready: query.isSuccess,
    refresh: query.refetch,
    enabled: (feature: PlatformFeature) => {
      if (!query.isSuccess) return false;
      const value = settings[settingKeys[feature]];
      if (value === undefined || value === null || value === "") return false;
      return isEnabled(value);
    },
    maintenanceMessage: String(settings.maintenance_message || "").trim(),
    messageFor: (fallback: string) => availabilityMessage || String(settings.maintenance_message || "").trim() || fallback,
    settings,
  };
}

export function FeatureDisabledState({ title, message }: { title: string; message: string }) {
  return <EmptyState icon="pause-circle-outline" title={title} text={message} />;
}

export function FeatureDisabledNotice({ title, message }: { title: string; message: string }) {
  const { colors } = useTheme();
  return <View style={[styles.notice, { backgroundColor: `${colors.warning}14`, borderColor: `${colors.warning}55` }]}>
    <View style={[styles.noticeIcon, { backgroundColor: `${colors.warning}1F` }]}><Ionicons name="information-circle-outline" size={21} color={colors.warning} /></View>
    <View style={styles.noticeCopy}><Text style={[styles.noticeTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.noticeMessage, { color: colors.textSoft }]}>{message}</Text></View>
  </View>;
}

export function MaintenanceBanner() {
  const { colors } = useTheme();
  const { maintenanceMessage } = usePlatformControls();
  const [dismissedMessage, setDismissedMessage] = useState("");
  if (!maintenanceMessage || dismissedMessage === maintenanceMessage) return null;
  return <View pointerEvents="box-none" style={styles.layer}>
    <View style={[styles.banner, { backgroundColor: colors.warning }]}>
      <Ionicons name="construct-outline" size={19} color="#FFFFFF" />
      <View style={styles.copy}>
        <Text style={styles.title}>تنبيه من إدارة مراس</Text>
        <Text numberOfLines={3} style={styles.message}>{maintenanceMessage}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="إخفاء التنبيه" onPress={() => setDismissedMessage(maintenanceMessage)} hitSlop={10}>
        <Ionicons name="close" size={20} color="#FFFFFF" />
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { position: "absolute", top: 52, left: 12, right: 12, zIndex: 90 },
  banner: { minHeight: 64, borderRadius: 18, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 9, shadowColor: "#000", shadowOpacity: .16, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 9 },
  copy: { flex: 1, alignItems: "flex-end" },
  title: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  message: { color: "rgba(255,255,255,.9)", fontSize: 9, lineHeight: 16, marginTop: 2 },
  notice: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  noticeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  noticeCopy: { flex: 1, alignItems: "flex-end" }, noticeTitle: { fontSize: 10, fontWeight: "900" }, noticeMessage: { fontSize: 9, lineHeight: 16, marginTop: 3 },
});
