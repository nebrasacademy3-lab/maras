import { Image } from "expo-image";
import * as SecureStore from "expo-secure-store";
import { router, useSegments } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, Platform, StyleSheet, View, useWindowDimensions, type GestureResponderEvent, type PanResponderGestureState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "@/src/components/ui";
import { ASSISTANT_SIZE, clampFloatingPoint, floatingBounds, floatingReleaseAction, normalizedFloatingPoint, parseFloatingPoint, resolveFloatingPoint, type FloatingPoint } from "@/src/lib/floating-position";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

export function AssistantFab() {
  const segments = useSegments();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isRTL, t } = useLanguage();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const storageKey = `meras_assistant_position_${user?.id || "guest"}`;
  const bounds = useMemo(() => floatingBounds(width, height, insets), [width, height, insets]);
  const [loadedKey, setLoadedKey] = useState("");
  const ready = loadedKey === storageKey;
  const [dragHighlight] = useState(() => new Animated.Value(0));
  const [position] = useState(() => new Animated.ValueXY());
  const [scale] = useState(() => new Animated.Value(1));
  const point = useRef<FloatingPoint>({ x: 0, y: 0 });
  const normalized = useRef<FloatingPoint | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef({ held: false, moved: false, origin: { x: 0, y: 0 } });
  const stopTimer = useCallback(() => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; }, []);
  const moveTo = useCallback((next: FloatingPoint) => { point.current = clampFloatingPoint(next, bounds); position.setValue(point.current); }, [bounds, position]);
  const save = useCallback(async (next: FloatingPoint | null) => {
    try {
      if (Platform.OS === "web") { if (next) globalThis.localStorage?.setItem(storageKey, JSON.stringify(next)); else globalThis.localStorage?.removeItem(storageKey); }
      else if (next) await SecureStore.setItemAsync(storageKey, JSON.stringify(next));
      else await SecureStore.deleteItemAsync(storageKey);
    } catch { /* Position is optional; storage failure never blocks the assistant. */ }
  }, [storageKey]);
  useEffect(() => {
    let active = true;

    normalized.current = null;
    void (async () => {
      let raw: string | null = null;
      try { raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(storageKey) || null : await SecureStore.getItemAsync(storageKey); } catch { /* Use the default position. */ }
      if (!active) return;
      normalized.current = parseFloatingPoint(raw); setLoadedKey(storageKey);
    })();
    return () => { active = false; stopTimer(); };
  }, [storageKey, stopTimer]);
  useEffect(() => { stopTimer(); gesture.current.held = false; gesture.current.moved = true; dragHighlight.setValue(0); scale.stopAnimation(); scale.setValue(1); moveTo(resolveFloatingPoint(normalized.current, bounds, isRTL)); }, [bounds, isRTL, moveTo, ready, stopTimer, dragHighlight, scale]);
  const animatePress = useCallback((value: number) => { scale.stopAnimation(); if (reduceMotion) scale.setValue(1); else Animated.timing(scale, { toValue: value, duration: 140, useNativeDriver: true }).start(); }, [reduceMotion, scale]);
  const reset = useCallback(() => { stopTimer(); normalized.current = null; moveTo(resolveFloatingPoint(null, bounds, isRTL)); void save(null); AccessibilityInfo.announceForAccessibility(t("تمت إعادة زر المساعد إلى موضعه الأصلي")); }, [bounds, isRTL, moveTo, save, stopTimer, t]);
  const onMoveShouldSet = useCallback(() => gesture.current.held, []);
  const onGrant = useCallback(() => {
      stopTimer(); gesture.current = { held: false, moved: false, origin: { ...point.current } }; animatePress(.96);
      holdTimer.current = setTimeout(() => { gesture.current.held = true; dragHighlight.setValue(1); animatePress(1.06); AccessibilityInfo.announceForAccessibility(t("حرّك زر المساعد ثم ارفع إصبعك لحفظ موضعه")); }, 420);
  }, [animatePress, dragHighlight, stopTimer, t]);
  const onMove = useCallback((_event: GestureResponderEvent, state: PanResponderGestureState) => {
      if (Math.abs(state.dx) + Math.abs(state.dy) > 10) gesture.current.moved = true;
      if (!gesture.current.held) { if (gesture.current.moved) stopTimer(); return; }
      moveTo({ x: gesture.current.origin.x + state.dx, y: gesture.current.origin.y + state.dy });
  }, [moveTo, stopTimer]);
  const onRelease = useCallback(() => {
      stopTimer(); dragHighlight.setValue(0); animatePress(1);
      if (floatingReleaseAction(gesture.current.held, gesture.current.moved) === "save") { normalized.current = normalizedFloatingPoint(point.current, bounds); void save(normalized.current); }
      else if (floatingReleaseAction(gesture.current.held, gesture.current.moved) === "open") router.push("/assistant");
      gesture.current.held = false;
  }, [animatePress, bounds, dragHighlight, save, stopTimer]);
  const onTerminationRequest = useCallback(() => !gesture.current.held, []);
  const onTerminate = useCallback(() => { stopTimer(); gesture.current.held = false; dragHighlight.setValue(0); animatePress(1); moveTo(resolveFloatingPoint(normalized.current, bounds, isRTL)); }, [animatePress, bounds, dragHighlight, isRTL, moveTo, stopTimer]);
  // Native PanResponder.create stores these callbacks; only touch events invoke them.
  // eslint-disable-next-line react-hooks/refs -- Gesture refs are never read during render; RN invokes handlers later.
  const pan = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: onMoveShouldSet, onPanResponderGrant: onGrant, onPanResponderMove: onMove, onPanResponderRelease: onRelease, onPanResponderTerminationRequest: onTerminationRequest, onPanResponderTerminate: onTerminate }), [onGrant, onMove, onMoveShouldSet, onRelease, onTerminate, onTerminationRequest]);
  const route = segments.join("/");
  if (!ready || route.includes("(auth)") || route.includes("admin") || /assistant|lesson|oauth|verify-email/.test(route)) return null;
  return <View pointerEvents="box-none" style={styles.layer}><Animated.View
    {...pan.panHandlers}
    accessible accessibilityRole="button" accessibilityLabel={t("مساعد مراس")}
    accessibilityHint={t("اضغط للفتح، أو اضغط مطولًا ثم اسحب لتغيير موضع الزر")}
    accessibilityActions={[{ name: "activate", label: t("فتح المساعد") }, { name: "resetPosition", label: t("إعادة موضع الزر") }, { name: "moveUp", label: t("تحريك لأعلى") }, { name: "moveDown", label: t("تحريك لأسفل") }, { name: "moveLeft", label: t("تحريك لليسار") }, { name: "moveRight", label: t("تحريك لليمين") }]}
    onAccessibilityAction={(event) => {
      const action = event.nativeEvent.actionName;
      if (action === "activate") router.push("/assistant");
      else if (action === "resetPosition") reset();
      else {
        const offsets: Record<string, FloatingPoint> = { moveUp: { x: 0, y: -60 }, moveDown: { x: 0, y: 60 }, moveLeft: { x: -60, y: 0 }, moveRight: { x: 60, y: 0 } };
        const offset = offsets[action];
        if (offset) { moveTo({ x: point.current.x + offset.x, y: point.current.y + offset.y }); normalized.current = normalizedFloatingPoint(point.current, bounds); void save(normalized.current); }
      }
    }}
    style={[styles.button, { backgroundColor: colors.surface, borderColor: dragHighlight.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.primary] }), transform: [...position.getTranslateTransform(), { scale }] }]}
  ><Image source={require("@/assets/brand-mark.png")} style={styles.mark} contentFit="contain" /></Animated.View></View>;
}

const styles = StyleSheet.create({ layer: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, direction: "ltr", zIndex: 50 }, button: { position: "absolute", left: 0, top: 0, width: ASSISTANT_SIZE, height: ASSISTANT_SIZE, zIndex: 50, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: .18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, mark: { width: 56, height: 56 } });
