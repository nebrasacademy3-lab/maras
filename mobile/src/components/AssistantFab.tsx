import { useQuery } from "@tanstack/react-query";
import { router, useSegments } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BrandMark } from "@/src/components/Brand";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { PublicSettings } from "@/src/types";

export function AssistantFab() {
  const segments = useSegments();
  const { dark, colors } = useTheme();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: PublicSettings }>("/api/public/settings"), staleTime: 5_000 });
  const route = segments.join("/");
  if (settings.data?.settings.assistant_enabled === "false" || route.includes("(auth)") || route.includes("assistant") || route.includes("lesson") || route.includes("admin")) return null;
  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable accessibilityLabel="مساعد مراس" onPress={() => router.push("/assistant")} style={({ pressed }) => [styles.button, { backgroundColor: dark ? "#071127" : "#FFFFFF", borderColor: colors.border, transform: [{ scale: pressed ? 0.93 : 1 }] }]}>
        <BrandMark size={50} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 18, bottom: 96, zIndex: 50 },
  button: { width: 64, height: 64, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
});
