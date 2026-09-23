import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BrandMark } from "@/src/components/Brand";
import { AppButton, FadeIn, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useAuth } from "@/src/providers/AuthProvider";

const benefits = [
  { icon: "school-outline" as const, title: "جامعات وتخصصات" },
  { icon: "play-circle-outline" as const, title: "درس تجريبي" },
  { icon: "sparkles-outline" as const, title: "مساعد مراس" },
];

export default function Welcome() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { direction, rowDirection } = useLanguage();
  const { width } = useWindowDimensions();
  const wide = width >= 780;
  return <Screen showFooter={false}>
    <View style={[styles.layout, { direction, flexDirection: wide ? rowDirection : "column" }]}>
      <LinearGradient colors={[colors.hero, colors.heroEnd, "#3157AA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, wide && styles.heroWide]}>
        <View style={styles.orbLarge} /><View style={styles.orbSmall} />
        <FadeIn style={[styles.brandRow, { flexDirection: rowDirection }]}><BrandMark size={70} whiteTile /><Text style={styles.brandName}>مراس العلم</Text></FadeIn>
        <FadeIn delay={90}><View style={[styles.kicker, { flexDirection: rowDirection }]}><Ionicons name="sparkles" size={15} color="#D7E5FF" /><Text style={styles.kickerText}>منصتك الجامعية الذكية</Text></View><Text accessibilityRole="header" style={styles.title}>تعلّم مقررات جامعتك بطريقة أوضح وأعمق</Text><Text style={styles.copy}>اكتشف المادة، شاهد المتاح مجانًا، ثم أكمل رحلتك من أي جهاز بحساب واحد.</Text></FadeIn>
        <FadeIn delay={150} style={[styles.benefits, { direction, flexDirection: rowDirection }]}>{benefits.map((item) => <View key={item.title} style={[styles.benefit, { flexDirection: rowDirection }]}><Ionicons name={item.icon} size={18} color="#FFFFFF" /><Text style={styles.benefitTitle}>{item.title}</Text></View>)}</FadeIn>
      </LinearGradient>
      <FadeIn delay={200} style={[styles.actions, wide && styles.actionsWide]}>
        <View style={styles.actionCopy}><Text style={[styles.actionEyebrow, { color: colors.primary }]}>تجربتك تبدأ الآن</Text><Text accessibilityRole="header" style={[styles.actionTitle, { color: colors.text }]}>ابدأ بطريقتك</Text><Text style={[styles.actionText, { color: colors.textSoft }]}>سجّل دخولك أو استكشف المنصة كضيف. أنشئ حسابك عندما تكون جاهزًا.</Text></View>
        <AppButton title="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/(auth)/login")} />
        <AppButton title="إنشاء حساب طالب" icon="person-add-outline" variant="soft" onPress={() => router.push("/(auth)/register")} />
        <View style={[styles.secondaryActions, { borderTopColor: colors.border }]}>
          <AppButton title="تصفح المنصة كضيف" icon="compass-outline" variant="ghost" onPress={() => router.replace("/(tabs)")} />
          {!user && <AppButton title="انضم لفريق مراس كشارح" icon="school-outline" variant="ghost" onPress={() => router.push("/instructor" as Href)} />}
        </View>
        <Text style={[styles.legal, { color: colors.textSoft }]}>بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية.</Text>
      </FadeIn>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  layout: { gap: 22, alignItems: "stretch", paddingTop: 8, paddingBottom: 26 },
  hero: { minHeight: 390, borderRadius: 30, paddingHorizontal: 23, paddingTop: 26, paddingBottom: 26, overflow: "hidden", justifyContent: "center" },
  heroWide: { width: "54%", minHeight: 620, paddingHorizontal: 38, paddingVertical: 38 },
  orbLarge: { position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: "rgba(255,255,255,.07)", top: -245, right: -145 },
  orbSmall: { position: "absolute", width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: "rgba(255,255,255,.16)", bottom: -84, left: -48 },
  brandRow: { alignItems: "center", gap: 12 },
  brandName: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  kicker: { alignSelf: "flex-start", minHeight: 34, borderRadius: 17, paddingHorizontal: 12, marginTop: 23, backgroundColor: "rgba(255,255,255,.14)", alignItems: "center", gap: 7 },
  kickerText: { color: "#D7E5FF", fontSize: 12, fontWeight: "800" },
  title: { color: "#FFFFFF", fontSize: 30, lineHeight: 42, fontWeight: "900", marginTop: 14, maxWidth: 530 },
  copy: { maxWidth: 520, color: "#E1E9FF", fontSize: 14, lineHeight: 24, marginTop: 12 },
  benefits: { flexWrap: "wrap", gap: 7, marginTop: 21 },
  benefit: { minHeight: 40, borderRadius: 14, paddingHorizontal: 10, alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,.12)", borderWidth: 1, borderColor: "rgba(255,255,255,.16)" },
  benefitTitle: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  actions: { gap: 10, justifyContent: "center" },
  actionsWide: { flex: 1, minWidth: 0, paddingHorizontal: 16 },
  actionCopy: { marginBottom: 13 },
  actionEyebrow: { fontSize: 12, fontWeight: "900", marginBottom: 7 },
  actionTitle: { fontSize: 26, lineHeight: 36, fontWeight: "900" },
  actionText: { maxWidth: 420, fontSize: 14, lineHeight: 24, marginTop: 6 },
  secondaryActions: { gap: 4, borderTopWidth: 1, marginTop: 7, paddingTop: 14 },
  legal: { fontSize: 11, lineHeight: 19, textAlign: "center", marginTop: 4 },
});
