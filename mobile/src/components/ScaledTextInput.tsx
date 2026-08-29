import React from "react";
import { StyleSheet, TextInput as NativeTextInput, type TextInputProps, type TextStyle } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

const DEFAULT_FONT_SIZE = 14;

export function ScaledTextInput({ style, placeholder, secureTextEntry, keyboardType, textAlign: requestedTextAlign, ...props }: TextInputProps) {
  const { fontScale } = useTheme();
  const { isRTL, t } = useLanguage();
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const baseFontSize = typeof flattened?.fontSize === "number" ? flattened.fontSize : DEFAULT_FONT_SIZE;
  const forceLtr = Boolean(
    secureTextEntry ||
    flattened?.writingDirection === "ltr" ||
    ["email-address", "url", "phone-pad", "numeric", "number-pad", "decimal-pad"].includes(String(keyboardType || ""))
  );
  const scaledStyle: TextStyle = {
    fontSize: baseFontSize * fontScale,
    ...(typeof flattened?.lineHeight === "number" ? { lineHeight: flattened.lineHeight * fontScale } : {}),
    writingDirection: forceLtr ? "ltr" : isRTL ? "rtl" : "ltr",
    textAlign: requestedTextAlign === "center" ? "center" : forceLtr ? "left" : isRTL ? "right" : "left",
  };
  return <NativeTextInput {...props} secureTextEntry={secureTextEntry} keyboardType={keyboardType} placeholder={placeholder ? t(placeholder) : placeholder} style={[style, scaledStyle]} />;
}
