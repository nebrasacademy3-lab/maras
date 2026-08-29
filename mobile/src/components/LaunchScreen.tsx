import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { BrandMark } from "@/src/components/Brand";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Screen } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";

export function LaunchScreen() {
  const { colors } = useTheme();
  const [entrance] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(.55));
  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: .55, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { entrance.stopAnimation(); loop.stop(); };
  }, [entrance, pulse]);
  return <Screen scroll={false} footer={false} padded={false}>
    <LinearGradient colors={[colors.background, colors.surfaceAlt, colors.background]} style={styles.page}>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: colors.primary }]} />
      <View style={[styles.orb, styles.orbBottom, { backgroundColor: colors.violet }]} />
      <Animated.View style={[styles.center, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [.92, 1] }) }] }]}>
        <View style={[styles.logoHalo, { backgroundColor: colors.surface, borderColor: colors.border }]}><BrandMark size={126} whiteTile /></View>
        <Text style={[styles.name, { color: colors.text }]}>مراس العلم</Text>
        <Text style={[styles.tagline, { color: colors.textSoft }]}>تعلّم بعمق، نصل أبعد</Text>
      </Animated.View>
      <View style={styles.footer}>
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><Animated.View style={[styles.fill, { backgroundColor: colors.primary, opacity: pulse, transform: [{ scaleX: pulse }] }]} /></View>
        <Text style={[styles.loading, { color: colors.textSoft }]}>نجهّز تجربتك التعليمية</Text>
      </View>
    </LinearGradient>
  </Screen>;
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 24 },
  orb: { position: "absolute", width: 330, height: 330, borderRadius: 165, opacity: .09 },
  orbTop: { top: -190, right: -120 },
  orbBottom: { bottom: -210, left: -130 },
  center: { alignItems: "center" },
  logoHalo: { width: 150, height: 150, borderRadius: 46, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowColor: "#061A42", shadowOpacity: .12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 5 },
  name: { fontSize: 29, fontWeight: "900", textAlign: "center", marginTop: 25 },
  tagline: { fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 6 },
  footer: { position: "absolute", bottom: 52, left: 24, right: 24, alignItems: "center", gap: 10 },
  track: { width: 124, height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { width: "72%", height: 5, borderRadius: 3, alignSelf: "center" },
  loading: { fontSize: 10, textAlign: "center" },
});
