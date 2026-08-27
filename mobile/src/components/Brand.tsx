import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";

export function BrandMark({ size = 58, whiteTile = false }: { size?: number; whiteTile?: boolean }) {
  return <View style={[styles.markTile, { width: size, height: size, borderRadius: size * .28 }, whiteTile && styles.whiteTile]}><Image source={require("@/assets/icon.png")} style={{ width: size, height: size, borderRadius: size * .28 }} contentFit="cover" /></View>;
}

export function BrandLogo({ width = 170 }: { width?: number }) {
  const { dark } = useTheme();
  return <Image source={dark ? require("@/assets/brand-logo-dark.png") : require("@/assets/brand-logo-light.png")} style={{ width, height: width * .58 }} contentFit="contain" />;
}

const styles = StyleSheet.create({
  markTile: { alignItems: "center", justifyContent: "center" },
  whiteTile: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: .08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
});
