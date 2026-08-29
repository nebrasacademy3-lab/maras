import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet, View } from "react-native";
import { BrandLogo, BrandMark } from "@/src/components/Brand";
import { AppButton, FadeIn, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

const benefits = [
  { icon: "school-outline" as const, title: "جامعات وتخصصات", text: "فهرس منظم" },
  { icon: "play-circle-outline" as const, title: "درس تجريبي", text: "قبل الاشتراك" },
  { icon: "sparkles-outline" as const, title: "مساعد مراس", text: "معك دائمًا" },
];

export default function Welcome() {
  const { colors } = useTheme();
  const { direction, rowDirection } = useLanguage();
  return <Screen showFooter={false}>
    <LinearGradient colors={["#04143D", "#0D58D7", "#7640EC"]} start={{ x: .1, y: 0 }} end={{ x: .9, y: 1 }} style={styles.hero}>
      <View style={styles.orbLarge} /><View style={styles.orbSmall} />
      <FadeIn><BrandMark size={102} whiteTile /></FadeIn>
      <FadeIn delay={90}><View style={styles.kicker}><Ionicons name="sparkles" size={13} color="#D7E5FF" /><Text style={styles.kickerText}>منصتك الجامعية الذكية</Text></View><Text style={styles.title}>تعلّم مقررات جامعتك{`\n`}بطريقة أوضح وأعمق</Text><Text style={styles.copy}>اكتشف المادة، شاهد المتاح مجانًا، ثم أكمل رحلتك من أي جهاز بحساب واحد.</Text></FadeIn>
      <FadeIn delay={160} style={[styles.benefits, { direction, flexDirection: rowDirection }]}>{benefits.map((item) => <View key={item.title} style={styles.benefit}><Ionicons name={item.icon} size={19} color="#FFF" /><Text style={styles.benefitTitle}>{item.title}</Text><Text style={styles.benefitText}>{item.text}</Text></View>)}</FadeIn>
    </LinearGradient>
    <FadeIn delay={220} style={styles.actions}>
      <BrandLogo width={164} />
      <View style={styles.actionCopy}><Text style={[styles.actionTitle, { color: colors.text }]}>ابدأ بطريقتك</Text><Text style={[styles.actionText, { color: colors.textSoft }]}>سجّل دخولك أو استكشف المنصة كضيف، ويمكنك إنشاء حساب عندما تكون جاهزًا.</Text></View>
      <AppButton title="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/(auth)/login")} />
      <AppButton title="إنشاء حساب طالب" icon="person-add-outline" variant="soft" onPress={() => router.push("/(auth)/register")} />
      <AppButton title="تصفح المنصة كضيف" icon="compass-outline" variant="ghost" onPress={() => router.replace("/(tabs)")} />
      <Text style={[styles.legal, { color: colors.textSoft }]}>بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية.</Text>
    </FadeIn>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 490, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, marginHorizontal: -18, paddingHorizontal: 24, paddingTop: 46, paddingBottom: 30, alignItems: "center", overflow: "hidden" },
  orbLarge: { position: "absolute", width: 430, height: 430, borderRadius: 215, backgroundColor: "rgba(255,255,255,.07)", top: -240, end: -150 },
  orbSmall: { position: "absolute", width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: "rgba(255,255,255,.12)", bottom: -60, start: -50 },
  kicker: { minHeight: 34, borderRadius: 17, paddingHorizontal: 13, marginTop: 22, backgroundColor: "rgba(255,255,255,.12)", flexDirection: "row", alignItems: "center", gap: 6 },
  kickerText: { color: "#D7E5FF", fontSize: 10, fontWeight: "900" },
  title: { color: "#FFFFFF", fontSize: 31, lineHeight: 44, fontWeight: "900", textAlign: "center", marginTop: 14 },
  copy: { maxWidth: 360, color: "#DDE8FF", fontSize: 12, lineHeight: 22, textAlign: "center", marginTop: 10 },
  benefits: { width: "100%", flexDirection: "row", gap: 8, marginTop: 24 },
  benefit: { flex: 1, minHeight: 92, borderRadius: 18, padding: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.10)", borderWidth: 1, borderColor: "rgba(255,255,255,.12)" },
  benefitTitle: { color: "#FFF", fontSize: 9, fontWeight: "900", textAlign: "center", marginTop: 6 },
  benefitText: { color: "rgba(255,255,255,.68)", fontSize: 8, textAlign: "center", marginTop: 2 },
  actions: { alignItems: "center", gap: 10, marginTop: 20, paddingBottom: 34 },
  actionCopy: { alignItems: "center", marginBottom: 3 },
  actionTitle: { fontSize: 17, fontWeight: "900", textAlign: "center" },
  actionText: { maxWidth: 340, fontSize: 10, lineHeight: 18, textAlign: "center", marginTop: 5 },
  legal: { fontSize: 8, textAlign: "center", marginTop: 4 },
});
