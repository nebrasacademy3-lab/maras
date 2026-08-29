import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet, View } from "react-native";
import { BrandLogo, BrandMark } from "@/src/components/Brand";
import { AppButton, Card, FadeIn, Screen } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { PublicSettings } from "@/src/types";

const highlights = [
  { icon: "school-outline" as const, title: "جامعات وتخصصات", text: "واجهة عربية مرتبة حسب الجامعة والتخصص والمواد." },
  { icon: "play-circle-outline" as const, title: "مشاهدة سلسة", text: "حفظ التقدم ومزامنة بين الويب والتطبيق بشكل تلقائي." },
  { icon: "shield-checkmark-outline" as const, title: "إدارة مترابطة", text: "المواد والإعلانات والطلبات والإشعارات تدار من مكان واحد." },
];

export default function Welcome() {
  const { colors } = useTheme();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => api<{ ok: true; settings: PublicSettings }>("/api/public/settings"), staleTime: 5_000 });
  const settings = settingsQuery.data?.settings;
  const guestEnabled = settings?.guest_browsing_enabled !== "false";
  const registrationEnabled = settings?.student_registration_enabled !== "false";
  const title = settings?.mobile_welcome_title || "كل شيء أوضح، أرتب، وأقرب لك";
  const subtitle = settings?.mobile_welcome_subtitle || "تجربة عربية من اليمين لليسار، مواد منظّمة، بحث أسهل، وخدمات مراس معك في كل خطوة.";

  return (
    <Screen footer={false}>
      <LinearGradient colors={["#061B49", "#174EC2", "#7B3FF2"]} style={styles.hero}>
        <View style={styles.orb} />
        <FadeIn>
          <View style={styles.brandWrap}>
            <BrandMark size={98} whiteTile />
            <BrandLogo width={165} />
          </View>
        </FadeIn>
        <FadeIn delay={80}>
          <Text style={styles.kicker}>منصتك الجامعية الذكية</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.copy}>{subtitle}</Text>
        </FadeIn>
      </LinearGradient>

      <FadeIn delay={150} style={styles.actions}>
        <View style={styles.grid}>
          {highlights.map((item) => (
            <Card key={item.title} style={styles.featureCard}>
              <Ionicons name={item.icon} size={24} color={colors.primary} />
              <Text style={[styles.featureTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.featureCopy, { color: colors.textSoft }]}>{item.text}</Text>
            </Card>
          ))}
        </View>
        <AppButton title="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/(auth)/login")} />
        {registrationEnabled ? <AppButton title="إنشاء حساب طالب" icon="person-add-outline" variant="soft" onPress={() => router.push("/(auth)/register")} /> : null}
        {guestEnabled ? <AppButton title="تصفح المنصة كضيف" icon="compass-outline" variant="ghost" onPress={() => router.replace("/(tabs)")} /> : null}
        <Text style={[styles.legal, { color: colors.textSoft }]}>بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية.</Text>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 430, borderBottomLeftRadius: 42, borderBottomRightRadius: 42, marginHorizontal: -18, paddingHorizontal: 28, paddingTop: 44, alignItems: "center", overflow: "hidden" },
  orb: { position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: "rgba(255,255,255,.08)", top: -220, right: -160 },
  brandWrap: { alignItems: "center", gap: 12 },
  kicker: { color: "#BFD5FF", fontSize: 11, fontWeight: "800", textAlign: "center", marginTop: 18 },
  title: { color: "#FFFFFF", fontSize: 31, lineHeight: 45, fontWeight: "900", textAlign: "center", writingDirection: "rtl", marginTop: 9, maxWidth: 330 },
  copy: { color: "#D9E5FF", fontSize: 13, lineHeight: 23, textAlign: "center", writingDirection: "rtl", marginTop: 12, maxWidth: 310 },
  actions: { alignItems: "center", gap: 10, marginTop: 22 },
  grid: { width: "100%", gap: 10, marginBottom: 6 },
  featureCard: { alignItems: "flex-end", gap: 8 },
  featureTitle: { fontSize: 13, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  featureCopy: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl" },
  legal: { fontSize: 9, textAlign: "center", marginTop: 4 },
});
