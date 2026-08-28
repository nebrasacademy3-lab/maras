import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { I18nManager } from "react-native";
import { AssistantFab } from "@/src/components/AssistantFab";
import { AnnouncementCampaign } from "@/src/components/AnnouncementCampaign";
import { usePushNotifications } from "@/src/hooks/usePushNotifications";
import { AppProviders } from "@/src/providers/AppProviders";
import { useTheme } from "@/src/providers/ThemeProvider";
import { MaintenanceBanner } from "@/src/components/PlatformControls";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

function Runtime() {
  const { dark } = useTheme();
  usePushNotifications();
  return <><StatusBar style={dark ? "light" : "dark"} /><Stack screenOptions={{ headerShown: false, animation: "slide_from_left", contentStyle: { backgroundColor: dark ? "#050B18" : "#F7F9FD" } }} /><MaintenanceBanner /><AnnouncementCampaign /><AssistantFab /></>;
}

export default function RootLayout() { return <AppProviders><Runtime /></AppProviders>; }
