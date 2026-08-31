import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { I18nManager, Platform, View } from "react-native";
import { translate, type AppLanguage } from "@/src/i18n/translations";

const KEY = "meras_language";
type LanguageContextValue = {
  language: AppLanguage;
  isRTL: boolean;
  direction: "rtl" | "ltr";
  locale: "ar-SA" | "en-US";
  textAlign: "right" | "left";
  rowDirection: "row";
  startAlignment: "flex-start";
  t: (text: string) => string;
  setLanguage: (language: AppLanguage) => Promise<void>;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);

async function readLanguage(): Promise<AppLanguage> {
  try {
    const value = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return value === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}
async function storeLanguage(language: AppLanguage) {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, language);
    else await SecureStore.setItemAsync(KEY, language);
  } catch {
    // Storage can be unavailable in restricted runtimes.
  }
}
function applyNativeDirection(language: AppLanguage) {
  const rtl = language === "ar";
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      document.documentElement.dir = rtl ? "rtl" : "ltr";
      document.documentElement.lang = rtl ? "ar" : "en";
      document.body?.setAttribute("dir", rtl ? "rtl" : "ltr");
    }
    return;
  }
  I18nManager.allowRTL(true);
  I18nManager.swapLeftAndRightInRTL(true);
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("ar");

  useEffect(() => {
    let active = true;
    void readLanguage().then((value) => {
      if (!active) return;
      applyNativeDirection(value);
      setLanguageState(value);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (value: AppLanguage) => {
    applyNativeDirection(value);
    setLanguageState(value);
    await storeLanguage(value);
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const isRTL = language === "ar";
    return {
      language,
      isRTL,
      direction: isRTL ? "rtl" : "ltr",
      locale: isRTL ? "ar-SA" : "en-US",
      textAlign: isRTL ? "right" : "left",
      rowDirection: "row",
      startAlignment: "flex-start",
      t: (text) => translate(text, language),
      setLanguage,
    };
  }, [language, setLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      <View key={language} style={{ flex: 1, direction: value.direction }}>
        {children}
      </View>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be inside LanguageProvider");
  return value;
}
