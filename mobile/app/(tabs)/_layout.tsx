import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useWindowDimensions, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

function icon(name: React.ComponentProps<typeof Ionicons>["name"]) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name={name} color={color} size={size} />; };
}
export default function TabsLayout() {
  const { colors } = useTheme();
  const { direction, t } = useLanguage();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const barWidth = Math.min(700, width - Math.max(insets.left + insets.right, 0) - 16);
  return <Tabs screenOptions={{
    headerShown: false,
    sceneStyle: { direction },
    tabBarHideOnKeyboard: true,
    tabBarLabelPosition: "below-icon",
    tabBarActiveBackgroundColor: colors.surfaceAlt,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSoft,
    tabBarStyle: {
      direction,
      position: "absolute",
      alignSelf: "center",
      width: barWidth,
      left: (width - barWidth) / 2,
      right: undefined,
      maxWidth: "98%",
      bottom: Math.max(insets.bottom, 8),
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
    tabBarLabelStyle: { fontSize: width < 360 ? 9 : 10, lineHeight: 16, fontWeight: "800", paddingBottom: 0 },
  }}>
    <Tabs.Screen name="index" options={{ title: t("الرئيسية"), tabBarIcon: icon("home-outline") }} />
    <Tabs.Screen name="universities" options={{ title: t("الجامعات"), tabBarIcon: icon("school-outline") }} />
    <Tabs.Screen name="courses" options={{ title: t("المواد"), tabBarIcon: icon("library-outline") }} />
    <Tabs.Screen name="learning" options={{ title: t("موادي"), tabBarIcon: icon("play-circle-outline") }} />
    <Tabs.Screen name="ai" options={{ title: t("أدوات مراس"), tabBarIcon: icon("sparkles-outline") }} />
    <Tabs.Screen name="account" options={{ title: t("حسابي"), tabBarIcon: icon("person-circle-outline") }} />
  </Tabs>;
}
