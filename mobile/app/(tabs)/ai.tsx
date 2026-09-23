import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, SUBSCRIPTION_ACCESS_MESSAGE } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

const tools = [
  { action: "summary", icon: "document-text-outline", title: "تلخيص الملف", text: "الأفكار الأساسية والمصطلحات في ملف PDF مرتب.", note: "افهم المحتوى أسرع", tint: "#CDECE6" },
  { action: "translation", icon: "language-outline", title: "ترجمة أكاديمية", text: "ترجمة دقيقة تحافظ على سياق المصطلحات والمعادلات.", note: "ادرس بلغتك", tint: "#E1DCFF" },
  { action: "quiz", icon: "help-circle-outline", title: "إنشاء الاختبارات", text: "أسئلة تفاعلية مع شرح الإجابات لتثبيت الفهم.", note: "اختبر استعدادك", tint: "#F8E6C8" },
] as const;

type AiStatus = { services: Record<string, { enabled: boolean; remaining: number }> };
type History = { conversations: { id: number; title: string; kind: string }[] };

export default function MerasAiScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { rowDirection, isRTL, t } = useLanguage();
  const { width } = useWindowDimensions();
  const status = useQuery({ queryKey: ["ai-status", user?.id], queryFn: ({ signal }) => api<AiStatus>("/api/ai/status", { signal }), enabled: Boolean(user) });
  const history = useQuery({ queryKey: ["ai-conversations", user?.id], queryFn: ({ signal }) => api<History>("/api/ai/conversations", { signal }), enabled: Boolean(user) });
  if (!user) return <Screen><AppHeader title="أدوات مراس" /><EmptyState icon="lock-closed-outline" title="سجّل الدخول أولًا" text="ملخصاتك وترجماتك واختباراتك محفوظة لحسابك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;

  const previous = history.data?.conversations.filter((row) => !row.kind.startsWith("lesson_tutor:")) || [];
  const cardWidth = width >= 1060 ? "31.7%" : width >= 700 ? "48.8%" : "100%";
  return <Screen>
    <AppHeader title="أدوات مراس" subtitle="مساحة واحدة لفهم أعمق" />
    <LinearGradient colors={[colors.hero, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View pointerEvents="none" style={styles.halo} />
      <View style={[styles.heroEyebrow, { flexDirection: rowDirection }]}><Ionicons name="sparkles" size={18} color="#EAD59F" /><Text style={styles.heroEyebrowText}>مساحة الدراسة الذكية</Text></View>
      <Text accessibilityRole="header" style={styles.heroTitle}>ملفك اليوم، فهمك غدًا.</Text>
      <Text style={styles.heroCopy}>اختر ما تحتاجه الآن، وارفع ملفك مرة واحدة. نتائجك محفوظة لتعود إليها وقت المذاكرة.</Text>
      <View style={[styles.heroFooter, { flexDirection: rowDirection }]}>
        <View style={styles.heroMiniIcon}><Ionicons name="school-outline" size={20} color="#EAD59F" /></View>
        <Text style={styles.heroFooterText}>داخل الدروس، يجيب المعلم الذكي من الملف المعتمد للمادة.</Text>
      </View>
    </LinearGradient>

    <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, flexDirection: rowDirection }]}>
      <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
      <Text selectable style={[styles.noticeText, { color: colors.textSoft }]}>{SUBSCRIPTION_ACCESS_MESSAGE}</Text>
    </View>

    <SectionTitle title="ماذا تريد أن تنجز؟" subtitle="ثلاث خطوات واضحة تختار منها ما يناسب جلستك" />
    {status.isLoading ? <LoadingState label="جارٍ تحميل أدواتك وحصصك…" /> : status.isError ? <EmptyState icon="cloud-offline-outline" title="تعذر تحميل حالة الأدوات" text={status.error.message} action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void status.refetch()} />} /> : <View style={[styles.grid, { flexDirection: rowDirection }]}>
      {tools.map((item, index) => {
        const service = status.data?.services[item.action];
        const enabled = Boolean(service?.enabled);
        return <Pressable key={item.action} accessibilityRole="button" accessibilityLabel={t(item.title)} accessibilityHint={enabled ? t("يفتح أداة " + item.title) : t("الأداة غير متاحة الآن")} accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={() => router.push({ pathname: "/ai/tool/[action]", params: { action: item.action } })} style={({ pressed }) => [styles.toolPress, { width: cardWidth, opacity: !enabled ? .6 : pressed ? .82 : 1 }]}>
          <Card style={[styles.toolCard, { minHeight: width >= 700 ? 264 : 220 }]}>
            <View style={[styles.toolTop, { flexDirection: rowDirection }]}>
              <View style={[styles.toolIcon, { backgroundColor: item.tint }]}><Ionicons name={item.icon} size={26} color="#183B79" /></View>
              <Text style={[styles.toolNumber, { color: colors.textSoft }]}>0{index + 1}</Text>
            </View>
            <Text style={[styles.toolNote, { color: colors.primary }]}>{item.note}</Text>
            <Text style={[styles.toolTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.toolText, { color: colors.textSoft }]}>{item.text}</Text>
            <View style={[styles.toolFooter, { flexDirection: rowDirection, borderColor: colors.border }]}>
              <Text style={[styles.toolAvailability, { color: enabled ? colors.primary : colors.textSoft }]}>{enabled ? `المتبقي هذا الشهر: ${Math.max(0, service?.remaining ?? 0)}` : "غير متاحة حاليًا"}</Text>
              <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={20} color={enabled ? colors.primary : colors.textSoft} />
            </View>
          </Card>
        </Pressable>;
      })}
    </View>}

    <SectionTitle title="واصل من نتائجك" subtitle="ملفاتك ومحادثاتك السابقة حين تحتاجها" />
    {history.isLoading ? <LoadingState label="جارٍ استعادة نتائجك…" /> : history.isError ? <View style={[styles.historyError, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text accessibilityRole="alert" style={[styles.historyErrorText, { color: colors.textSoft }]}>تعذر تحميل السجل، ويمكنك استخدام الأدوات الآن.</Text><AppButton title="إعادة المحاولة" variant="soft" onPress={() => void history.refetch()} /></View> : previous.length ? <View style={styles.historyList}>{previous.slice(0, 8).map((row) => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={t("فتح " + row.title)} onPress={() => router.push({ pathname: "/ai/conversation/[id]", params: { id: String(row.id) } })} style={({ pressed }) => [styles.historyItem, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border, flexDirection: rowDirection }]}><View style={[styles.historyIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="document-text-outline" size={20} color={colors.primary} /></View><Text numberOfLines={2} style={[styles.historyTitle, { color: colors.text }]}>{row.title}</Text><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={19} color={colors.primary} /></Pressable>)}</View> : <View style={[styles.historyEmpty, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="albums-outline" size={25} color={colors.primary} /><Text style={[styles.historyEmptyTitle, { color: colors.text }]}>هنا تبدأ مكتبة إنجازاتك</Text><Text style={[styles.historyEmptyText, { color: colors.textSoft }]}>عندما تُنجز أول ملخص أو ترجمة أو اختبار، ستجده هنا.</Text></View>}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 30, padding: 24, gap: 13, overflow: "hidden", borderCurve: "continuous" },
  halo: { position: "absolute", width: 250, height: 250, borderWidth: 1, borderColor: "rgba(255,255,255,.12)", borderRadius: 125, top: -105, end: -85 },
  heroEyebrow: { alignItems: "center", gap: 9 }, heroEyebrowText: { color: "#EAD59F", fontSize: 13, lineHeight: 22, fontWeight: "800" },
  heroTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 42, fontWeight: "900", maxWidth: 530 },
  heroCopy: { color: "#E6EDFA", fontSize: 14, lineHeight: 25, maxWidth: 580 },
  heroFooter: { borderTopWidth: 1, borderColor: "rgba(255,255,255,.18)", paddingTop: 16, alignItems: "center", gap: 11, marginTop: 5 },
  heroMiniIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,.12)", alignItems: "center", justifyContent: "center" },
  heroFooterText: { color: "#D6E3F7", fontSize: 12, lineHeight: 21, flex: 1 },
  notice: { borderWidth: 1, borderRadius: 16, marginTop: 16, padding: 13, gap: 10, alignItems: "flex-start" }, noticeText: { flex: 1, fontSize: 12, lineHeight: 21 },
  grid: { flexWrap: "wrap", justifyContent: "space-between", gap: 12 }, toolPress: { minWidth: 0 }, toolCard: { gap: 6, padding: 20, borderRadius: 23 },
  toolTop: { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }, toolIcon: { width: 52, height: 52, borderRadius: 17, justifyContent: "center", alignItems: "center" }, toolNumber: { fontSize: 24, fontWeight: "900", opacity: .55 },
  toolNote: { fontSize: 11, lineHeight: 18, fontWeight: "800" }, toolTitle: { fontSize: 19, lineHeight: 28, fontWeight: "900" }, toolText: { fontSize: 13, lineHeight: 22, flexGrow: 1 },
  toolFooter: { borderTopWidth: 1, marginTop: 9, paddingTop: 13, alignItems: "center", justifyContent: "space-between", gap: 8 }, toolAvailability: { fontSize: 12, lineHeight: 20, fontWeight: "800", flex: 1 },
  historyList: { gap: 9 }, historyItem: { borderWidth: 1, borderRadius: 18, minHeight: 68, padding: 11, alignItems: "center", gap: 12 }, historyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, historyTitle: { flex: 1, fontSize: 14, lineHeight: 23, fontWeight: "800" },
  historyEmpty: { borderWidth: 1, borderRadius: 21, padding: 25, alignItems: "center", gap: 7 }, historyEmptyTitle: { fontSize: 17, fontWeight: "800", textAlign: "center" }, historyEmptyText: { fontSize: 13, lineHeight: 22, textAlign: "center" },
  historyError: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 12 }, historyErrorText: { fontSize: 13, lineHeight: 22 },
});
