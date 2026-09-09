import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");
let nativeModule: Promise<NotificationsModule> | null = null;

export function supportsNativeNotifications() {
  return Platform.OS !== "web" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

export async function loadNativeNotifications(): Promise<NotificationsModule | null> {
  // Even importing this package starts native registration in Expo Go. Defer it completely.
  if (!supportsNativeNotifications()) return null;
  nativeModule ??= import("expo-notifications").then((notifications) => {
    notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
    });
    return notifications;
  }).catch((reason) => { nativeModule = null; throw reason; });
  return nativeModule;
}

export async function clearNativeNotificationBadge() {
  const notifications = await loadNativeNotifications();
  if (!notifications) return;
  await Promise.allSettled([notifications.setBadgeCountAsync(0), notifications.dismissAllNotificationsAsync()]);
}

export async function setNativeNotificationBadge(count: number) {
  const notifications = await loadNativeNotifications();
  if (!notifications) return;
  await notifications.setBadgeCountAsync(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
}
