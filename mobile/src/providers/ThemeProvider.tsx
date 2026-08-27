import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { colorsFor, type AppColors, type PaletteId, type ThemeMode } from "@/src/theme/colors";

export type FontScale = 0.9 | 1 | 1.1 | 1.2;
type ThemeContextValue = { colors: AppColors; dark: boolean; mode: ThemeMode; palette: PaletteId; fontScale: FontScale; setMode: (mode: ThemeMode) => void; setPalette: (palette: PaletteId) => void; setFontScale: (scale: FontScale) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const palettes: PaletteId[] = ["official", "violet", "rose", "teal"];
const scales: FontScale[] = [.9, 1, 1.1, 1.2];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [palette, setPaletteState] = useState<PaletteId>("official");
  const [fontScale, setFontScaleState] = useState<FontScale>(1);
  useEffect(() => { void Promise.all([SecureStore.getItemAsync("meras_theme"), SecureStore.getItemAsync("meras_palette"), SecureStore.getItemAsync("meras_font_scale")]).then(([savedMode, savedPalette, savedScale]) => { if (savedMode === "light" || savedMode === "dark" || savedMode === "system") setModeState(savedMode); if (palettes.includes(savedPalette as PaletteId)) setPaletteState(savedPalette as PaletteId); if (scales.includes(Number(savedScale) as FontScale)) setFontScaleState(Number(savedScale) as FontScale); }); }, []);
  const setMode = useCallback((next: ThemeMode) => { setModeState(next); void SecureStore.setItemAsync("meras_theme", next); }, []);
  const setPalette = useCallback((next: PaletteId) => { setPaletteState(next); void SecureStore.setItemAsync("meras_palette", next); }, []);
  const setFontScale = useCallback((next: FontScale) => { setFontScaleState(next); void SecureStore.setItemAsync("meras_font_scale", String(next)); }, []);
  const dark = mode === "dark" || (mode === "system" && system === "dark");
  const colors = useMemo(() => colorsFor(palette, dark), [palette, dark]);
  useEffect(() => { void SystemUI.setBackgroundColorAsync(colors.background); }, [colors.background]);
  const value = useMemo(() => ({ colors, dark, mode, palette, fontScale, setMode, setPalette, setFontScale }), [colors, dark, mode, palette, fontScale, setMode, setPalette, setFontScale]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("ThemeProvider is missing"); return value; }
