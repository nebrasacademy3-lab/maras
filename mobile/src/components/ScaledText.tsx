import React from "react";
import { Text as NativeText, StyleSheet, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";

const DEFAULT_FONT_SIZE = 14;

export function ScaledText({ style, ...props }: TextProps) {
  const { fontScale } = useTheme();
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const baseFontSize = typeof flattened?.fontSize === "number" ? flattened.fontSize : DEFAULT_FONT_SIZE;
  const scaledStyle: TextStyle = {
    fontSize: baseFontSize * fontScale,
    ...(typeof flattened?.lineHeight === "number" ? { lineHeight: flattened.lineHeight * fontScale } : {}),
  };
  return <NativeText {...props} style={[style, scaledStyle]} />;
}
