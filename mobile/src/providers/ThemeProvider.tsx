import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import { colorsFor, type AppColors, type PaletteId, type ThemeMode } from "@/src/theme/colors";

export type FontScale = 0.9 | 1 | 1.1 | 1.2;
type ThemeContextValue = { colors: AppColors; dark: boolean; mode: ThemeMode; palette: PaletteId; fontScale: FontScale; setMode: (mode: ThemeMode) => void; setPalette: (palette: PaletteId) => void; setFontScale: (scale: FontScale) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const palettes: PaletteId[] = ["official", "violet", "rose", "teal"];
const scales: FontScale[] = [.9, 1, 1.1, 1.2];

async function readPreference(key: string) {
  try {
    if (Platform.OS === "web") return typeof window === "undefined" ? null : window.localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch { return null; }
}

async function writePreference(key: string, value: string) {
  try {
    if (Platform.OS === "web") { if (typeof window !== "undefined") window.localStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  } catch { /* Preference changes still apply to the current session. */ }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [palette, setPaletteState] = useState<PaletteId>("official");
  const [fontScale, setFontScaleState] = useState<FontScale>(1);
  useEffect(() => { void Promise.all([readPreference("meras_theme"), readPreference("meras_palette"), readPreference("meras_font_scale")]).then(([savedMode, savedPalette, savedScale]) => { if (savedMode === "light" || savedMode === "dark" || savedMode === "system") setModeState(savedMode); if (palettes.includes(savedPalette as PaletteId)) setPaletteState(savedPalette as PaletteId); if (scales.includes(Number(savedScale) as FontScale)) setFontScaleState(Number(savedScale) as FontScale); }); }, []);
  const setMode = useCallback((next: ThemeMode) => { setModeState(next); void writePreference("meras_theme", next); }, []);
  const setPalette = useCallback((next: PaletteId) => { setPaletteState(next); void writePreference("meras_palette", next); }, []);
  const setFontScale = useCallback((next: FontScale) => { setFontScaleState(next); void writePreference("meras_font_scale", String(next)); }, []);
  const dark = mode === "dark" || (mode === "system" && system === "dark");
  const colors = useMemo(() => colorsFor(palette, dark), [palette, dark]);
  useEffect(() => {
    if (Platform.OS === "web") { if (typeof document !== "undefined") document.documentElement.style.backgroundColor = colors.background; }
    else void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);
  const value = useMemo(() => ({ colors, dark, mode, palette, fontScale, setMode, setPalette, setFontScale }), [colors, dark, mode, palette, fontScale, setMode, setPalette, setFontScale]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("ThemeProvider is missing"); return value; }
