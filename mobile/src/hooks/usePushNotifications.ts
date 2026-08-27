import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }) });

export function usePushNotifications() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || !Device.isDevice) return;
    void (async () => {
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("updates", { name: "تحديثات مراس", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 180, 250], lightColor: "#155EEF" });
      const current = await Notifications.getPermissionsAsync();
      const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId) return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await api("/api/mobile/push", { method: "POST", body: jsonBody({ token, platform: Platform.OS, deviceLabel: Device.modelName || Device.deviceName || "جهاز مراس" }) });
    })().catch(() => undefined);
  }, [user]);
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route !== "string" || !route.startsWith("/")) return;
      if (route.startsWith("/learn/")) { const slug = decodeURIComponent(route.slice("/learn/".length)); if (slug) router.push({ pathname: "/course/[slug]", params: { slug } }); }
      else if (route === "/courses") router.push("/(tabs)/courses");
      else if (route === "/universities") router.push("/(tabs)/universities");
      else if (route === "/contact") router.push("/contact");
      else if (route === "/support") router.push("/support");
      else if (route === "/requests") router.push("/requests");
      else if (route === "/notifications") router.push("/notifications");
      else if (route === "/cart") router.push("/cart");
      else if (route === "/favorites") router.push("/favorites");
    });
    return () => subscription.remove();
  }, []);
}

