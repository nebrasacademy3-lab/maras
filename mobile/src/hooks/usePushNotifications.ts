import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { openNotificationRoute } from "@/src/lib/notification-routing";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function clearNativeNotificationBadge() {
  await Promise.allSettled([
    Notifications.setBadgeCountAsync(0),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}

export async function setNativeNotificationBadge(count: number) {
  await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
}

export function usePushNotifications() {
  const { user } = useAuth();
  const client = useQueryClient();

  const refreshNotificationState = useCallback(async () => {
    if (!user) {
      await clearNativeNotificationBadge();
      return;
    }
    try {
      const payload = await api<{ unreadCount?: number; notifications?: { readAt: string | null }[] }>("/api/mobile/notifications");
      const unread = typeof payload.unreadCount === "number"
        ? payload.unreadCount
        : (payload.notifications || []).filter((item) => !item.readAt).length;
      await Notifications.setBadgeCountAsync(Math.max(0, unread));
      await client.invalidateQueries({ queryKey: ["notifications"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      // Keep the current badge when the device is temporarily offline.
    }
  }, [client, user]);

  useEffect(() => {
    if (!user || !Device.isDevice) return;
    let active = true;
    void (async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("updates", {
          name: "تحديثات مراس",
          description: "إشعارات المواد والدعم والطلبات والحساب",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 180, 250],
          lightColor: "#155EEF",
          sound: "default",
          showBadge: true,
        });
      }
      const current = await Notifications.getPermissionsAsync();
      const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
      if (!active || permission.status !== "granted") return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId) throw new Error("EAS projectId is missing from app configuration");
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (!active) return;
      await api("/api/mobile/push", {
        method: "POST",
        body: jsonBody({ token, platform: Platform.OS, deviceLabel: Device.modelName || Device.deviceName || "جهاز مراس" }),
      });
      await refreshNotificationState();
    })().catch((error) => {
      if (__DEV__) console.warn("Push registration failed", error);
    });
    return () => { active = false; };
  }, [refreshNotificationState, user]);

  useEffect(() => {
    if (!user) return;
    let lastHandledIdentifier = "";
    const handleResponse = (event: Notifications.NotificationResponse) => {
      const identifier = event.notification.request.identifier;
      if (identifier && identifier === lastHandledIdentifier) return;
      lastHandledIdentifier = identifier;
      const data = event.notification.request.content.data || {};
      const notificationId = Number(data.notificationId || 0);
      if (notificationId > 0) {
        void api("/api/mobile/notifications", { method: "PATCH", body: jsonBody({ id: notificationId }) })
          .catch(() => undefined)
          .finally(() => void refreshNotificationState());
      } else {
        void refreshNotificationState();
      }
      openNotificationRoute(typeof data.url === "string" ? data.url : data.route);
    };
    const receive = Notifications.addNotificationReceivedListener(() => {
      void refreshNotificationState();
    });
    const response = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((event) => { if (event) handleResponse(event); }).catch(() => undefined);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshNotificationState();
    });
    return () => {
      receive.remove();
      response.remove();
      appState.remove();
    };
  }, [refreshNotificationState, user]);
}
