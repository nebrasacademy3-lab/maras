"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";

type ThemeContextValue = {
  theme: "light" | "dark";
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("meras-theme");
      const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = saved === "dark" || (!saved && preferred) ? "dark" : "light";
      setTheme(next);
      document.documentElement.classList.toggle("dark", next === "dark");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        window.localStorage.setItem("meras-theme", next);
        document.documentElement.classList.toggle("dark", next === "dark");
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const ctx = useContext(ThemeContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.toggleTheme}
      className="icon-button"
      aria-label={ctx.theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الليلي"}
      title={ctx.theme === "dark" ? "الوضع الفاتح" : "الوضع الليلي"}
    >
      {ctx.theme === "dark" ? <Sun size={compact ? 18 : 20} /> : <Moon size={compact ? 18 : 20} />}
    </button>
  );
}
