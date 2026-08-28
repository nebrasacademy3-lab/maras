import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api, jsonBody } from "@/src/lib/api";
import { resolveNotificationRoute } from "@/src/lib/notificationRoute";
import { rememberExpoPushToken, startPushRegistration } from "@/src/lib/pushRegistration";
import { useAuth } from "@/src/providers/AuthProvider";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }) });

export function usePushNotifications() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || !Device.isDevice) return;
    const registration = startPushRegistration();
    void (async () => {
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("updates", { name: "تحديثات مراس", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 180, 250], lightColor: "#155EEF" });
      if (!registration.active()) return;
      const current = await Notifications.getPermissionsAsync();
      const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted" || !registration.active()) return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId) return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (!await rememberExpoPushToken(token, registration.active)) return;
      if (!registration.active()) return;
      await api("/api/mobile/push", { method: "POST", signal: registration.signal, body: jsonBody({ token, platform: Platform.OS, deviceLabel: Device.modelName || Device.deviceName || "جهاز مراس" }) });
    })().catch(() => undefined).finally(registration.finish);
    return registration.cancel;
  }, [user]);
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      const destination = resolveNotificationRoute(route);
      if (destination) router.push(destination);
    });
    return () => subscription.remove();
  }, []);
}
