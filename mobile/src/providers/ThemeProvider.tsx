import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, type AppColors, type ThemeMode } from "@/src/theme/colors";

type ThemeContextValue = { colors: AppColors; dark: boolean; mode: ThemeMode; setMode: (mode: ThemeMode) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  useEffect(() => { SecureStore.getItemAsync("meras_theme").then((saved) => { if (saved === "light" || saved === "dark" || saved === "system") setModeState(saved); }); }, []);
  const setMode = useCallback((next: ThemeMode) => { setModeState(next); void SecureStore.setItemAsync("meras_theme", next); }, []);
  const dark = mode === "dark" || (mode === "system" && system === "dark");
  const colors = dark ? darkColors : lightColors;
  useEffect(() => { void SystemUI.setBackgroundColorAsync(colors.background); }, [colors.background]);
  const value = useMemo(() => ({ colors, dark, mode, setMode }), [colors, dark, mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is missing");
  return value;
}

