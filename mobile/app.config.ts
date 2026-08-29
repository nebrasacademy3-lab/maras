import type { ExpoConfig, ConfigContext } from "expo/config";
import { existsSync } from "node:fs";

export default ({ config }: ConfigContext): ExpoConfig => {
  const defaultApiUrl = "https://marase.up.railway.app";
  const apiUrl = String(process.env.EXPO_PUBLIC_API_URL || defaultApiUrl).trim().replace(/\/$/, "");
  if (!/^https:\/\//i.test(apiUrl)) {
    throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS URL");
  }
  return ({
  ...config,
  name: "مراس العلم",
  slug: "meras-alelm",
  version: "1.0.1",
  scheme: "merasalelm",
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  experiments: { typedRoutes: true },
  ios: {
    bundleIdentifier: "sa.merasalelm.app",
    supportsTablet: true,
    requireFullScreen: false,
    infoPlist: {
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
      UIBackgroundModes: ["remote-notification"],
      NSPhotoLibraryUsageDescription: "يستخدم مراس اختيار الملفات عند إرسال طلب مادة أو تحديث محتوى بإذن المستخدم.",
    },
  },
  android: {
    package: "sa.merasalelm.app",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#ffffff" },
    predictiveBackGestureEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    permissions: ["POST_NOTIFICATIONS", "RECORD_AUDIO"],
    ...(existsSync("./google-services.json") ? { googleServicesFile: "./google-services.json" } : {}),
  },
  web: { bundler: "metro", favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-video",
    ["expo-audio", { microphonePermission: "يستخدم مراس الميكروفون لإرسال رسائل صوتية إلى الدعم.", recordAudioAndroid: true, enableBackgroundRecording: false, enableBackgroundPlayback: false }],
    ["expo-build-properties", { android: { usesCleartextTraffic: false } }],
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#155EEF", defaultChannel: "updates" }],
    ["expo-splash-screen", {
      image: "./assets/splash-icon.png",
      imageWidth: 220,
      resizeMode: "contain",
      backgroundColor: "#ffffff",
      dark: { image: "./assets/splash-icon-dark.png", backgroundColor: "#071127" }
    }]
  ],
  extra: {
    apiUrl,
    storeMode: process.env.EXPO_PUBLIC_STORE_MODE || "reader",
    eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "684cf9e9-bf33-40bf-89a7-afba498cf90e" },
  },
  });
};
