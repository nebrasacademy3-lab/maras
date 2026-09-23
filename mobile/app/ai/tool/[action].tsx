import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, EmptyState, Screen } from "@/src/components/ui";
import { StudyFileTools, type StudyAction } from "@/src/components/study-file-tools";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

const toolIntro: Record<StudyAction, { title: string; copy: string; icon: React.ComponentProps<typeof Ionicons>["name"]; outcome: string }> = {
  summary: { title: "ابدأ بملخص يوضح الصورة", copy: "اختر ملف المحاضرة، حدّد اللغة ومستوى التفصيل، ثم راجع الأفكار الأساسية في ملف PDF.", icon: "document-text-outline", outcome: "ملخص PDF" },
  translation: { title: "افهم المادة بلغتك", copy: "ارفع الملف وحدّد اللغة المطلوبة. تُحفظ المصطلحات والمعادلات في سياقها قدر الإمكان.", icon: "language-outline", outcome: "ترجمة PDF" },
  quiz: { title: "اختبر ما فهمته", copy: "حوّل ملف المحاضرة إلى أسئلة تفاعلية، ثم تعلّم من شرح كل إجابة.", icon: "help-circle-outline", outcome: "اختبار تفاعلي" },
};

export default function StudyToolScreen() {
  const { action } = useLocalSearchParams<{ action?: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { rowDirection } = useLanguage();
  const selected = action === "summary" || action === "translation" || action === "quiz" ? action : null;
  const intro = selected ? toolIntro[selected] : null;
  return <Screen keyboard>
    <AppHeader title={intro?.outcome || "أدوات مراس"} back />
    {!user ? <EmptyState icon="lock-closed-outline" title="سجّل الدخول أولًا" text="ملفاتك ونتائجك محفوظة لحسابك فقط." action={<AppButton title="تسجيل الدخول" onPress={() => router.replace("/(auth)/login")} />} /> : intro && selected ? <>
      <LinearGradient colors={[colors.hero, colors.heroEnd]} style={styles.hero}>
        <View style={[styles.heroBadge, { flexDirection: rowDirection }]}><Ionicons name={intro.icon} size={19} color="#EAD59F" /><Text style={styles.badgeText}>أدوات مراس الذكية</Text></View>
        <Text accessibilityRole="header" style={styles.title}>{intro.title}</Text>
        <Text style={styles.copy}>{intro.copy}</Text>
        <View style={[styles.steps, { flexDirection: rowDirection }]}>
          {["اختر المصدر", "اضبط النتيجة", "راجع واحفظ"].map((step, index) => <View key={step} style={[styles.step, { flexDirection: rowDirection }]}><View style={styles.stepDot}><Text style={styles.stepNumber}>{index + 1}</Text></View><Text style={styles.stepText}>{step}</Text></View>)}
        </View>
      </LinearGradient>
      <View style={styles.form}><StudyFileTools key={`${user.id}.${selected}`} action={selected} /></View>
    </> : <EmptyState icon="help-circle-outline" title="الأداة غير موجودة" text="ارجع واختر أداة من أدوات مراس." action={<AppButton title="كل الأدوات" onPress={() => router.replace("/(tabs)/ai")} />} />}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 27, padding: 23, gap: 12, overflow: "hidden", borderCurve: "continuous" },
  heroBadge: { alignItems: "center", gap: 8 }, badgeText: { color: "#EAD59F", fontSize: 12, fontWeight: "800" },
  title: { color: "#FFFFFF", fontSize: 27, lineHeight: 39, fontWeight: "900" },
  copy: { color: "#E3EDFA", fontSize: 13, lineHeight: 23 },
  steps: { flexWrap: "wrap", gap: 8, marginTop: 5 }, step: { alignItems: "center", gap: 6, minHeight: 33, borderRadius: 16, backgroundColor: "rgba(255,255,255,.12)", paddingHorizontal: 9 },
  stepDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#EAD59F", alignItems: "center", justifyContent: "center" }, stepNumber: { color: "#183B79", fontSize: 11, fontWeight: "900" }, stepText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  form: { marginTop: 18 },
});
