import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, type StyleProp, type TextInputProps, View, type ViewStyle } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { metrics } from "@/src/theme/colors";
import { MobileFooter } from "@/src/components/MobileFooter";
import { intersectsMotionViewport } from "@/src/lib/motion-visibility";

type RevealRegistration = { current: View | null };
type RevealController = { check: () => void; register: (ref: RevealRegistration, reveal: () => void) => () => void };
const ScrollRevealContext = createContext<RevealController | null>(null);

function useScrollReveals(viewport: React.RefObject<View | null>) {
  const entries = useRef(new Map<RevealRegistration, () => void>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);
  const controller = useMemo<RevealController>(() => {
    const check = () => {
      if (!active.current || timer.current) return;
      // Only unrevealed sections are measured; scrolling does not rerender the page.
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!active.current || !entries.current.size) return;
        const host = viewport.current;
        if (!host?.measureInWindow) {
          for (const reveal of entries.current.values()) reveal();
          entries.current.clear();
          return;
        }
        host.measureInWindow((_x, top, _width, height) => {
          if (!active.current) return;
          for (const [ref, reveal] of entries.current) ref.current?.measureInWindow((_itemX, itemTop, _itemWidth, itemHeight) => {
            if (active.current && entries.current.has(ref) && intersectsMotionViewport(itemTop, itemHeight, top, height)) {
              entries.current.delete(ref);
              reveal();
            }
          });
        });
      }, 64);
    };
    return { check, register: (ref, reveal) => { entries.current.set(ref, reveal); check(); return () => { entries.current.delete(ref); }; } };
  }, [viewport]);
  useEffect(() => {
    active.current = true;
    controller.check();
    const registered = entries.current;
    return () => { active.current = false; if (timer.current) clearTimeout(timer.current); timer.current = null; registered.clear(); };
  }, [controller]);
  return controller;
}

export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduceMotion(value); }).catch(() => { if (active) setReduceMotion(true); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduceMotion;
}

export function Screen({ children, scroll = true, padded = true, keyboard = false, showFooter = true, style }: { children: React.ReactNode; scroll?: boolean; padded?: boolean; keyboard?: boolean; showFooter?: boolean; style?: ViewStyle }) {
  const { colors } = useTheme();
  const { direction } = useLanguage();
  const [entrance] = useState(() => new Animated.Value(0));
  const reduceMotion = useReduceMotion();
  const viewport = useRef<View>(null);
  const reveals = useScrollReveals(viewport);
  useFocusEffect(useCallback(() => {
    if (reduceMotion) entrance.setValue(1);
    else { entrance.setValue(0); Animated.timing(entrance, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
    reveals.check();
    return () => entrance.stopAnimation();
  }, [entrance, reduceMotion, reveals]));
  const footer = showFooter ? <MobileFooter /> : null;
  const animatedContent = <Animated.View style={[styles.screenContent, { direction, opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>{children}{footer}</Animated.View>;
  const content = scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onScroll={reveals.check} scrollEventThrottle={64} onContentSizeChange={reveals.check} style={{ direction }} contentContainerStyle={[styles.scroll, padded && styles.padded, { direction }, style]}>{animatedContent}</ScrollView> : <View style={[styles.flex, padded && styles.padded, { direction }, style]}>{animatedContent}</View>;
  const measuredContent = <View ref={viewport} collapsable={false} onLayout={reveals.check} style={styles.flex}>{content}</View>;
  return <ScrollRevealContext.Provider value={scroll ? reveals : null}><SafeAreaView edges={["top", "left", "right"]} style={[styles.flex, { backgroundColor: colors.background, direction }]}>{keyboard ? <KeyboardAvoidingView style={[styles.flex, { direction }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>{measuredContent}</KeyboardAvoidingView> : measuredContent}</SafeAreaView></ScrollRevealContext.Provider>;
}

export function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const [value] = useState(() => new Animated.Value(0));
  const reduceMotion = useReduceMotion();
  const reveals = useContext(ScrollRevealContext);
  const view = useRef<View>(null);
  useEffect(() => {
    if (reduceMotion) { value.setValue(1); return; }
    const reveal = () => Animated.timing(value, { toValue: 1, delay: Math.min(240, Math.max(0, delay)), duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const unregister = reveals?.register(view, reveal);
    if (!reveals) reveal();
    return () => { unregister?.(); value.stopAnimation(); };
  }, [delay, reduceMotion, value, reveals]);
  return <Animated.View ref={view} collapsable={false} onLayout={reveals?.check} style={[style, { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }, { scale: value.interpolate({ inputRange: [0, 1], outputRange: [.985, 1] }) }] }]}>{children}</Animated.View>;
}

export function AppButton({ title, onPress, icon, variant = "primary", disabled = false, loading = false, full = true }: { title: string; onPress?: () => void; icon?: React.ComponentProps<typeof Ionicons>["name"]; variant?: "primary" | "soft" | "ghost" | "danger"; disabled?: boolean; loading?: boolean; full?: boolean }) {
  const { colors } = useTheme();
  const { direction, rowDirection } = useLanguage();
  const reduceMotion = useReduceMotion();
  const contentColor = variant === "primary" || variant === "danger" ? "#FFFFFF" : colors.primary;
  const background = variant === "primary" ? colors.primary : variant === "danger" ? colors.danger : variant === "soft" ? colors.surfaceAlt : "transparent";
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, full && styles.buttonFull, { direction, flexDirection: rowDirection, backgroundColor: background, borderColor: variant === "ghost" ? colors.border : background, opacity: disabled ? .45 : pressed ? .8 : 1, transform: [{ scale: pressed && !reduceMotion ? .97 : 1 }] }]}>{loading ? <ActivityIndicator color={contentColor} /> : <>{icon && <Ionicons name={icon} size={18} color={contentColor} />}<Text style={[styles.buttonText, { color: contentColor }]}>{title}</Text></>}</Pressable>;
}

export function Field({ label, error, icon, trailing, inputDirection = "natural", ...props }: TextInputProps & { label: string; error?: string; icon?: React.ComponentProps<typeof Ionicons>["name"]; trailing?: React.ReactNode; inputDirection?: "natural"|"ltr" }) {
  const { colors } = useTheme();
  const { direction, textAlign } = useLanguage();
  const ltr = inputDirection === "ltr";
  return <View style={[styles.fieldWrap, { direction }]}><Text style={[styles.label, { color: colors.text, textAlign }]}>{label}</Text><View style={[styles.inputWrap, { direction, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border }]}>{icon && <Ionicons name={icon} size={19} color={colors.textSoft} />}<TextInput {...props} placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.input, ltr && styles.inputLtr, { color: colors.text }, props.style]} />{trailing ? <View style={styles.trailing}>{trailing}</View> : null}</View>{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, dark } = useTheme();
  const { direction } = useLanguage();
  return <View style={[styles.card, { direction, backgroundColor: colors.surface, borderColor: colors.border, shadowOpacity: dark ? .22 : .06 }, style]}>{children}</View>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  const { direction, rowDirection } = useLanguage();
  return <View style={[styles.sectionHead, { direction, flexDirection: rowDirection }]}><View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>{subtitle && <Text style={[styles.sectionSub, { color: colors.textSoft }]}>{subtitle}</Text>}</View>{action}</View>;
}

export function SearchBox({ value, onChangeText, placeholder = "ابحث..." }: { value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  const { colors } = useTheme();
  const { direction } = useLanguage();
  return <View style={[styles.search, { direction, backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" size={20} color={colors.textSoft} /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textSoft} style={[styles.searchInput, { color: colors.text }]} /><Pressable onPress={() => onChangeText("")} hitSlop={12}>{value ? <Ionicons name="close-circle" size={19} color={colors.textSoft} /> : null}</Pressable></View>;
}

export function LoadingState({ label = "جارٍ تحميل مراس..." }: { label?: string }) {
  const { colors } = useTheme();
  return <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /><Text style={[styles.stateText, { color: colors.textSoft }]}>{label}</Text></View>;
}

export function EmptyState({ icon = "sparkles-outline", title, text, action }: { icon?: React.ComponentProps<typeof Ionicons>["name"]; title: string; text: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return <Card style={styles.stateCard}><View style={[styles.stateIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={30} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyText, { color: colors.textSoft }]}>{text}</Text>{action}</Card>;
}

export function HeroGradient({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <LinearGradient colors={[colors.primaryDark, colors.primary, colors.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>{children}</LinearGradient>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, screenContent: { flexGrow: 1, width: "100%", maxWidth: 1160, alignSelf: "center" }, scroll: { flexGrow: 1, paddingBottom: 120 }, padded: { paddingHorizontal: metrics.screen },
  button: { minHeight: 50, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, buttonFull: { width: "100%" }, buttonText: { fontSize: 14, lineHeight: 22, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  fieldWrap: { gap: 7, marginBottom: 14 }, label: { fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, inputWrap: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 }, input: { flex: 1, minHeight: 50, fontSize: 14 }, trailing: { flexShrink: 0, alignItems: "center", justifyContent: "center" }, inputLtr: { writingDirection: "ltr", textAlign: "left" }, error: { fontSize: 11, textAlign: "right" },
  card: { borderRadius: metrics.radius, borderWidth: 1, padding: 16, shadowColor: "#061A42", shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  sectionHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 24, marginBottom: 12 }, sectionTitle: { fontSize: 21, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, sectionSub: { fontSize: 11, lineHeight: 18, marginTop: 3, textAlign: "right", writingDirection: "rtl" },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 17, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 }, searchInput: { flex: 1, minHeight: 50, fontSize: 14, writingDirection: "rtl" },
  state: { minHeight: 300, alignItems: "center", justifyContent: "center", gap: 14 }, stateText: { fontSize: 13 }, stateCard: { marginTop: 22, alignItems: "center", paddingVertical: 30 }, stateIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" }, emptyTitle: { fontSize: 18, fontWeight: "900", marginTop: 14 }, emptyText: { fontSize: 12, lineHeight: 21, textAlign: "center", marginVertical: 8, writingDirection: "rtl" },
  hero: { borderRadius: 28, padding: 22, overflow: "hidden", marginTop: 8 },
});
