export type ThemeMode = "light" | "dark" | "system";
export type PaletteId = "official" | "violet" | "rose" | "teal";

const commonLight = { background: "#F7F9FD", surface: "#FFFFFF", surfaceAlt: "#F0F4FB", text: "#071B45", textSoft: "#68758C", border: "#E2E8F2", success: "#0B9B69", warning: "#D7820D", danger: "#D9384E", tab: "#FFFFFF", overlay: "rgba(7,27,69,.55)", shadow: "#061A42", onPrimary: "#FFFFFF" };
const commonDark = { background: "#050B18", surface: "#0B162B", surfaceAlt: "#101F3A", text: "#F7FAFF", textSoft: "#9EADC5", border: "#1B2D4A", success: "#33D49A", warning: "#FFB84D", danger: "#FF6C7E", tab: "#081326", overlay: "rgba(0,0,0,.72)", shadow: "#000000", onPrimary: "#FFFFFF" };

export const paletteLabels: Record<PaletteId, string> = { official: "الرسمي", violet: "بنفسجي", rose: "وردي", teal: "فيروزي" };
const paletteTones: Record<PaletteId, { light: { primary: string; primaryDark: string; violet: string; accent: string }; dark: { primary: string; primaryDark: string; violet: string; accent: string } }> = {
  official: { light: { primary: "#155EEF", primaryDark: "#073B9B", violet: "#7B3FF2", accent: "#D934F2" }, dark: { primary: "#4385FF", primaryDark: "#1D5FD8", violet: "#9B72FF", accent: "#E253FF" } },
  violet: { light: { primary: "#6D45E8", primaryDark: "#4D2BB5", violet: "#9A54EF", accent: "#D86AF4" }, dark: { primary: "#A884FF", primaryDark: "#805BE0", violet: "#C184FF", accent: "#F08AFF" } },
  rose: { light: { primary: "#D83F78", primaryDark: "#A72558", violet: "#9B4DE0", accent: "#F08AAA" }, dark: { primary: "#FF78A9", primaryDark: "#DB4D82", violet: "#D988FF", accent: "#FF9FC4" } },
  teal: { light: { primary: "#078F96", primaryDark: "#05636A", violet: "#2875D5", accent: "#35C6B2" }, dark: { primary: "#51D9D0", primaryDark: "#27AAA7", violet: "#70A9FF", accent: "#79E9D2" } },
};

export const lightColors = { ...commonLight, ...paletteTones.official.light };
export const darkColors = { ...commonDark, ...paletteTones.official.dark };
export type AppColors = typeof lightColors;

export function colorsFor(palette: PaletteId, dark: boolean): AppColors { return { ...(dark ? commonDark : commonLight), ...(dark ? paletteTones[palette].dark : paletteTones[palette].light) }; }

export const metrics = { screen: 18, xs: 6, sm: 10, md: 16, lg: 24, xl: 32, radiusSm: 12, radius: 18, radiusLg: 28 };
