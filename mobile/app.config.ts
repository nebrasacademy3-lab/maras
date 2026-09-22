import type { ExpoConfig, ConfigContext } from "expo/config";
import { existsSync } from "node:fs";

export default ({ config }: ConfigContext): ExpoConfig => {
  const defaultApiUrl = "https://marasalelm.com";

  const apiUrl = String(
    process.env.EXPO_PUBLIC_API_URL || defaultApiUrl
  )
    .trim()
    .replace(/\/$/, "");

  if (!/^https:\/\//i.test(apiUrl)) {
    throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS URL");
  }
  const parsedApi = new URL(apiUrl);
  if (parsedApi.username || parsedApi.password || parsedApi.search || parsedApi.hash || !["", "/"].includes(parsedApi.pathname)) {
    throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS origin without credentials, path, query or fragment");
  }
  const requestedStoreMode = String(process.env.EXPO_PUBLIC_STORE_MODE || "reader").trim().toLowerCase();
  if (!new Set(["reader", "direct"]).has(requestedStoreMode)) {
    throw new Error("EXPO_PUBLIC_STORE_MODE must be reader or direct");
  }

  const buildProfile = String(process.env.EAS_BUILD_PROFILE || "");
  const storeDistribution = ["development", "preview", "production-direct"].includes(buildProfile) ? "internal" : "store";
  if (requestedStoreMode !== "reader") {
    throw new Error("Store-distributed and internal native builds cannot use direct checkout. Use the reader mode.");
  }

  const appLinkHost = String(process.env.EXPO_PUBLIC_APP_LINK_HOST || new URL(apiUrl).hostname)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+$/.test(appLinkHost)) {
    throw new Error("EXPO_PUBLIC_APP_LINK_HOST must be a bare hostname such as marasalelm.com");
  }
  const googleServices = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";
  if (process.env.GOOGLE_SERVICES_JSON && !existsSync(googleServices)) {
    throw new Error("GOOGLE_SERVICES_JSON must point to the EAS-managed file secret");
  }
  if (process.env.EAS_BUILD === "true" && process.env.EAS_BUILD_PLATFORM === "android" && buildProfile === "production" && !existsSync(googleServices)) {
    throw new Error("Production Android push requires the GOOGLE_SERVICES_JSON file secret and FCM credentials in EAS");
  }
  const appLinkPaths = ["/r", "/courses", "/learn", "/referrals", "/notifications", "/study-tools", "/support", "/favorites", "/dashboard", "/tracks", "/learning-tracks"];

  return {
    ...config,

    name: "مراس العلم",
    slug: "meras-alelm",

    // الحساب/الفريق الذي سيملك المشروع
    owner: "os1m1s-team",

    version: "1.0.2",
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

      allowBackup: false,
      blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW", "android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VIDEO", "android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE"],
      permissions: [
        "POST_NOTIFICATIONS",
        "RECORD_AUDIO",
      ],

      ...(existsSync(googleServices)
        ? {
            googleServicesFile: googleServices,
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
      "expo-image",
      ["expo-image-picker", { cameraPermission: "يستخدم مراس الكاميرا لالتقاط صورة الشارح عند طلب التحقق من هويته وبإذنه.", photosPermission: "يستخدم مراس الصور التي تختار مشاركتها في مستنداتك.", microphonePermission: "يستخدم مراس الميكروفون لإرسال رسائل صوتية إلى الدعم." }],
      "expo-localization",
      "expo-sharing",
      "expo-web-browser",

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
            targetSdkVersion: 36,
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
      readerPreview: process.env.EXPO_PUBLIC_READER_PREVIEW === "true",
      storeDistribution,

      eas: {
        projectId:
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          "684cf9e9-bf33-40bf-89a7-afba498cf90e",
      },
    },
  };
};
