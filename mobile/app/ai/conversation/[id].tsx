import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { AppButton, Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type AiMessage = { id: number; conversationId: number; role: "user" | "assistant"; service: "chat" | "summary" | "translation" | "quiz"; content: string; fileId: number | null; model: string | null; createdAt: string };
type AiFile = { id: number; conversationId: number | null; originalName: string; contentType: string; sizeBytes: number; status: string; scanStatus: string; createdAt: string };
type AiArtifact = { id: number; conversationId: number | null; fileId: number; kind: "summary" | "translation"; title: string; content: string; createdAt: string };
type Conversation = { id: number; title: string; kind: string; status: string; preview: string; createdAt: string; updatedAt: string };
type ConversationResponse = { ok: true; conversation: Conversation; messages: AiMessage[]; files: AiFile[]; artifacts: AiArtifact[] };
type MessageResponse = { ok: true; userMessage: AiMessage; message: AiMessage; conversation: Conversation };

export default function AiConversationScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const { user } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["ai-conversation", id, user?.id], queryFn: () => api<ConversationResponse>(`/api/ai/conversations/${id}`), enabled: Boolean(user && Number.isInteger(id) && id > 0) });
  const chronology = useMemo(() => query.data?.messages.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) || [], [query.data?.messages]);

  if (!user) return <Screen><AppHeader title="أدوات مراس" back /><EmptyState title="سجّل الدخول أولًا" text="هذه المحادثة خاصة بحساب صاحبها." action={<AppButton title="تسجيل الدخول" onPress={() => router.replace("/(auth)/login")} />} /></Screen>;
  if (!Number.isInteger(id) || id <= 0) return <Screen><AppHeader title="أدوات مراس" back /><EmptyState title="رابط المحادثة غير صالح" text="ارجع إلى سجل أدوات مراس واختر المحادثة من هناك." /></Screen>;
  if (query.isLoading) return <Screen><AppHeader title="أدوات مراس" back /><LoadingState label="تحميل المحادثة…" /></Screen>;
  if (query.isError || !query.data) return <Screen><AppHeader title="أدوات مراس" back /><EmptyState icon="cloud-offline-outline" title="تعذر فتح المحادثة" text={query.error instanceof Error ? query.error.message : "حاول مرة أخرى."} action={<AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} />} /></Screen>;

  const send = async () => {
    const text = input.trim();
    if (text.length < 2 || sending) return;
    setSending(true); setError(""); setInput("");
    try {
      const response = await api<MessageResponse>(`/api/ai/conversations/${id}/messages`, { method: "POST", body: jsonBody({ text, requestId: `mobile-chat-${id}-${Date.now()}` }), timeoutMs: 3 * 60_000 });
      queryClient.setQueryData<ConversationResponse>(["ai-conversation", id, user.id], (current) => current ? { ...current, conversation: response.conversation, messages: [...current.messages, response.userMessage, response.message] } : current);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["ai-status"] }), queryClient.invalidateQueries({ queryKey: ["ai-conversations"] })]);
    } catch (reason) { setInput(text); setError(reason instanceof ApiError ? reason.message : "تعذر إرسال الرسالة"); }
    finally { setSending(false); }
  };

  const remove = () => Alert.alert("حذف المحادثة", "سيُحذف السجل والنتائج المرتبطة بهذه المحادثة من حسابك. هل أنت متأكد؟", [
    { text: "إلغاء", style: "cancel" },
    { text: "حذف", style: "destructive", onPress: () => void (async () => {
      try { await api(`/api/ai/conversations/${id}`, { method: "DELETE" }); await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] }); router.replace("/(tabs)/ai"); }
      catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر حذف المحادثة"); }
    })() },
  ]);

  const data = query.data;
  return <Screen keyboard>
    <AppHeader title={data.conversation.title || "محادثة أدوات مراس"} subtitle="سجل خاص محفوظ في حسابك" back />

    {!!data.files.length && <Card style={styles.filesCard}><View style={styles.filesTitle}><Ionicons name="documents-outline" size={18} color={colors.primary} /><Text style={[styles.filesTitleText, { color: colors.text }]}>ملفات المحادثة</Text></View>{data.files.map((file) => <View key={file.id} style={[styles.fileRow, { borderTopColor: colors.border }]}><View style={[styles.fileIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="document-text-outline" size={18} color={colors.primary} /></View><View style={styles.fileCopy}><Text numberOfLines={1} style={[styles.fileName, { color: colors.text }]}>{file.originalName}</Text><Text style={[styles.fileMeta, { color: colors.textSoft }]}>{(file.sizeBytes / 1024 / 1024).toFixed(1)} م.ب · {file.scanStatus}</Text></View><Ionicons name="shield-checkmark-outline" size={17} color={colors.success} /></View>)}</Card>}

    {!!data.artifacts.length && <><SectionTitle title="النتائج المحفوظة" subtitle="ملخصات وترجمات هذا الملف" /><View style={styles.artifacts}>{data.artifacts.map((artifact) => <Card key={artifact.id} style={styles.artifact}><View style={styles.artifactHead}><View style={[styles.artifactIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={artifact.kind === "summary" ? "sparkles-outline" : "language-outline"} size={20} color={colors.primary} /></View><View style={styles.artifactCopy}><Text style={[styles.artifactType, { color: colors.primary }]}>{artifact.kind === "summary" ? "ملخص" : "ترجمة"}</Text><Text style={[styles.artifactTitle, { color: colors.text }]}>{artifact.title}</Text></View></View><Text selectable style={[styles.artifactContent, { color: colors.text }]}>{artifact.content}</Text></Card>)}</View></>}

    <SectionTitle title="المحادثة" subtitle="اسأل عن أي جزئية بصياغتك" />
    <View style={styles.messages}>{chronology.length ? chronology.map((message) => {
      const mine = message.role === "user";
      return <View key={message.id} style={[styles.messageRow, mine ? styles.mineRow : styles.aiRow]}><View style={[styles.bubble, mine ? styles.mineBubble : styles.aiBubble, { backgroundColor: mine ? colors.primary : colors.surface, borderColor: mine ? colors.primary : colors.border }]}>{!mine ? <View style={styles.aiLabel}><View style={[styles.aiMark, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="sparkles" size={13} color={colors.primary} /></View><Text style={{ color: colors.primary, fontSize: 9, fontWeight: "900" }}>أدوات مراس</Text></View> : null}<Text selectable style={[styles.messageText, { color: mine ? "#FFF" : colors.text }]}>{message.content}</Text>{message.model && !mine ? <Text style={[styles.model, { color: colors.textSoft }]}>حُفظت الإجابة في سجلك</Text> : null}</View></View>;
    }) : <EmptyState icon="chatbubble-ellipses-outline" title="ابدأ المحادثة" text="اكتب سؤالك الأول، ويمكنك العودة إليه لاحقًا من أي جهاز." />}</View>

    <Card style={styles.composerCard}><TextInput multiline value={input} onChangeText={setInput} editable={!sending} placeholder="اكتب سؤالك لأدوات مراس…" placeholderTextColor={colors.textSoft} style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /><AppButton title={sending ? "تجهز أدوات مراس الإجابة…" : "إرسال"} icon="arrow-up-outline" loading={sending} disabled={input.trim().length < 2} onPress={() => void send()} />{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}</Card>

    <Pressable accessibilityRole="button" onPress={remove} style={[styles.deleteButton, { borderColor: `${colors.danger}55` }]}><Ionicons name="trash-outline" size={17} color={colors.danger} /><Text style={{ color: colors.danger, fontSize: 10, fontWeight: "900" }}>حذف هذه المحادثة</Text></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  filesCard: { gap: 3 }, filesTitle: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5 }, filesTitleText: { fontSize: 12, fontWeight: "900" }, fileRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, marginTop: 3 }, fileIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, fileCopy: { flex: 1, alignItems: "flex-start" }, fileName: { fontSize: 10, fontWeight: "800", textAlign: "right" }, fileMeta: { fontSize: 8, marginTop: 3 },
  artifacts: { gap: 9 }, artifact: { padding: 14 }, artifactHead: { flexDirection: "row", alignItems: "center", gap: 9 }, artifactIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, artifactCopy: { flex: 1, alignItems: "flex-start" }, artifactType: { fontSize: 8, fontWeight: "900" }, artifactTitle: { fontSize: 13, fontWeight: "900", textAlign: "right", marginTop: 2 }, artifactContent: { fontSize: 11, lineHeight: 22, textAlign: "right", writingDirection: "rtl", marginTop: 12 },
  messages: { gap: 9 }, messageRow: { width: "100%", flexDirection: "row" }, mineRow: { justifyContent: "flex-start" }, aiRow: { justifyContent: "flex-end" }, bubble: { maxWidth: "91%", paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderRadius: 19 }, mineBubble: { borderTopRightRadius: 6 }, aiBubble: { borderTopLeftRadius: 6 }, aiLabel: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }, aiMark: { width: 25, height: 25, borderRadius: 9, alignItems: "center", justifyContent: "center" }, messageText: { fontSize: 11, lineHeight: 21, textAlign: "right", writingDirection: "rtl" }, model: { fontSize: 7, marginTop: 7, textAlign: "right" },
  composerCard: { marginTop: 14 }, input: { minHeight: 112, maxHeight: 210, borderWidth: 1, borderRadius: 15, padding: 12, textAlign: "right", writingDirection: "rtl", textAlignVertical: "top", fontSize: 12, lineHeight: 20, marginBottom: 10 }, error: { fontSize: 9, lineHeight: 16, textAlign: "center", marginTop: 8 }, deleteButton: { minHeight: 48, borderWidth: 1, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
});
