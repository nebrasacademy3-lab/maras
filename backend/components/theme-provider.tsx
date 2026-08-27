"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Moon, Palette, Sun } from "lucide-react";

export const PALETTES = {
  official: { label: "الرسمي", primary: "#1258e8", secondary: "#7445f5", accent: "#21a6e8" },
  violet: { label: "بنفسجي", primary: "#6d45e8", secondary: "#ad5cf5", accent: "#e155f2" },
  rose: { label: "وردي", primary: "#d83f78", secondary: "#9b4de0", accent: "#f08aaa" },
  teal: { label: "فيروزي", primary: "#078f96", secondary: "#2875d5", accent: "#35c6b2" },
} as const;
export type PaletteId = keyof typeof PALETTES;
export type FontScale = 0.9 | 1 | 1.1 | 1.2;

type ThemeContextValue = {
  theme: "light" | "dark";
  palette: PaletteId;
  fontScale: FontScale;
  toggleTheme: () => void;
  setPalette: (palette: PaletteId) => void;
  setFontScale: (scale: FontScale) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const isPalette = (value: string | null): value is PaletteId => Boolean(value && value in PALETTES);
const isFontScale = (value: string | null): value is `${FontScale}` => ["0.9", "1", "1.1", "1.2"].includes(value || "");

function applyAppearance(theme: "light" | "dark", palette: PaletteId, fontScale: FontScale) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.palette = palette;
  document.documentElement.dataset.fontScale = String(fontScale);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [palette, setPaletteState] = useState<PaletteId>("official");
  const [fontScale, setFontScaleState] = useState<FontScale>(1);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedTheme = window.localStorage.getItem("meras-theme");
      const savedPalette = window.localStorage.getItem("meras-palette");
      const savedScale = window.localStorage.getItem("meras-font-scale");
      const nextTheme = savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
      const nextPalette = isPalette(savedPalette) ? savedPalette : "official";
      const nextScale = isFontScale(savedScale) ? Number(savedScale) as FontScale : 1;
      setTheme(nextTheme); setPaletteState(nextPalette); setFontScaleState(nextScale); applyAppearance(nextTheme, nextPalette, nextScale);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const value = useMemo(() => ({
    theme,
    palette,
    fontScale,
    toggleTheme: () => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); window.localStorage.setItem("meras-theme", next); applyAppearance(next, palette, fontScale); },
    setPalette: (next: PaletteId) => { setPaletteState(next); window.localStorage.setItem("meras-palette", next); applyAppearance(theme, next, fontScale); },
    setFontScale: (next: FontScale) => { setFontScaleState(next); window.localStorage.setItem("meras-font-scale", String(next)); applyAppearance(theme, palette, next); },
  }), [theme, palette, fontScale]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const ctx = useContext(ThemeContext); if (!ctx) throw new Error("ThemeProvider is missing"); return ctx; }

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const ctx = useContext(ThemeContext);
  if (!ctx) return null;
  return <button type="button" onClick={ctx.toggleTheme} className="icon-button" aria-label={ctx.theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الليلي"} title={ctx.theme === "dark" ? "الوضع الفاتح" : "الوضع الليلي"}>{ctx.theme === "dark" ? <Sun size={compact ? 18 : 20} /> : <Moon size={compact ? 18 : 20} />}</button>;
}

export function AppearanceSettings() {
  const { theme, palette, fontScale, toggleTheme, setPalette, setFontScale } = useTheme();
  const scales: Array<{ value: FontScale; label: string }> = [{ value: .9, label: "صغير" }, { value: 1, label: "قياسي" }, { value: 1.1, label: "كبير" }, { value: 1.2, label: "أكبر" }];
  return <section className="appearance-settings" aria-labelledby="appearance-title"><div className="appearance-heading"><span className="appearance-icon"><Palette size={20} /></span><div><h2 id="appearance-title">إعدادات المظهر</h2><p>اختر الألوان وحجم النص كما يناسبك. تحفظ الخيارات على هذا الجهاز وتعمل للطالب والمشرف والإدارة.</p></div></div><div className="appearance-group"><strong>الوضع</strong><div className="appearance-options"><button type="button" className={theme === "light" ? "active" : ""} onClick={() => theme === "dark" && toggleTheme()}><Sun size={17} /> فاتح</button><button type="button" className={theme === "dark" ? "active" : ""} onClick={() => theme === "light" && toggleTheme()}><Moon size={17} /> ليلي</button></div></div><div className="appearance-group"><strong>الثيم اللوني</strong><div className="appearance-palette-grid">{(Object.entries(PALETTES) as Array<[PaletteId, typeof PALETTES[PaletteId]]>).map(([id, item]) => <button type="button" key={id} className={palette === id ? "active" : ""} onClick={() => setPalette(id)}><i style={{ background: `linear-gradient(135deg, ${item.primary}, ${item.secondary})` }} /><span>{item.label}</span>{palette === id && <b>✓</b>}</button>)}</div></div><div className="appearance-group"><strong>حجم الخط</strong><div className="appearance-options font-scale-options">{scales.map((item) => <button type="button" key={item.value} className={fontScale === item.value ? "active" : ""} onClick={() => setFontScale(item.value)}><span style={{ fontSize: `${12 + item.value * 3}px` }}>أ</span>{item.label}</button>)}</div></div></section>;
}
