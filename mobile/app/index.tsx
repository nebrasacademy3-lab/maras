import { router } from "expo-router";
import React, { useEffect } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { BrandLogo, BrandMark } from "@/src/components/Brand";
import { HeroGradient, LoadingState, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";
import { StyleSheet, View } from "react-native";

export default function Index() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? (user.profileCompleted ? (user.onboardingCompleted ? "/(tabs)" : "/onboarding") : "/complete-profile") : "/(auth)/welcome");
    }
  }, [loading, user]);

  return (
    <Screen scroll={false} footer={false} style={styles.screen}>
      <HeroGradient>
        <View style={styles.heroContent}>
          <BrandMark size={102} whiteTile />
          <BrandLogo width={172} />
          <Text style={styles.title}>تجربة تعليمية مرتبة{`\n`}من أول لحظة</Text>
          <Text style={styles.copy}>نجهّز لك حسابك، موادك، وتحديثاتك مباشرة من مراس العلم.</Text>
        </View>
      </HeroGradient>
      <LoadingState label="جاري تجهيز التطبيق وربط بياناتك..." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", justifyContent: "center", gap: 18 },
  heroContent: { alignItems: "center", justifyContent: "center", gap: 12, minHeight: 280 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", textAlign: "center", writingDirection: "rtl", lineHeight: 40 },
  copy: { color: "#D9E5FF", fontSize: 12, textAlign: "center", writingDirection: "rtl", lineHeight: 22, maxWidth: 290 },
});
