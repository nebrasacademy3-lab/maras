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
  return <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textSoft, tabBarStyle: { position: "absolute", alignSelf: "center", width: Platform.OS === "web" ? 560 : undefined, maxWidth: "96%", bottom: Platform.OS === "ios" ? 14 : 10, backgroundColor: colors.tab, borderTopColor: "transparent", borderColor: colors.border, borderWidth: 1, borderRadius: 22, height: Platform.OS === "ios" ? 78 : 66, paddingTop: 7, shadowColor: "#061A42", shadowOpacity: .13, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }, tabBarItemStyle: { borderRadius: 16, marginHorizontal: 2 }, tabBarLabelStyle: { fontSize: 9, fontWeight: "800", paddingBottom: Platform.OS === "ios" ? 0 : 7 } }}><Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: icon("home-outline") }} /><Tabs.Screen name="universities" options={{ title: "الجامعات", tabBarIcon: icon("school-outline") }} /><Tabs.Screen name="courses" options={{ title: "المواد", tabBarIcon: icon("library-outline") }} /><Tabs.Screen name="learning" options={{ title: "موادي", tabBarIcon: icon("play-circle-outline") }} /><Tabs.Screen name="account" options={{ title: "حسابي", tabBarIcon: icon("person-circle-outline") }} /></Tabs>;
}
