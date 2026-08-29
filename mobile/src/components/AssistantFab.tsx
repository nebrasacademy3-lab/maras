import { Image } from "expo-image";
import { router, useSegments } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";

export function AssistantFab() {
  const segments = useSegments();
  const { dark, colors } = useTheme();
  const route = segments.join("/");
  if (route.includes("(auth)") || route.includes("assistant") || route.includes("lesson") || route.includes("admin")) return null;
  return <View pointerEvents="box-none" style={styles.layer}><Pressable accessibilityLabel="مساعد مراس" onPress={() => router.push("/assistant")} style={({ pressed }) => [styles.button, { backgroundColor: dark ? "#071127" : "#FFFFFF", borderColor: colors.border, transform: [{ scale: pressed ? .93 : 1 }] }]}><Image source={require("@/assets/brand-mark.png")} style={styles.mark} contentFit="contain" /></Pressable></View>;
}

const styles = StyleSheet.create({ layer: { position: "absolute", left: 18, bottom: 96, zIndex: 50 }, button: { width: 62, height: 62, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: .18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, mark: { width: 56, height: 56 } });
