import { useAuth } from "@/src/providers/AuthProvider";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, Redirect, type Href } from "expo-router";
import React from "react";
import { useWindowDimensions, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

function icon(outline: React.ComponentProps<typeof Ionicons>["name"], filled: React.ComponentProps<typeof Ionicons>["name"]) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? filled : outline} color={color} size={focused ? 23 : 22} />;
  };
}

export default function TabsLayout() {
  const { colors, dark } = useTheme();
  const { user } = useAuth();
  const { direction, t } = useLanguage();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const barWidth = Math.min(610, width - Math.max(insets.left + insets.right, 0) - 20);
  if (user?.role === "instructor") return <Redirect href={"/instructor" as Href} />;
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
      right: (width - barWidth) / 2,
      bottom: Math.max(insets.bottom, 10),
      height: width < 360 ? 70 : 74,
      backgroundColor: colors.tab,
      borderTopColor: "transparent",
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 27,
      paddingBottom: 7,
      paddingTop: 7,
      shadowColor: colors.shadow,
      shadowOpacity: dark ? .27 : .13,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    tabBarItemStyle: { borderRadius: 19, marginHorizontal: 2 },
    tabBarIconStyle: { marginTop: 1 },
    tabBarLabelStyle: { fontSize: width < 360 ? 10 : 11, lineHeight: 15, fontWeight: "800" },
  }}>
    <Tabs.Screen name="index" options={{ title: t("الرئيسية"), tabBarIcon: icon("home-outline", "home") }} />
    <Tabs.Screen name="courses" options={{ title: t("المواد"), tabBarIcon: icon("library-outline", "library") }} />
    <Tabs.Screen name="learning" options={{ title: t("موادي"), tabBarIcon: icon("play-circle-outline", "play-circle") }} />
    <Tabs.Screen name="ai" options={{ title: t("أدوات مراس"), tabBarLabel: t("الأدوات"), tabBarIcon: icon("sparkles-outline", "sparkles") }} />
    <Tabs.Screen name="account" options={{ title: t("حسابي"), tabBarIcon: icon("person-circle-outline", "person-circle") }} />
    <Tabs.Screen name="universities" options={{ href: null }} />
  </Tabs>;
}
