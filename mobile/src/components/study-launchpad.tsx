import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

const actions = [
  { action: "summary", icon: "document-text-outline", title: "لخّص ملفك", text: "استخرج أهم الأفكار في PDF منظّم.", tint: "#CDECE6" },
  { action: "translation", icon: "language-outline", title: "ترجم وافهم", text: "المصطلحات والمعادلات في سياقها.", tint: "#E1DCFF" },
  { action: "quiz", icon: "checkmark-circle-outline", title: "اختبر فهمك", text: "راجع ما تعلمته بأسئلة تفاعلية.", tint: "#F8E6C8" },
] as const;

export function StudyLaunchpad() {
  const { colors } = useTheme();
  const { direction, rowDirection, isRTL, t } = useLanguage();
  const { width } = useWindowDimensions();
  const columns = width >= 760;
  return <View style={[styles.panel, { direction, borderColor: colors.border, backgroundColor: colors.surface }]}>
    <View style={[styles.head, { flexDirection: rowDirection }]}>
      <View style={[styles.mark, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="sparkles-outline" size={23} color={colors.primary} /></View>
      <View style={styles.copy}><Text style={[styles.eyebrow, { color: colors.primary }]}>مراس الذكية</Text><Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>ما الذي تريد إنجازه اليوم؟</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("كل أدوات مراس")} onPress={() => router.push("/(tabs)/ai")} style={({ pressed }) => [styles.more, { backgroundColor: pressed ? colors.surfaceAlt : colors.background, borderColor: colors.border }]}><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={21} color={colors.primary} /></Pressable>
    </View>
    <Text style={[styles.intro, { color: colors.textSoft }]}>من ملف المحاضرة إلى فهم أوضح، اختر خطوتك التالية.</Text>
    <View style={[styles.grid, { flexDirection: rowDirection }]}>
      {actions.map((item) => <Pressable key={item.action} accessibilityRole="button" accessibilityLabel={t(item.title)} accessibilityHint={t(item.text)} onPress={() => router.push({ pathname: "/ai/tool/[action]", params: { action: item.action } })} style={({ pressed }) => [styles.action, { width: columns ? "31.8%" : "100%", flexDirection: columns ? "column" : rowDirection, backgroundColor: pressed ? colors.surfaceAlt : colors.background, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: item.tint }]}><Ionicons name={item.icon} size={23} color="#183B79" /></View>
        <View style={styles.actionCopy}><Text style={[styles.title, { color: colors.text }]}>{item.title}</Text><Text style={[styles.detail, { color: colors.textSoft }]}>{item.text}</Text></View>
        <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={18} color={colors.primary} />
      </Pressable>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: 25, borderWidth: 1, padding: 18, marginTop: 22, gap: 15, borderCurve: "continuous" },
  head: { alignItems: "center", gap: 12 }, mark: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 2 }, eyebrow: { fontSize: 11, lineHeight: 19, fontWeight: "800" }, heading: { fontSize: 19, lineHeight: 29, fontWeight: "900" },
  more: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  intro: { fontSize: 13, lineHeight: 23 },
  grid: { flexWrap: "wrap", justifyContent: "space-between", gap: 9 },
  action: { minHeight: 91, borderWidth: 1, borderRadius: 17, alignItems: "center", padding: 13, gap: 12, borderCurve: "continuous" },
  icon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1, gap: 3, minWidth: 0 }, title: { fontSize: 14, lineHeight: 22, fontWeight: "800" }, detail: { fontSize: 12, lineHeight: 20 },
});
