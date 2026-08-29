import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark } from "@/src/components/Brand";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

type Action = { label: string; href: string };
type Reply = { answer: string; actions: Action[]; suggestions?: string[] };
type Message = { id: string; role: "user" | "assistant"; text: string; actions?: Action[]; suggestions?: string[] };

const initial: Message = {
  id: "welcome",
  role: "assistant",
  text: "أهلًا بك، أنا مساعد مراس الذكي. اسألني عن الجامعات والتخصصات والمواد والتسجيل والدفع والمشغل وطلب مادة والدعم.",
  suggestions: ["ما لقيت مادتي", "كيف أشاهد درسًا مجانيًا؟", "كيف أتواصل مع الدعم؟"],
};

function mobileRoute(href: string) {
  if (/^https:\/\//.test(href)) return href;
  const path = href.split(/[?#]/)[0] || "/";
  const query = new URLSearchParams(href.split("?")[1] || "");
  if (path === "/request-course" || query.get("view") === "requests") return "/requests";
  if (path === "/support") return "/support";
  if (path === "/contact") return "/contact";
  if (path === "/cart") return "/cart";
  if (path === "/favorites") return "/favorites";
  if (path === "/dashboard") {
    const view = query.get("view");
    if (view === "notifications") return "/notifications";
    if (view === "account") return "/profile";
    if (view === "requests") return "/requests";
    if (view === "orders") return "/(tabs)/account";
    return "/(tabs)/learning";
  }
  if (path === "/courses") return "/(tabs)/courses";
  if (path.startsWith("/courses/")) return path.replace("/courses/", "/course/");
  if (path.startsWith("/learn/")) return path.replace("/learn/", "/course/");
  if (path === "/universities") return "/(tabs)/universities";
  if (path.startsWith("/universities/")) return path.replace("/universities/", "/university/");
  if (["/login", "/register"].includes(path)) return `/(auth)${path}`;
  if (["/admin", "/supervisor", "/notifications"].includes(path)) return path;
  return "/support";
}

export default function Assistant() {
  const { colors, dark } = useTheme();
  const { isRTL } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([initial]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<FlatList<Message>>(null);
  const history = useMemo(() => messages.slice(-8).map((item) => ({ role: item.role, text: item.text })), [messages]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated }));
  }, []);

  const send = useCallback(async (question?: string) => {
    const text = (question ?? input).trim();
    if (text.length < 2 || sending) return;
    setInput("");
    const userMessage: Message = { id: `u-${Date.now()}-${Math.random()}`, role: "user", text };
    setMessages((rows) => [...rows, userMessage]);
    setSending(true);
    scrollToBottom();
    try {
      const reply = await api<Reply>("/api/assistant", {
        method: "POST",
        body: jsonBody({ question: text, history }),
        timeoutMs: 30_000,
      });
      setMessages((rows) => [...rows, {
        id: `a-${Date.now()}-${Math.random()}`,
        role: "assistant",
        text: reply.answer,
        actions: reply.actions,
        suggestions: reply.suggestions,
      }]);
    } catch (reason) {
      setMessages((rows) => [...rows, {
        id: `e-${Date.now()}-${Math.random()}`,
        role: "assistant",
        text: reason instanceof ApiError ? reason.message : "تعذر الوصول للمساعد الآن. يمكنك فتح الدعم مباشرة.",
      }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollToBottom(), 80);
    }
  }, [history, input, scrollToBottom, sending]);

  const openAction = async (href: string) => {
    const route = mobileRoute(href);
    if (/^https:\/\//.test(route)) await Linking.openURL(route);
    else router.push(route as never);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const mine = item.role === "user";
    return <View style={[styles.messageRow, mine ? styles.userRow : styles.assistantRow]}>
      <View style={[styles.bubble, mine ? styles.userBubble : styles.assistantBubble, { backgroundColor: mine ? colors.primary : colors.surface, borderColor: mine ? colors.primary : colors.border }]}>
        {!mine && <View style={styles.assistantLabel}><BrandMark size={27} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>مراس</Text></View>}
        <Text style={[styles.messageText, { color: mine ? "#FFFFFF" : colors.text }]}>{item.text}</Text>
        {!!item.actions?.length && <View style={styles.actions}>{item.actions.map((action) => <Pressable key={`${item.id}-${action.href}`} onPress={() => void openAction(action.href)} style={[styles.action, { backgroundColor: mine ? "rgba(255,255,255,.14)" : colors.surfaceAlt }]}><Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={14} color={mine ? "#FFF" : colors.primary} /><Text numberOfLines={2} style={{ color: mine ? "#FFF" : colors.primary, fontSize: 10, fontWeight: "800", flexShrink: 1 }}>{action.label}</Text></Pressable>)}</View>}
        {!!item.suggestions?.length && <View style={styles.suggestions}>{item.suggestions.map((suggestion) => <Pressable key={`${item.id}-${suggestion}`} onPress={() => void send(suggestion)} style={[styles.suggestion, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}><Text style={{ color: colors.textSoft, fontSize: 9, textAlign: "right" }}>{suggestion}</Text></Pressable>)}</View>}
      </View>
    </View>;
  };

  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={() => router.back()} style={[styles.close, { backgroundColor: colors.surface }]}><Ionicons name="close" size={23} color={colors.text} /></Pressable>
      <View style={styles.headCopy}><Text style={[styles.title, { color: colors.text }]}>مساعد مراس</Text><Text style={[styles.online, { color: colors.success }]}>● متصل بسياق المنصة{user ? " وحسابك" : ""}</Text></View>
      <BrandMark size={50} whiteTile={!dark} />
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={styles.flex}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        removeClippedSubviews={false}
        onContentSizeChange={() => scrollToBottom(false)}
        ListFooterComponent={sending ? <View style={[styles.typing, { backgroundColor: colors.surface, borderColor: colors.border }]}><ActivityIndicator size="small" color={colors.primary} /><Text style={{ color: colors.textSoft, fontSize: 10 }}>يراجع سياق حسابك...</Text></View> : <View style={{ height: 2 }} />}
      />
      <View style={[styles.composerWrap, { paddingBottom: Math.max(8, insets.bottom), backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable disabled={input.trim().length < 2 || sending} onPress={() => void send()} style={[styles.send, { backgroundColor: input.trim().length >= 2 && !sending ? colors.primary : colors.surfaceAlt }]}><Ionicons name="arrow-up" size={21} color={input.trim().length >= 2 && !sending ? "#FFF" : colors.textSoft} /></Pressable>
          <TextInput
            multiline
            value={input}
            onChangeText={setInput}
            onFocus={() => setTimeout(() => scrollToBottom(), 160)}
            placeholder="اسأل عن أي شيء في مراس..."
            placeholderTextColor={colors.textSoft}
            style={[styles.input, { color: colors.text }]}
           
            maxLength={500}
            returnKeyType="default"
            blurOnSubmit={false}
          />
          {!!input && <Pressable hitSlop={10} onPress={() => { setInput(""); Keyboard.dismiss(); }}><Ionicons name="close-circle" size={19} color={colors.textSoft} /></Pressable>}
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, flex: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 16, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  close: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headCopy: { flex: 1, alignItems: "flex-start" }, title: { fontSize: 17, fontWeight: "900" }, online: { fontSize: 8, fontWeight: "700", marginTop: 3 },
  messages: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 12, gap: 10, flexGrow: 1 },
  messageRow: { width: "100%", flexDirection: "row" }, userRow: { justifyContent: "flex-end" }, assistantRow: { justifyContent: "flex-start" },
  bubble: { maxWidth: "88%", minWidth: 52, flexShrink: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 11 },
  userBubble: { borderBottomRightRadius: 6 }, assistantBubble: { borderBottomLeftRadius: 6 },
  assistantLabel: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  messageText: { flexShrink: 1, fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl" },
  actions: { gap: 7, marginTop: 10 }, action: { minHeight: 38, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }, suggestion: { minHeight: 34, maxWidth: "100%", borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, justifyContent: "center" },
  typing: { alignSelf: "flex-start", minHeight: 42, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, marginTop: 4, flexDirection: "row", gap: 8, alignItems: "center" },
  composerWrap: { paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  composer: { minHeight: 56, maxHeight: 146, borderWidth: 1, borderRadius: 20, padding: 7, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  input: { flex: 1, maxHeight: 122, minHeight: 40, paddingHorizontal: 6, paddingTop: 9, paddingBottom: 8, fontSize: 12, writingDirection: "rtl", textAlignVertical: "top" },
  send: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
