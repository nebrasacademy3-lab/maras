import type { ExpoConfig, ConfigContext } from "expo/config";
import { existsSync } from "node:fs";

export default ({ config }: ConfigContext): ExpoConfig => {
  const defaultApiUrl = "https://marase.up.railway.app";

  const apiUrl = String(
    process.env.EXPO_PUBLIC_API_URL || defaultApiUrl
  )
    .trim()
    .replace(/\/$/, "");

  if (!/^https:\/\//i.test(apiUrl)) {
    throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS URL");
  }
  const requestedStoreMode = String(process.env.EXPO_PUBLIC_STORE_MODE || "reader").trim().toLowerCase();
  if (!new Set(["reader", "direct"]).has(requestedStoreMode)) {
    throw new Error("EXPO_PUBLIC_STORE_MODE must be either reader or direct");
  }

  const appLinkHost = String(process.env.EXPO_PUBLIC_APP_LINK_HOST || new URL(apiUrl).hostname)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+$/.test(appLinkHost)) {
    throw new Error("EXPO_PUBLIC_APP_LINK_HOST must be a bare hostname such as merasalelm.com");
  }
  const appLinkPaths = ["/r", "/courses", "/learn", "/referrals", "/notifications", "/meras-ai", "/support", "/cart", "/favorites", "/dashboard", "/tracks", "/learning-tracks"];

  return {
    ...config,

    name: "مراس العلم",
    slug: "meras-alelm",

    // الحساب/الفريق الذي سيملك المشروع
    owner: "os1m1s-team",

    version: "1.0.1",
    scheme: "merasalelm",
    orientation: "default",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",

    experiments: {
      typedRoutes: true,
    },

    ios: {
      bundleIdentifier: "sa.merasalelm.app",
      supportsTablet: true,
      requireFullScreen: false,
      associatedDomains: [`applinks:${appLinkHost}`],

      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
        },

        UIBackgroundModes: ["remote-notification"],

        NSPhotoLibraryUsageDescription:
          "يستخدم مراس اختيار الملفات عند إرسال طلب مادة أو تحديث محتوى بإذن المستخدم.",
      },
    },

    android: {
      package: "sa.merasalelm.app",

      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },

      predictiveBackGestureEnabled: true,
      softwareKeyboardLayoutMode: "resize",

      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          category: ["DEFAULT", "BROWSABLE"],
          data: appLinkPaths.map((pathPrefix) => ({ scheme: "https", host: appLinkHost, pathPrefix })),
        },
      ],

      permissions: [
        "POST_NOTIFICATIONS",
        "RECORD_AUDIO",
      ],

      ...(existsSync("./google-services.json")
        ? {
            googleServicesFile: "./google-services.json",
          }
        : {}),
    },

    web: {
      bundler: "metro",
      favicon: "./assets/favicon.png",
    },

    plugins: [
      "expo-router",
      "expo-font",
      "expo-secure-store",
      "expo-video",

      [
        "expo-audio",
        {
          microphonePermission:
            "يستخدم مراس الميكروفون لإرسال رسائل صوتية إلى الدعم.",
          recordAudioAndroid: true,
          enableBackgroundRecording: false,
          enableBackgroundPlayback: false,
        },
      ],

      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: false,
          },
        },
      ],

      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          color: "#155EEF",
          defaultChannel: "updates",
        },
      ],

      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 220,
          resizeMode: "contain",
          backgroundColor: "#ffffff",

          dark: {
            image: "./assets/splash-icon-dark.png",
            backgroundColor: "#071127",
          },
        },
      ],
    ],

    extra: {
      apiUrl,

      appLinkHost,

      storeMode: requestedStoreMode,

      eas: {
        projectId:
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          "684cf9e9-bf33-40bf-89a7-afba498cf90e",
      },
    },
  };
};
