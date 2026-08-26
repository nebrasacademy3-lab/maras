import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BrandLogo, BrandMark } from "@/src/components/Brand";
import { AppButton, FadeIn, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";

export default function Welcome() {
  const { colors } = useTheme();
  return <Screen><LinearGradient colors={["#061B49", "#174EC2", "#7B3FF2"]} style={styles.hero}><View style={styles.orb} /><FadeIn><BrandMark size={96} whiteTile /></FadeIn><FadeIn delay={100}><Text style={styles.kicker}>منصتك الجامعية الذكية</Text><Text style={styles.title}>تعلّم مقررات جامعتك{`\n`}بطريقة أوضح وأعمق</Text><Text style={styles.copy}>جامعات وتخصصات ومواد ودروس منظمة، ومساعد مراس معك في كل خطوة.</Text></FadeIn></LinearGradient><FadeIn delay={180} style={styles.actions}><BrandLogo width={150} /><AppButton title="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/(auth)/login")} /><AppButton title="إنشاء حساب طالب" icon="person-add-outline" variant="soft" onPress={() => router.push("/(auth)/register")} /><AppButton title="تصفح المنصة كضيف" icon="compass-outline" variant="ghost" onPress={() => router.replace("/(tabs)")} /><Text style={[styles.legal, { color: colors.textSoft }]}>بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية.</Text></FadeIn></Screen>;
}

const styles = StyleSheet.create({ hero: { minHeight: 440, borderBottomLeftRadius: 42, borderBottomRightRadius: 42, marginHorizontal: -18, paddingHorizontal: 28, paddingTop: 50, alignItems: "center", overflow: "hidden" }, orb: { position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: "rgba(255,255,255,.08)", top: -220, right: -160 }, kicker: { color: "#BFD5FF", fontSize: 11, fontWeight: "800", textAlign: "center", marginTop: 28 }, title: { color: "#FFFFFF", fontSize: 31, lineHeight: 45, fontWeight: "900", textAlign: "center", writingDirection: "rtl", marginTop: 9 }, copy: { color: "#D9E5FF", fontSize: 13, lineHeight: 23, textAlign: "center", writingDirection: "rtl", marginTop: 12 }, actions: { alignItems: "center", gap: 10, marginTop: 22 }, legal: { fontSize: 9, textAlign: "center", marginTop: 4 },
});

