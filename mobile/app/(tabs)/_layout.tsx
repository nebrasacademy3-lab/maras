import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, type ColorValue } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";

function icon(name: React.ComponentProps<typeof Ionicons>["name"]) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name={name} color={color} size={size} />; };
}
export default function TabsLayout() {
  const { colors } = useTheme();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textSoft, tabBarStyle: { backgroundColor: colors.tab, borderTopColor: colors.border, height: Platform.OS === "ios" ? 88 : 70, paddingTop: 8 }, tabBarLabelStyle: { fontSize: 9, fontWeight: "800", paddingBottom: Platform.OS === "ios" ? 0 : 8 } }}><Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: icon("home-outline") }} /><Tabs.Screen name="universities" options={{ title: "الجامعات", tabBarIcon: icon("school-outline") }} /><Tabs.Screen name="courses" options={{ title: "المواد", tabBarIcon: icon("library-outline") }} /><Tabs.Screen name="learning" options={{ title: "موادي", tabBarIcon: icon("play-circle-outline") }} /><Tabs.Screen name="account" options={{ title: "حسابي", tabBarIcon: icon("person-circle-outline") }} /></Tabs>;
}
