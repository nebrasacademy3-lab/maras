import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "مراس العلم",
  slug: "meras-alelm",
  version: "1.0.0",
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
      UIBackgroundModes: ["remote-notification"],
      NSPhotoLibraryUsageDescription: "يستخدم مراس اختيار الملفات عند إرسال طلب مادة أو تحديث محتوى بإذن المستخدم.",
    },
  },
  android: {
    package: "sa.merasalelm.app",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#ffffff" },
    predictiveBackGestureEnabled: true,
    permissions: ["POST_NOTIFICATIONS"],
  },
  web: { bundler: "metro", favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-secure-store",
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
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://meras-alelm.glossy-sun-8084.chatgpt.site",
    storeMode: process.env.EXPO_PUBLIC_STORE_MODE || "reader",
    eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined },
  },
  updates: { fallbackToCacheTimeout: 0 },
  runtimeVersion: { policy: "appVersion" },
});
