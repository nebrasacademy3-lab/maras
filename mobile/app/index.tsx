import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { BrandMark } from "@/src/components/Brand";
import { Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

export default function Index() {
  const { user, loading } = useAuth();
  const { direction, rowDirection } = useLanguage();
  useEffect(() => { if (!loading) router.replace(user ? (user.profileCompleted ? (user.onboardingCompleted ? "/(tabs)" : "/onboarding") : "/complete-profile") : "/(auth)/welcome"); }, [loading, user]);
  return <Screen scroll={false} padded={false} showFooter={false}>
    <LinearGradient colors={["#03102F", "#0A4FC7", "#713EE8"]} start={{ x: .05, y: 0 }} end={{ x: .95, y: 1 }} style={[styles.launch, { direction }]}>
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />
      <View style={styles.markHalo}><BrandMark size={112} whiteTile /></View>
      <Text style={styles.brand}>مراس العلم</Text>
      <Text style={styles.tagline}>منصتك الجامعية الذكية</Text>
      <View style={[styles.loadingCard, { direction, flexDirection: rowDirection }]}>
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={styles.loadingText}>نجهّز تجربتك التعليمية...</Text>
      </View>
      <View style={styles.rail}><View style={styles.railFill} /></View>
      <View style={[styles.secure, { direction, flexDirection: rowDirection }]}><Ionicons name="shield-checkmark-outline" size={14} color="#CFE0FF" /><Text style={styles.secureText}>جلسة آمنة على هذا الجهاز</Text></View>
    </LinearGradient>
  </Screen>;
}

const styles = StyleSheet.create({
  launch: { flex: 1, width: "100%", overflow: "hidden", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  orbTop: { position: "absolute", width: 420, height: 420, borderRadius: 210, top: -245, end: -155, backgroundColor: "rgba(255,255,255,.08)" },
  orbBottom: { position: "absolute", width: 260, height: 260, borderRadius: 130, bottom: -145, start: -95, borderWidth: 1, borderColor: "rgba(255,255,255,.14)" },
  markHalo: { width: 142, height: 142, borderRadius: 45, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.08)", borderWidth: 1, borderColor: "rgba(255,255,255,.12)" },
  brand: { color: "#FFFFFF", fontSize: 27, fontWeight: "900", textAlign: "center", marginTop: 22 },
  tagline: { color: "#D9E6FF", fontSize: 11, fontWeight: "800", textAlign: "center", marginTop: 6 },
  loadingCard: { minHeight: 42, borderRadius: 21, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", gap: 9, marginTop: 34, backgroundColor: "rgba(255,255,255,.11)" },
  loadingText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", textAlign: "center" },
  rail: { width: 150, height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,.16)", marginTop: 15 },
  railFill: { width: "72%", height: "100%", borderRadius: 2, backgroundColor: "#FFFFFF" },
  secure: { position: "absolute", bottom: 34, alignItems: "center", justifyContent: "center", gap: 5 },
  secureText: { color: "#CFE0FF", fontSize: 8, fontWeight: "700" },
});
