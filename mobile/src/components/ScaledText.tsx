import React from "react";
import { Text as NativeText, StyleSheet, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

const DEFAULT_FONT_SIZE = 14;

function translateNode(node: React.ReactNode, t: (value: string) => string): React.ReactNode {
  if (typeof node === "string") return t(node);
  if (Array.isArray(node)) return node.map((item, index) => <React.Fragment key={index}>{translateNode(item, t)}</React.Fragment>);
  return node;
}

export function ScaledText({ style, children, ...props }: TextProps) {
  const { fontScale } = useTheme();
  const { isRTL, t } = useLanguage();
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const baseFontSize = typeof flattened?.fontSize === "number" ? flattened.fontSize : DEFAULT_FONT_SIZE;
  const forceLtr = flattened?.writingDirection === "ltr";
  const centered = flattened?.textAlign === "center";
  const justified = flattened?.textAlign === "justify";

  const scaledStyle: TextStyle = {
    fontSize: baseFontSize * fontScale,
    ...(typeof flattened?.lineHeight === "number" ? { lineHeight: flattened.lineHeight * fontScale } : {}),
    writingDirection: forceLtr ? "ltr" : isRTL ? "rtl" : "ltr",
    textAlign: centered ? "center" : justified ? "justify" : forceLtr ? "left" : isRTL ? "right" : "left",
  };

  return <NativeText {...props} style={[style, scaledStyle]}>{translateNode(children, t)}</NativeText>;
}
