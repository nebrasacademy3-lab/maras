export type ThemeMode = "light" | "dark" | "system";

export const lightColors = {
  background: "#F7F9FD",
  surface: "#FFFFFF",
  surfaceAlt: "#F0F4FB",
  text: "#071B45",
  textSoft: "#68758C",
  border: "#E2E8F2",
  primary: "#155EEF",
  primaryDark: "#073B9B",
  violet: "#7B3FF2",
  accent: "#D934F2",
  success: "#0B9B69",
  warning: "#D7820D",
  danger: "#D9384E",
  tab: "#FFFFFF",
  overlay: "rgba(7,27,69,.55)",
  shadow: "#061A42",
  onPrimary: "#FFFFFF",
};

export const darkColors = {
  background: "#050B18",
  surface: "#0B162B",
  surfaceAlt: "#101F3A",
  text: "#F7FAFF",
  textSoft: "#9EADC5",
  border: "#1B2D4A",
  primary: "#4385FF",
  primaryDark: "#1D5FD8",
  violet: "#9B72FF",
  accent: "#E253FF",
  success: "#33D49A",
  warning: "#FFB84D",
  danger: "#FF6C7E",
  tab: "#081326",
  overlay: "rgba(0,0,0,.72)",
  shadow: "#000000",
  onPrimary: "#FFFFFF",
};

export type AppColors = typeof lightColors;

export const metrics = {
  screen: 18,
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  radiusSm: 12,
  radius: 18,
  radiusLg: 28,
};

