import React from "react";
import { Platform, StyleSheet, TextInput as NativeTextInput, type TextInputProps, type TextStyle } from "react-native";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { directionForText } from "@/src/lib/text-direction";

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
  const translatedPlaceholder = placeholder ? t(placeholder) : placeholder;
  const value = String(props.value ?? props.defaultValue ?? "");
  const currentText = value || translatedPlaceholder || "";
  const contentDirection = forceLtr
    ? "ltr"
    : directionForText(currentText, isRTL ? "rtl" : "ltr");
  const alignment: "center" | "left" | "right" = requestedTextAlign === "center" || flattened?.textAlign === "center" ? "center" : value && forceLtr ? "left" : isRTL ? "right" : "left";
  const scaledStyle: TextStyle = {
    fontSize: baseFontSize * fontScale,
    ...(typeof flattened?.lineHeight === "number" ? { lineHeight: flattened.lineHeight * fontScale } : {}),
    writingDirection: contentDirection,
    // Keep physical alignment stable across native Fabric and web.
    direction: Platform.OS === "web" ? contentDirection : "ltr",
    textAlign: alignment,
  };
  return <NativeTextInput {...props} secureTextEntry={secureTextEntry} keyboardType={keyboardType} textAlign={alignment} placeholder={translatedPlaceholder} style={[style, scaledStyle]} />;
}
