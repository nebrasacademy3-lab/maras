import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, type ColorValue } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

function icon(name: React.ComponentProps<typeof Ionicons>["name"]) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name={name} color={color} size={size} />; };
}
export default function TabsLayout() {
  const { colors } = useTheme();
  const { direction, t } = useLanguage();
  return <Tabs screenOptions={{
    headerShown: false,
    sceneStyle: { direction },
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSoft,
    tabBarStyle: {
      direction,
      position: "absolute",
      alignSelf: "center",
      width: Platform.OS === "web" ? 650 : undefined,
      maxWidth: "98%",
      bottom: Platform.OS === "ios" ? 14 : 10,
      backgroundColor: colors.tab,
      borderTopColor: "transparent",
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 22,
      height: Platform.OS === "ios" ? 78 : 68,
      paddingTop: 7,
      shadowColor: "#061A42",
      shadowOpacity: .13,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    tabBarItemStyle: { borderRadius: 15, marginHorizontal: 1 },
    tabBarLabelStyle: { fontSize: 8, fontWeight: "800", paddingBottom: Platform.OS === "ios" ? 0 : 7 },
  }}>
    <Tabs.Screen name="index" options={{ title: t("الرئيسية"), tabBarIcon: icon("home-outline") }} />
    <Tabs.Screen name="universities" options={{ title: t("الجامعات"), tabBarIcon: icon("school-outline") }} />
    <Tabs.Screen name="courses" options={{ title: t("المواد"), tabBarIcon: icon("library-outline") }} />
    <Tabs.Screen name="learning" options={{ title: t("موادي"), tabBarIcon: icon("play-circle-outline") }} />
    <Tabs.Screen name="ai" options={{ title: "مراس AI", tabBarIcon: icon("sparkles-outline") }} />
    <Tabs.Screen name="account" options={{ title: t("حسابي"), tabBarIcon: icon("person-circle-outline") }} />
  </Tabs>;
}
