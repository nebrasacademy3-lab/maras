import React, { useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppButton } from "@/src/components/ui";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { useTheme } from "@/src/providers/ThemeProvider";
export type SignaturePoint = { x: number; y: number };
export type SignatureStrokes = SignaturePoint[][];
export function SignaturePad({ value, onChange, disabled = false }: { value: SignatureStrokes; onChange: (value: SignatureStrokes) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 1, height: 190 });
  const current = useRef(value), bounds = useRef(size), locked = useRef(disabled), change = useRef(onChange);
  useLayoutEffect(() => { current.current = value; bounds.current = size; locked.current = disabled; change.current = onChange; }, [value, size, disabled, onChange]);
  const append = (x: number, y: number, start: boolean) => {
    if (locked.current || bounds.current.width <= 1) return;
    const point = { x: Math.max(0, Math.min(1, x / bounds.current.width)), y: Math.max(0, Math.min(1, y / bounds.current.height)) };
    const strokes = current.current;
    if (strokes.reduce((count, stroke) => count + stroke.length, 0) >= 1200 || start && strokes.length >= 30) return;
    const previous = strokes.at(-1)?.at(-1);
    if (!start && previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.003) return;
    const next = start || !strokes.length ? [...strokes, [point]] : [...strokes.slice(0, -1), [...(strokes.at(-1) || []), point]];
    current.current = next; change.current(next);
  };
  return <View style={{ gap: 8 }}><Text style={{ color: colors.textSoft, fontSize: 13, textAlign: "right" }}>ارسم توقيعك بإصبعك داخل المساحة التالية.</Text><View accessibilityLabel="مساحة رسم توقيع الشارح" onLayout={event => setSize(event.nativeEvent.layout)} onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled} onResponderGrant={event => append(event.nativeEvent.locationX, event.nativeEvent.locationY, true)} onResponderMove={event => append(event.nativeEvent.locationX, event.nativeEvent.locationY, false)} onResponderTerminationRequest={() => false} style={{ height: 190, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", overflow: "hidden" }}>
    {value.flatMap((stroke, strokeIndex) => stroke.slice(1).map((point, index) => {
      const previous = stroke[index]!, x1 = previous.x * size.width, y1 = previous.y * size.height, x2 = point.x * size.width, y2 = point.y * size.height;
      const length = Math.hypot(x2 - x1, y2 - y1);
      return <View pointerEvents="none" key={strokeIndex + ":" + index} style={{ position: "absolute", left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - 1, width: length, height: 2, backgroundColor: "#10254a", transform: [{ rotate: Math.atan2(y2 - y1, x2 - x1) + "rad" }] }} />;
    }))}
  </View><AppButton title="مسح التوقيع وإعادته" variant="ghost" disabled={disabled} onPress={() => onChange([])} /></View>;
}
