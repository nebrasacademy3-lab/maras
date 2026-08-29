import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, Tabs } from "expo-router";
import React, { useEffect } from "react";
import { Platform, type ColorValue } from "react-native";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { PublicSettings } from "@/src/types";

function icon(name: React.ComponentProps<typeof Ionicons>["name"]) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name={name} color={color} size={size} />; };
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { user, loading } = useAuth();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: PublicSettings }>("/api/public/settings"), staleTime: 5_000 });
  const guestBlocked = !loading && !user && settings.data?.settings.guest_browsing_enabled === "false";

  useEffect(() => {
    if (guestBlocked) router.replace("/(auth)/welcome");
  }, [guestBlocked]);

  if (guestBlocked) return null;

  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textSoft, tabBarStyle: { backgroundColor: colors.tab, borderTopColor: colors.border, height: Platform.OS === "ios" ? 88 : 70, paddingTop: 8 }, tabBarLabelStyle: { fontSize: 9, fontWeight: "800", paddingBottom: Platform.OS === "ios" ? 0 : 8 } }}>
    <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: icon("home-outline") }} />
    <Tabs.Screen name="universities" options={{ title: "الجامعات", tabBarIcon: icon("school-outline") }} />
    <Tabs.Screen name="courses" options={{ title: "المواد", tabBarIcon: icon("library-outline") }} />
    <Tabs.Screen name="learning" options={{ title: "موادي", tabBarIcon: icon("play-circle-outline") }} />
    <Tabs.Screen name="account" options={{ title: "حسابي", tabBarIcon: icon("person-circle-outline") }} />
  </Tabs>;
}
