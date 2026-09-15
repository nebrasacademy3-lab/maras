import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton } from "@/src/components/ui";
import { api, jsonBody, setAdminStepUpToken } from "@/src/lib/api";
import { registerNativeInteractions, type NativeInteraction } from "@/src/lib/interaction-events";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
export function NativeInteractionProvider() {
  const [queue, setQueue] = useState<NativeInteraction[]>([]); const pending = useRef<NativeInteraction[]>([]);
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  useEffect(() => {
    const off = registerNativeInteractions(item => { pending.current = [...pending.current, item]; setQueue(pending.current); }, (message, tone) => { if (timer.current) clearTimeout(timer.current); setToast({ message, tone }); timer.current = setTimeout(() => setToast(null), 6000); });
    return () => { off(); if (timer.current) clearTimeout(timer.current); pending.current.forEach(item => item.resolve(false)); pending.current = []; };
  }, []);
  function settle(value: unknown) { const [item, ...rest] = pending.current; pending.current = rest; setQueue(rest); item?.resolve(value); }
  return <>{toast && <View accessibilityLiveRegion="polite" style={{ position: "absolute", top: insets.top + 12, left: 16, right: 16, zIndex: 10000, borderRadius: 18, borderWidth: 1, borderColor: toast.tone === "error" ? colors.danger : colors.border, backgroundColor: colors.surface, padding: 16, flexDirection: "row-reverse", gap: 12, alignItems: "center", boxShadow: "0 8px 25px rgba(0,0,0,.16)" }}><Ionicons name={toast.tone === "error" ? "alert-circle-outline" : "checkmark-circle-outline"} size={22} color={toast.tone === "error" ? colors.danger : colors.success} /><Text selectable style={{ flex: 1, color: colors.text, fontSize: 14, lineHeight: 23, textAlign: "right" }}>{toast.message}</Text><Pressable accessibilityRole="button" accessibilityLabel="إغلاق الإشعار" hitSlop={12} onPress={() => setToast(null)}><Ionicons name="close" color={colors.textSoft} size={20} /></Pressable></View>}{queue[0] && <InteractionModal key={queue[0].id} item={queue[0]} settle={settle} />}</>;
}
function InteractionModal({ item, settle }: { item: NativeInteraction; settle: (value: unknown) => void }) {
  const { colors } = useTheme(); const { direction } = useLanguage(); const insets = useSafeAreaInsets();
  const [input, setInput] = useState(item.defaultValue || "");
  const [code, setCode] = useState(""); const [secret, setSecret] = useState(""); const [password, setPassword] = useState("");
  const [setup, setSetup] = useState(Boolean(item.setupRequired)); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  function cancel() { if (busy) return; settle(false); item.options?.onDismiss?.(); }
  async function verify() {
    if (item.kind === "prompt") { settle(input.trim()); return; }
    setBusy(true); setError("");
    try {
      if (item.kind === "verify") { settle(await item.verify!(code)); return; }
      const action = setup ? secret ? "verify" : "setup" : "stepUp";
      const result = await api<{ secret?: string; stepUpToken?: string; stepUpValid?: boolean }>("/api/admin/security/mfa", { method: "POST", body: jsonBody({ action, code, password }) });
      if (result.secret) { setSecret(result.secret); return; }
      if (result.stepUpToken) setAdminStepUpToken(result.stepUpToken);
      if (!setup || result.stepUpValid) settle(true);
      else { setSetup(false); setSecret(""); setCode(""); setPassword(""); setError("تم التفعيل. أدخل الرمز التالي لتأكيد العملية."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر التحقق"); }
    finally { setBusy(false); }
  }
  const inputStyle = { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 18, minHeight: 52 };
  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={cancel}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", paddingHorizontal: 20, paddingTop: Math.max(24, insets.top), paddingBottom: Math.max(24, insets.bottom) }}><View accessibilityViewIsModal style={{ direction, width: "100%", maxWidth: 550, maxHeight: "95%", alignSelf: "center", backgroundColor: colors.surface, borderRadius: 26, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}><View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}><View style={{ backgroundColor: colors.background, padding: 12, borderRadius: 16 }}><Ionicons name={item.kind === "alert" ? "information-circle-outline" : "shield-checkmark-outline"} size={28} color={colors.primary} /></View><Pressable accessibilityRole="button" accessibilityLabel="إلغاء وإغلاق النافذة" disabled={busy} onPress={cancel} hitSlop={12}><Ionicons name="close" size={24} color={colors.textSoft} /></Pressable></View><Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: "800", color: colors.text, textAlign: "right" }}>{item.title}</Text><Text selectable style={{ fontSize: 15, lineHeight: 26, color: colors.textSoft, textAlign: "right" }}>{item.message}</Text>
      {item.kind === "admin" && setup && <><Text style={{ color: colors.textSoft, lineHeight: 24 }}>أضف المفتاح يدويًا إلى تطبيق المصادقة. لا تشاركه أو ترسله للدعم.</Text><TextInput accessibilityLabel="كلمة المرور الحالية" placeholder="كلمة المرور الحالية" placeholderTextColor={colors.textSoft} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" style={inputStyle} /></>}
      {secret && <Text selectable style={{ color: colors.text, padding: 15, borderRadius: 14, backgroundColor: colors.background, fontSize: 17, textAlign: "center", writingDirection: "ltr" }}>{secret}</Text>}
      {(item.kind === "verify" || item.kind === "admin" && (!setup || secret)) && <TextInput autoFocus accessibilityLabel="رمز تطبيق المصادقة أو الاستعادة" autoComplete="one-time-code" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} keyboardType={item.kind === "verify" ? "default" : "number-pad"} maxLength={item.kind === "verify" ? 28 : 6} placeholder={item.kind === "verify" ? "رمز المصادقة أو الاستعادة" : "000000"} placeholderTextColor={colors.textSoft} style={[inputStyle, { textAlign: "center", writingDirection: "ltr" }]} />}
      {item.kind === "prompt" && <TextInput autoFocus multiline accessibilityLabel="تفاصيل العملية" value={input} onChangeText={setInput} maxLength={1000} placeholderTextColor={colors.textSoft} style={[inputStyle, { textAlign: "right", minHeight: 100 }]} />}
      {error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger, fontSize: 14, lineHeight: 24 }}>{error}</Text>}
      {item.kind === "alert" ? <View style={{ gap: 10 }}>{item.buttons?.map((button, index) => <AppButton key={index} title={button.text || "حسنًا"} variant={button.style === "destructive" ? "danger" : button.style === "cancel" ? "soft" : "primary"} onPress={() => { settle(button.style !== "cancel"); button.onPress?.(); }} />)}</View> : <><AppButton title={item.kind === "prompt" ? "متابعة" : setup && !secret && item.kind === "admin" ? "إعداد المصادقة" : "تحقق وتابع"} loading={busy} onPress={() => void verify()} /><AppButton title="إلغاء والعودة" disabled={busy} variant="soft" onPress={cancel} /></>}
    </ScrollView></View></KeyboardAvoidingView></Modal>;
}
