import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "./ScaledText";
import { AppButton, Card, EmptyState, Field, LoadingState } from "./ui";
import { StudyFileTools } from "./study-file-tools";
import { StudyRichText } from "./study-rich-text";
import { AiReportButton } from "./AiReportButton";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

type Resource = { id: number; title: string; contentType: string; lessonId: string | null };
type Message = { id: number; role: string; content: string; createdAt: string };
type Thread = { messages: Message[]; source: { title: string; version: string }; conversationId: number | null };
const starters = ["اشرح أهم أفكار هذا الدرس", "اشرح معادلات الملف خطوة بخطوة", "ما الفرق بين أهم المصطلحات؟"];

export function LessonAiTools({ courseSlug, lessonId, mode }: { courseSlug: string; lessonId: string; mode: "quiz" | "tutor" }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["lesson-ai-resources", user?.id, courseSlug, lessonId], queryFn: ({ signal }) => api<{ resources: Resource[] }>(`/api/course-resources?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`, { signal }), enabled: Boolean(user) });
  if (!user) return <EmptyState icon="lock-closed-outline" title="سجّل الدخول لاستخدام أدوات الدرس" text="تتاح الأدوات عند وجود اشتراك وملف معتمد لهذا الدرس." />;
  if (query.isLoading) return <LoadingState label="نجهّز ملف الدرس المعتمد…" />;
  if (!query.data) return <EmptyState icon="cloud-offline-outline" title="تعذر تحميل ملف الدرس" text={query.error?.message || "حاول مجددًا"} action={<AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} />} />;
  const supported = query.data.resources.filter((file) => /pdf|wordprocessingml|presentationml|text\/|image\/(png|jpeg)/.test(file.contentType));
  const specific = supported.filter((file) => file.lessonId === lessonId);
  const files = specific.length ? specific : supported.filter((file) => !file.lessonId);
  if (!files.length) return <EmptyState icon="document-outline" title="بانتظار ملف الدرس" text="تتاح الأداة عند ربط الإدارة ملفًا مدعومًا واعتماده. لن تحتاج لإعادة رفع الملف." />;
  return mode === "quiz" ? <StudyFileTools action="quiz" resources={files} scope={`${courseSlug}.${lessonId}`} /> : <TutorFiles key={`${user.id}:${lessonId}:${files.map((file) => file.id).join(",")}`} files={files} lessonId={lessonId} userId={user.id} />;
}

function TutorFiles({ files, lessonId, userId }: { files: Resource[]; lessonId: string; userId: number }) {
  const [selected, setSelected] = useState(files[0]!.id);
  const { colors } = useTheme();
  const { rowDirection } = useLanguage();
  return <View style={styles.tutorScreen}>
    <View style={[styles.intro, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.introTop, { flexDirection: rowDirection }]}><View style={[styles.introIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="school-outline" size={24} color={colors.primary} /></View><View style={styles.flex}><Text accessibilityRole="header" style={[styles.introTitle, { color: colors.text }]}>المعلم الذكي</Text><Text style={[styles.introEyebrow, { color: colors.primary }]}>اسأل من مرجع هذا الدرس</Text></View></View>
      <Text style={[styles.introCopy, { color: colors.textSoft }]}>يجيب من ملف الدرس المعتمد، ويخبرك بوضوح إذا لم يجد الإجابة فيه. راجع الشرح مع مرجع المقرر.</Text>
    </View>
    {files.length > 1 ? <View style={styles.sources}><Text style={[styles.sourcesLabel, { color: colors.text }]}>اختر الملف المرجعي</Text><View style={[styles.sourceButtons, { flexDirection: rowDirection }]}>{files.map((file) => <AppButton key={file.id} title={file.title} full={false} variant={selected === file.id ? "primary" : "soft"} onPress={() => setSelected(file.id)} />)}</View></View> : <View style={[styles.sourceSingle, { borderColor: colors.border, flexDirection: rowDirection }]}><Ionicons name="document-text-outline" size={19} color={colors.primary} /><Text numberOfLines={2} style={[styles.sourceText, { color: colors.textSoft }]}>المرجع: {files[0]!.title}</Text></View>}
    <Tutor key={`${userId}:${lessonId}:${selected}`} resourceId={selected} lessonId={lessonId} userId={userId} />
  </View>;
}

function Tutor({ resourceId, lessonId, userId }: { resourceId: number; lessonId: string; userId: number }) {
  const { colors } = useTheme();
  const { rowDirection } = useLanguage();
  const cache = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyOffset, setHistoryOffset] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const path = `/api/course-resources/${resourceId}/tutor?lesson=${encodeURIComponent(lessonId)}`;
  const key = ["lesson-tutor", userId, lessonId, resourceId];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => api<Thread>(path, { signal }), staleTime: 0 });
  useEffect(() => () => pending.current?.abort(), []);

  async function send() {
    if (busy || !query.data || text.trim().length < 2) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const data = await api<Thread>(path, { method: "POST", body: jsonBody({ text: text.trim(), requestId: Crypto.randomUUID() }), signal: controller.signal, timeoutMs: 180000 });
      if (!controller.signal.aborted) {
        cache.setQueryData<Thread>(key, (old) => ({ ...data, messages: [...(old?.source.version === data.source.version ? old.messages : []), ...data.messages] }));
        setText("");
        setHistoryOffset(0);
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تجهيز الإجابة؛ سؤالك محفوظ في الحقل");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  // Mount at most twelve rich-text messages to keep long conversations smooth.
  const messages = query.data?.messages || [];
  const start = Math.max(0, messages.length - 12 - historyOffset);
  const visible = messages.slice(start, start + 12);
  return <View style={styles.chat}>
    {messages.length > 12 ? <View style={[styles.pager, { flexDirection: rowDirection }]}><AppButton title="رسائل أقدم" full={false} variant="soft" disabled={start === 0} onPress={() => setHistoryOffset((value) => Math.min(messages.length - 12, value + 12))} /><AppButton title="رسائل أحدث" full={false} variant="soft" disabled={historyOffset === 0} onPress={() => setHistoryOffset((value) => Math.max(0, value - 12))} /><Text style={[styles.pagerCount, { color: colors.textSoft }]}>{start + 1}–{Math.min(start + 12, messages.length)} / {messages.length}</Text></View> : null}
    {query.isLoading ? <LoadingState label="جارٍ استعادة محادثتك…" /> : query.isError ? <EmptyState icon="cloud-offline-outline" title="تعذر استعادة المحادثة" text={query.error.message} action={<AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} />} /> : !messages.length ? <Card style={styles.starters}><View style={[styles.startersHead, { flexDirection: rowDirection }]}><Ionicons name="chatbubbles-outline" size={23} color={colors.primary} /><Text style={[styles.startersTitle, { color: colors.text }]}>من أين نبدأ؟</Text></View><Text style={[styles.startersCopy, { color: colors.textSoft }]}>اختر سؤالًا للبدء، أو اكتب ما تريد فهمه من الدرس.</Text>{starters.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} onPress={() => setText(value)} style={({ pressed }) => [styles.starter, { flexDirection: rowDirection, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.background }]}><Ionicons name="sparkles-outline" size={19} color={colors.primary} /><Text style={[styles.starterText, { color: colors.text }]}>{value}</Text></Pressable>)}</Card> : visible.map((item) => <Card key={item.id} style={[styles.message, { borderColor: item.role === "user" ? colors.primary : colors.border, backgroundColor: item.role === "user" ? colors.surfaceAlt : colors.surface }]}>
      <View style={[styles.messageHead, { flexDirection: rowDirection }]}><View style={[styles.messageMark, { backgroundColor: item.role === "user" ? colors.primary : colors.surfaceAlt }]}><Ionicons name={item.role === "user" ? "person-outline" : "school-outline"} size={17} color={item.role === "user" ? colors.onPrimary : colors.primary} /></View><Text style={[styles.messageRole, { color: colors.text }]}>{item.role === "user" ? "أنت" : "المعلم الذكي"}</Text></View>
      <StudyRichText content={item.content} />
      {item.role === "assistant" ? <View style={[styles.reference, { borderColor: colors.border }]}><Text style={[styles.referenceText, { color: colors.textSoft }]}>المرجع: {query.data?.source.title}</Text><AiReportButton source="message" reference={String(item.id)} content={item.content} /></View> : null}
    </Card>)}
    {busy ? <LoadingState label="يقرأ المعلم ملف الدرس ويجهّز الشرح…" /> : null}
    {error ? <View style={[styles.error, { backgroundColor: colors.surfaceAlt, borderColor: colors.danger }]}><Ionicons name="alert-circle-outline" size={21} color={colors.danger} /><Text selectable accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>{error}</Text></View> : null}
    <Card style={styles.composer}><Text style={[styles.composerTitle, { color: colors.text }]}>اسأل عن هذا الدرس</Text><Field label="سؤالك عن الدرس" multiline numberOfLines={3} value={text} maxLength={8000} editable={!busy} onChangeText={setText} placeholder="اسأل عن فكرة، مصطلح أو معادلة…" /><AppButton title="إرسال السؤال" icon="send-outline" disabled={busy || !query.data || text.trim().length < 2} loading={busy} onPress={() => void send()} /></Card>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, tutorScreen: { gap: 16 }, intro: { borderWidth: 1, borderRadius: 23, padding: 19, gap: 13 }, introTop: { alignItems: "center", gap: 12 }, introIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" }, introTitle: { fontSize: 22, lineHeight: 32, fontWeight: "900" }, introEyebrow: { fontSize: 12, lineHeight: 20, fontWeight: "800" }, introCopy: { fontSize: 13, lineHeight: 24 },
  sources: { gap: 9 }, sourcesLabel: { fontSize: 14, lineHeight: 23, fontWeight: "800" }, sourceButtons: { flexWrap: "wrap", gap: 8 }, sourceSingle: { borderWidth: 1, borderRadius: 15, padding: 12, minHeight: 54, alignItems: "center", gap: 8 }, sourceText: { fontSize: 12, lineHeight: 20, flex: 1 },
  chat: { gap: 14 }, pager: { flexWrap: "wrap", alignItems: "center", gap: 8 }, pagerCount: { fontSize: 12 },
  starters: { gap: 11, padding: 18 }, startersHead: { alignItems: "center", gap: 9 }, startersTitle: { fontSize: 19, fontWeight: "900" }, startersCopy: { fontSize: 13, lineHeight: 23 }, starter: { borderWidth: 1, borderRadius: 15, minHeight: 54, alignItems: "center", gap: 10, paddingHorizontal: 13 }, starterText: { fontSize: 13, lineHeight: 22, fontWeight: "700", flex: 1 },
  message: { gap: 12, padding: 17 }, messageHead: { alignItems: "center", gap: 8 }, messageMark: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" }, messageRole: { fontSize: 13, fontWeight: "900" }, reference: { borderTopWidth: 1, paddingTop: 10, gap: 8 }, referenceText: { fontSize: 11, lineHeight: 19 },
  error: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", gap: 8, alignItems: "center" }, errorText: { flex: 1, fontSize: 13, lineHeight: 22 }, composer: { gap: 10, padding: 18 }, composerTitle: { fontSize: 17, fontWeight: "900" },
});
