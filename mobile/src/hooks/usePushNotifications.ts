import Constants from "expo-constants";
import * as Device from "expo-device";
import type { NotificationResponse } from "expo-notifications";
import { clearNativeNotificationBadge, loadNativeNotifications, setNativeNotificationBadge, supportsNativeNotifications } from "@/src/lib/native-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { openNotificationRoute } from "@/src/lib/notification-routing";

export { clearNativeNotificationBadge, setNativeNotificationBadge } from "@/src/lib/native-notifications";

export function usePushNotifications() {
  const { user } = useAuth();
  const client = useQueryClient();

  const refreshNotificationState = useCallback(async () => {
    if (!user?.id) {
      await clearNativeNotificationBadge();
      return;
    }
    try {
      const payload = await api<{ unreadCount?: number; notifications?: { readAt: string | null }[] }>("/api/mobile/notifications");
      const unread = typeof payload.unreadCount === "number"
        ? payload.unreadCount
        : (payload.notifications || []).filter((item) => !item.readAt).length;
      await setNativeNotificationBadge(unread);
      await client.invalidateQueries({ queryKey: ["notifications"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      // Keep the current badge when the device is temporarily offline.
    }
  }, [client, user?.id]);

  useEffect(() => {
    if (!user?.id || !Device.isDevice || !supportsNativeNotifications()) return;
    let active = true;
    void (async () => {
      const Notifications = await loadNativeNotifications();
      if (!active || !Notifications) return;
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
  }, [refreshNotificationState, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    let releaseListeners: (() => void) | undefined;
    let lastHandledIdentifier = "";
    const handleResponse = (event: NotificationResponse) => {
      if (!active) return;
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
    void loadNativeNotifications().then((Notifications) => {
      if (!active || !Notifications) return;
      const receive = Notifications.addNotificationReceivedListener(() => {
        void refreshNotificationState();
      });
      const response = Notifications.addNotificationResponseReceivedListener(handleResponse);
      void Notifications.getLastNotificationResponseAsync().then((event) => { if (event) handleResponse(event); }).catch(() => undefined);
      releaseListeners = () => { receive.remove(); response.remove(); };
    }).catch(() => undefined);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshNotificationState();
    });
    return () => {
      active = false;
      releaseListeners?.();
      appState.remove();
    };
  }, [refreshNotificationState, user?.id]);
}
