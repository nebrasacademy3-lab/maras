import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { AssistantFab } from "@/src/components/AssistantFab";
import { AnnouncementCampaign } from "@/src/components/AnnouncementCampaign";
import { usePushNotifications } from "@/src/hooks/usePushNotifications";
import { AppProviders } from "@/src/providers/AppProviders";
import { useReduceMotion } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";


function Runtime() {
  const { dark } = useTheme();
  const { isRTL } = useLanguage();
  const reduceMotion = useReduceMotion();
  usePushNotifications();
  return <><StatusBar style={dark ? "light" : "dark"} /><AnnouncementCampaign /><Stack screenOptions={{ headerShown: false, animation: reduceMotion ? "none" : isRTL ? "slide_from_left" : "slide_from_right", contentStyle: { backgroundColor: dark ? "#050B18" : "#F7F9FD" } }} /><AssistantFab /></>;
}

export default function RootLayout() { return <AppProviders><Runtime /></AppProviders>; }
