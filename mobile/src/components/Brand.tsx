import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { useTheme } from "@/src/providers/ThemeProvider";

export function BrandMark({ size = 58, whiteTile = false }: { size?: number; whiteTile?: boolean }) {
  const { dark } = useTheme();
  const source = dark && !whiteTile ? require("@/assets/brand-mark-dark.png") : require("@/assets/brand-mark.png");
  return <View style={[styles.markTile, { width: size, height: size, borderRadius: size * .28 }, whiteTile && styles.whiteTile]}><Image source={source} style={{ width: size, height: size }} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} /></View>;
}

export function BrandLogo({ width = 170 }: { width?: number }) {
  const { dark, colors } = useTheme();
  return <View accessibilityRole="image" accessibilityLabel="مراس العلم" style={[styles.logo, { width, minHeight: width * .58 }]}>
    <Image source={dark ? require("@/assets/brand-mark-dark.png") : require("@/assets/brand-mark.png")} style={{ width: width * .74, height: width * .37 }} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} />
    <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.logoWord, { color: dark ? "#F7F9FF" : colors.primary, fontSize: width * .13, lineHeight: width * .16 }]}>مراس العلم</Text>
  </View>;
}

const styles = StyleSheet.create({
  markTile: { alignItems: "center", justifyContent: "center" },
  whiteTile: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: .08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3, padding: 3 },
  logo: { alignItems: "center", justifyContent: "center" },
  logoWord: { marginTop: -2, fontWeight: "900", textAlign: "center", writingDirection: "rtl" },
});
