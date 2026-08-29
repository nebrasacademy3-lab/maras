import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";

export function BrandMark({ size = 58, whiteTile = false }: { size?: number; whiteTile?: boolean }) {
  const { dark } = useTheme();
  return (
    <View style={[styles.markTile, { width: size, height: size, borderRadius: size * 0.28 }, whiteTile && styles.whiteTile, dark && whiteTile && styles.darkTile]}>
      <Image
        source={dark ? require("@/assets/brand-mark-square-dark.png") : require("@/assets/brand-mark-square.png")}
        style={{ width: size * 0.9, height: size * 0.9 }}
        contentFit="contain"
      />
    </View>
  );
}

export function BrandLogo({ width = 170 }: { width?: number }) {
  const { dark } = useTheme();
  return (
    <Image
      source={dark ? require("@/assets/brand-logo-dark.png") : require("@/assets/brand-logo-light.png")}
      style={{ width, height: width * 0.58 }}
      contentFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  markTile: { alignItems: "center", justifyContent: "center" },
  whiteTile: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  darkTile: {
    backgroundColor: "#0B1532",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.08)",
  },
});
