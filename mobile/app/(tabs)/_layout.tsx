import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useWindowDimensions, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

function icon(name: React.ComponentProps<typeof Ionicons>["name"]) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name={name} color={color} size={size} />; };
}
export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { direction, t } = useLanguage();
  return <Tabs screenOptions={{
    headerShown: false,
    animation: reduceMotion ? "none" : "fade",
    sceneStyle: { direction },
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSoft,
    tabBarStyle: {
      direction,
      position: "absolute",
      alignSelf: "center",
      width: Math.min(650, Math.max(280, width - insets.left - insets.right - 16)),
      maxWidth: "98%",
      bottom: Math.max(10, insets.bottom),
      backgroundColor: colors.tab,
      borderTopColor: "transparent",
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 22,
      height: 68,
      paddingBottom: 7,
      paddingTop: 7,
      shadowColor: "#061A42",
      shadowOpacity: .13,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    tabBarItemStyle: { borderRadius: 15, marginHorizontal: 1 },
    tabBarLabelStyle: { fontSize: width < 360 ? 9 : 10, fontWeight: "800", paddingBottom: 2 },
  }}>
    <Tabs.Screen name="index" options={{ title: t("الرئيسية"), tabBarIcon: icon("home-outline") }} />
    <Tabs.Screen name="universities" options={{ title: t("الجامعات"), tabBarIcon: icon("school-outline") }} />
    <Tabs.Screen name="courses" options={{ title: t("المواد"), tabBarIcon: icon("library-outline") }} />
    <Tabs.Screen name="learning" options={{ title: t("موادي"), tabBarIcon: icon("play-circle-outline") }} />
    <Tabs.Screen name="ai" options={{ title: "أدوات مراس", tabBarIcon: icon("sparkles-outline") }} />
    <Tabs.Screen name="account" options={{ title: t("حسابي"), tabBarIcon: icon("person-circle-outline") }} />
  </Tabs>;
}
