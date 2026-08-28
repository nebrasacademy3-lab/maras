import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, type StyleProp, type TextInputProps, View, type ViewStyle } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/src/providers/ThemeProvider";
import { metrics } from "@/src/theme/colors";
import { MobileFooter } from "@/src/components/MobileFooter";
import { BrandMark } from "@/src/components/Brand";

export function Screen({ children, scroll = true, padded = true, keyboard = false, footer, style }: { children: React.ReactNode; scroll?: boolean; padded?: boolean; keyboard?: boolean; footer?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const showFooter = footer ?? scroll;
  const body = <View style={styles.screenContent}>{children}{showFooter ? <MobileFooter /> : null}</View>;
  const content = scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, padded && styles.padded, style]}>{body}</ScrollView> : <View style={[styles.flex, padded && styles.padded, style]}>{body}</View>;
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.flex, { backgroundColor: colors.background }]}>{keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>{content}</KeyboardAvoidingView> : content}</SafeAreaView>;
}

export function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: ViewStyle }) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => { Animated.timing(value, { toValue: 1, delay, duration: 260, useNativeDriver: true }).start(); return () => value.stopAnimation(); }, [delay, value]);
  return <Animated.View style={[style, { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>{children}</Animated.View>;
}

export function AppButton({ title, onPress, icon, variant = "primary", disabled = false, loading = false, full = true }: { title: string; onPress?: () => void; icon?: React.ComponentProps<typeof Ionicons>["name"]; variant?: "primary" | "soft" | "ghost" | "danger"; disabled?: boolean; loading?: boolean; full?: boolean }) {
  const { colors } = useTheme();
  const contentColor = variant === "primary" || variant === "danger" ? "#FFFFFF" : colors.primary;
  const background = variant === "primary" ? colors.primary : variant === "danger" ? colors.danger : variant === "soft" ? colors.surfaceAlt : "transparent";
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, full && styles.buttonFull, { backgroundColor: background, borderColor: variant === "ghost" ? colors.border : background, opacity: disabled ? .45 : pressed ? .8 : 1, transform: [{ scale: pressed ? .97 : 1 }] }]}>{loading ? <ActivityIndicator color={contentColor} /> : <>{icon && <Ionicons name={icon} size={18} color={contentColor} />}<Text style={[styles.buttonText, { color: contentColor }]}>{title}</Text></>}</Pressable>;
}

export function Field({ label, error, icon, ...props }: TextInputProps & { label: string; error?: string; icon?: React.ComponentProps<typeof Ionicons>["name"] }) {
  const { colors } = useTheme();
  return <View style={styles.fieldWrap}><Text style={[styles.label, { color: colors.text }]}>{label}</Text><View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border }]}>{icon && <Ionicons name={icon} size={19} color={colors.textSoft} />}<TextInput {...props} placeholderTextColor={colors.textSoft} selectionColor={colors.primary} style={[styles.input, { color: colors.text }, props.style]} textAlign="right" /></View>{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, dark } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowOpacity: dark ? .22 : .06 }, style]}>{children}</View>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={styles.sectionHead}><View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>{subtitle && <Text style={[styles.sectionSub, { color: colors.textSoft }]}>{subtitle}</Text>}</View>{action}</View>;
}

export function SearchBox({ value, onChangeText, placeholder = "ابحث..." }: { value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  const { colors } = useTheme();
  return <View accessibilityRole="search" style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" size={20} color={colors.textSoft} /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textSoft} style={[styles.searchInput, { color: colors.text }]} textAlign="right" returnKeyType="search" /><Pressable accessibilityRole="button" accessibilityLabel="مسح البحث" onPress={() => onChangeText("")} hitSlop={12}>{value ? <Ionicons name="close-circle" size={19} color={colors.textSoft} /> : null}</Pressable></View>;
}

export function LoadingState({ label = "جارٍ تحميل مراس..." }: { label?: string }) {
  const { colors } = useTheme();
  const [pulse] = useState(() => new Animated.Value(.7));
  useEffect(() => { const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }), Animated.timing(pulse, { toValue: .7, duration: 620, useNativeDriver: true })])); loop.start(); return () => loop.stop(); }, [pulse]);
  return <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.state}><Animated.View style={{ opacity: pulse, transform: [{ scale: pulse }] }}><BrandMark size={82} whiteTile /></Animated.View><ActivityIndicator color={colors.primary} /><Text style={[styles.stateText, { color: colors.textSoft }]}>{label}</Text><View style={[styles.loadingTrack, { backgroundColor: colors.surfaceAlt }]}><Animated.View style={[styles.loadingFill, { backgroundColor: colors.primary, opacity: pulse }]} /></View></View>;
}

export function EmptyState({ icon = "sparkles-outline", title, text, action }: { icon?: React.ComponentProps<typeof Ionicons>["name"]; title: string; text: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return <Card style={styles.stateCard}><View style={[styles.stateIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={30} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyText, { color: colors.textSoft }]}>{text}</Text>{action ? <View style={styles.stateAction}>{action}</View> : null}</Card>;
}

export function ErrorState({ title = "تعذر تحميل المحتوى", text = "تحقق من اتصالك ثم حاول مرة أخرى.", onRetry }: { title?: string; text?: string; onRetry?: () => void }) {
  return <EmptyState icon="cloud-offline-outline" title={title} text={text} action={onRetry ? <AppButton title="إعادة المحاولة" icon="refresh-outline" variant="soft" onPress={onRetry} /> : undefined} />;
}

export function HeroGradient({ children }: { children: React.ReactNode }) {
  return <LinearGradient colors={["#061B49", "#0A56CF", "#7038E8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>{children}</LinearGradient>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, screenContent: { flexGrow: 1, direction: "rtl" }, scroll: { flexGrow: 1, paddingBottom: 120 }, padded: { paddingHorizontal: metrics.screen },
  button: { minHeight: 50, paddingHorizontal: 18, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 8 }, buttonFull: { width: "100%" }, buttonText: { fontSize: 14, fontWeight: "800" },
  fieldWrap: { gap: 7, marginBottom: 14 }, label: { fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, inputWrap: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", gap: 9 }, input: { flex: 1, minHeight: 50, fontSize: 14, writingDirection: "rtl" }, error: { fontSize: 11, textAlign: "right" },
  card: { borderRadius: metrics.radius, borderWidth: 1, padding: 16, shadowColor: "#061A42", shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 24, marginBottom: 12 }, sectionTitle: { fontSize: 21, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, sectionSub: { fontSize: 11, lineHeight: 18, marginTop: 3, textAlign: "right", writingDirection: "rtl" },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 17, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", gap: 9 }, searchInput: { flex: 1, minHeight: 50, fontSize: 14, writingDirection: "rtl" },
  state: { minHeight: 300, alignItems: "center", justifyContent: "center", gap: 11 }, stateText: { fontSize: 12, textAlign: "center" }, loadingTrack: { width: 110, height: 4, borderRadius: 2, overflow: "hidden", marginTop: 3 }, loadingFill: { width: "62%", height: 4, borderRadius: 2, alignSelf: "flex-end" }, stateCard: { marginTop: 22, alignItems: "center", paddingVertical: 30 }, stateIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" }, emptyTitle: { fontSize: 18, fontWeight: "900", marginTop: 14, textAlign: "center" }, emptyText: { fontSize: 12, lineHeight: 21, textAlign: "center", marginVertical: 8, writingDirection: "rtl" }, stateAction: { width: "100%", marginTop: 8 },
  hero: { borderRadius: 28, padding: 22, overflow: "hidden", marginTop: 8 },
});
