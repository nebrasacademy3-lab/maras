import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { absoluteUrl, api, apiUpload, ApiError, formatUploadProgress, jsonBody, STORE_COMMERCE_ENABLED, type ApiUploadProgress } from "@/src/lib/api";
import { assetMimeType } from "@/src/lib/file-types";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type AiServiceName = "chat" | "summary" | "translation" | "quiz";
type AiUsage = { service: AiServiceName; enabled: boolean; limit: number; used: number; remaining: number; model: string; maxFileBytes: number };
type AiStatusResponse = {
  ok: true;
  period: string;
  entitlement: { tier: "free" | "subscriber"; active: boolean; source: "free" | "course" | "paid" | "admin" | "gift" | "referral"; expiresAt: string | null; monthlyPrice: number; currency: "SAR" };
  services: Record<AiServiceName, AiUsage>;
  supportedFiles: { mimeType: string; extensions: string[]; maxBytes: number }[];
  deepLinks: { home: string; conversation: string; quiz: string; subscribe: string };
};
type Conversation = { id: number; title: string; kind: string; status: string; preview: string; createdAt: string; updatedAt: string };
type ConversationsResponse = { ok: true; conversations: Conversation[]; nextCursor: string | null };
type AiFile = { id: number; conversationId: number | null; originalName: string; contentType: string; sizeBytes: number; status: string; scanStatus: string; createdAt: string };
type UploadResponse = { ok: true; file: AiFile; availableActions: ("summary" | "translation" | "quiz")[]; deepLink: string };
type Artifact = { id: number; conversationId: number | null; fileId: number; kind: "summary" | "translation"; title: string; content: string; createdAt: string };
type ActionResponse = { ok: true; action: "summary" | "translation"; artifact: Artifact; usage: AiUsage; deepLink: string } | { ok: true; action: "quiz"; quiz: { id: number }; usage: AiUsage; deepLink: string };
type CreatedConversation = { ok: true; conversation: Conversation; deepLink: string };

const serviceCards: { service: AiServiceName; icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; text: string; colors: [string, string] }[] = [
  { service: "summary", icon: "sparkles-outline", title: "تلخيص السلايدات", text: "أهم الأفكار والقوانين في ملخص منظم", colors: ["#155EEF", "#6E3DE5"] },
  { service: "translation", icon: "language-outline", title: "ترجمة أكاديمية", text: "ترجمة تراعي المصطلحات والسياق العلمي", colors: ["#0E7490", "#14B8A6"] },
  { service: "quiz", icon: "options-outline", title: "اختبار من الملف", text: "بطاقات تفاعلية مع شرح الإجابة", colors: ["#B45309", "#F59E0B"] },
  { service: "chat", icon: "chatbubble-ellipses-outline", title: "محادثة تفاعلية", text: "اسأل بطريقتك واحتفظ بالسجل كاملًا", colors: ["#7C3AED", "#DB2777"] },
];

const sourceLabel: Record<AiStatusResponse["entitlement"]["source"], string> = {
  free: "الخطة المجانية",
  course: "مجانًا مع اشتراك مادة",
  paid: "اشتراك أدوات مراس",
  admin: "منحة من الإدارة",
  gift: "اشتراك هدية",
  referral: "مكافأة إحالة",
};

export default function MerasAiScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<"ar" | "en">("ar");
  const [busyAction, setBusyAction] = useState<AiServiceName | "upload" | "chat" | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<ApiUploadProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const status = useQuery({ queryKey: ["ai-status", user?.id], queryFn: () => api<AiStatusResponse>("/api/ai/status"), enabled: Boolean(user) });
  const conversations = useQuery({ queryKey: ["ai-conversations", user?.id], queryFn: () => api<ConversationsResponse>("/api/ai/conversations"), enabled: Boolean(user) });
  const enabledPickerTypes = useMemo(() => status.data?.supportedFiles.map((item) => item.mimeType).filter(Boolean) || ["application/pdf", "image/png", "image/jpeg", "text/plain"], [status.data]);

  if (!user) return <Screen><AppHeader title="أدوات مراس" subtitle="مساعد مذاكرتك الذكي" /><EmptyState icon="sparkles-outline" title="سجّل الدخول إلى أدوات مراس" text="احفظ الملخصات والترجمات والاختبارات والمحادثات في حساب واحد." action={<AppButton title="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (status.isLoading) return <Screen><AppHeader title="أدوات مراس" /><LoadingState label="نجهّز أدوات أدوات مراس…" /></Screen>;
  if (status.isError || !status.data) return <Screen><AppHeader title="أدوات مراس" /><EmptyState icon="cloud-offline-outline" title="أدوات مراس غير متاح الآن" text={status.error instanceof Error ? status.error.message : "حاول مرة أخرى بعد قليل."} action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void status.refetch()} />} /></Screen>;

  const ai = status.data;
  const createChat = async () => {
    setBusyAction("chat"); setMessage("");
    try {
      const response = await api<CreatedConversation>("/api/ai/conversations", { method: "POST", body: jsonBody({ title: "محادثة جديدة", kind: "chat" }) });
      await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      router.push({ pathname: "/ai/conversation/[id]", params: { id: String(response.conversation.id) } });
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر بدء المحادثة"); }
    finally { setBusyAction(null); }
  };

  const pickAndUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: enabledPickerTypes, multiple: false, copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    const maximum = Math.max(...ai.supportedFiles.map((item) => item.maxBytes), ai.services.summary.maxFileBytes || 0);
    if (picked.size && maximum && picked.size > maximum) { setMessage(`حجم الملف يتجاوز الحد المسموح (${Math.ceil(maximum / 1024 / 1024)} م.ب).`); return; }
    setBusyAction("upload"); setMessage(""); setArtifact(null); setUpload(null);
    const controller = new AbortController(); abortRef.current = controller;
    setProgress({ loaded: 0, total: picked.size || 0, percent: 0, bytesPerSecond: 0, remainingSeconds: null });
    try {
      const created = await api<CreatedConversation>("/api/ai/conversations", { method: "POST", body: jsonBody({ title: picked.name, kind: "file" }) });
      const form = new FormData();
      form.append("conversationId", String(created.conversation.id));
      form.append("file", { uri: picked.uri, name: picked.name, type: assetMimeType(picked, "application/octet-stream") } as unknown as Blob);
      const response = await apiUpload<UploadResponse>("/api/ai/files", form, { timeoutMs: 15 * 60_000, signal: controller.signal, onProgress: setProgress });
      setUpload(response);
      setMessage("اكتمل رفع الملف. اختر ما تريد أن يصنعه أدوات مراس.");
      await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر رفع الملف"); }
    finally { abortRef.current = null; setProgress(null); setBusyAction(null); }
  };

  const runFileAction = async (action: "summary" | "translation" | "quiz") => {
    if (!upload || busyAction) return;
    setBusyAction(action); setMessage(""); setArtifact(null);
    try {
      const payload = {
        action,
        conversationId: upload.file.conversationId,
        targetLanguage: action === "translation" ? (targetLanguage === "ar" ? "العربية" : "English") : undefined,
        language: "ar",
        questionCount: action === "quiz" ? 10 : undefined,
        requestId: `mobile-${action}-${upload.file.id}-${Date.now()}`,
      };
      const response = await api<ActionResponse>(`/api/ai/files/${upload.file.id}/actions`, { method: "POST", body: jsonBody(payload), timeoutMs: 4 * 60_000 });
      if (response.action === "quiz") router.push({ pathname: "/ai/quiz/[id]", params: { id: String(response.quiz.id) } });
      else { setArtifact(response.artifact); setMessage(action === "summary" ? "اكتمل الملخص وحُفظ في سجلك." : "اكتملت الترجمة وحُفظت في سجلك."); }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai-status"] }),
        queryClient.invalidateQueries({ queryKey: ["ai-conversations"] }),
      ]);
    } catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر إكمال العملية"); }
    finally { setBusyAction(null); }
  };

  return <Screen>
    <AppHeader title="أدوات مراس" subtitle="من الملف إلى الفهم والاختبار" />

    <LinearGradient colors={["#041536", "#155EEF", "#713EE7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroHead}><View style={styles.spark}><Ionicons name="sparkles" size={24} color="#FFF" /></View><View style={styles.heroHeadCopy}><Text style={styles.heroKicker}>{sourceLabel[ai.entitlement.source]}</Text><Text style={styles.heroTitle}>ذاكر أذكى، لا أطول.</Text></View><View style={styles.plan}><Text style={styles.planTitle}>{ai.entitlement.tier === "subscriber" ? "مفعّل" : "مجاني"}</Text><Text style={styles.planSub}>{ai.entitlement.tier === "subscriber" ? "كامل" : "بحدود شهرية"}</Text></View></View>
      <Text style={styles.heroText}>لخّص سلايداتك، ترجم المصطلحات العلمية، وحوّل الملف إلى اختبار تفاعلي — مع سجل محفوظ لكل ما أنجزته.</Text>
      <View style={styles.usageRow}>{(["summary", "translation", "quiz"] as AiServiceName[]).map((service) => <View key={service} style={styles.usage}><Text style={styles.usageValue}>{ai.services[service].remaining}</Text><Text style={styles.usageLabel}>{service === "summary" ? "ملخص" : service === "translation" ? "ترجمة" : "اختبار"} متبقٍ</Text></View>)}</View>
    </LinearGradient>

    <SectionTitle title="ماذا تريد أن تنجز؟" subtitle="اختر الأداة، ثم ارفع ملف PDF أو عرضًا مدعومًا" />
    <View style={styles.services}>{serviceCards.map((item) => {
      const usage = ai.services[item.service];
      const disabled = !usage.enabled || usage.remaining <= 0;
      return <Pressable key={item.service} disabled={disabled || Boolean(busyAction)} onPress={() => item.service === "chat" ? void createChat() : void pickAndUpload()} style={({ pressed }) => [styles.servicePressable, { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? .48 : pressed ? .86 : 1, transform: [{ scale: pressed ? .985 : 1 }] }]}>
        <LinearGradient colors={item.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.serviceIcon}><Ionicons name={item.icon} size={23} color="#FFF" /></LinearGradient>
        <View style={styles.serviceCopy}><Text style={[styles.serviceTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.serviceText, { color: colors.textSoft }]}>{disabled ? (!usage.enabled ? "موقوف مؤقتًا من الإدارة" : "اكتمل حدك لهذا الشهر") : item.text}</Text></View>
        <View style={[styles.remaining, { backgroundColor: colors.surfaceAlt }]}><Text style={{ color: colors.primary }}>{usage.remaining}</Text><Ionicons name="chevron-back" size={13} color={colors.primary} /></View>
      </Pressable>;
    })}</View>

    <Card style={styles.workspace}>
      <View style={styles.workspaceHead}><View style={[styles.workspaceIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="document-text-outline" size={23} color={colors.primary} /></View><View style={styles.workspaceCopy}><Text style={[styles.workspaceTitle, { color: colors.text }]}>{upload ? upload.file.originalName : "مساحة العمل"}</Text><Text style={[styles.workspaceText, { color: colors.textSoft }]}>{upload ? `${(upload.file.sizeBytes / 1024 / 1024).toFixed(1)} م.ب · فحص آمن: ${upload.file.scanStatus}` : "ارفع ملفًا مرة واحدة واختر أكثر من أداة عليه. صدّر الشرائح PDF لأفضل فهم للمخططات والتنسيق."}</Text></View></View>
      {!upload ? <AppButton title="اختيار ملف" icon="cloud-upload-outline" variant="soft" loading={busyAction === "upload"} onPress={() => void pickAndUpload()} /> : <>
        <View style={styles.actionGrid}>
          <Pressable disabled={Boolean(busyAction)} onPress={() => void runFileAction("summary")} style={[styles.actionButton, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="sparkles-outline" size={21} color={colors.primary} /><Text style={{ color: colors.text }}>تلخيص</Text></Pressable>
          <Pressable disabled={Boolean(busyAction)} onPress={() => void runFileAction("translation")} style={[styles.actionButton, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="language-outline" size={21} color={colors.primary} /><Text style={{ color: colors.text }}>ترجمة</Text></Pressable>
          <Pressable disabled={Boolean(busyAction)} onPress={() => void runFileAction("quiz")} style={[styles.actionButton, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="options-outline" size={21} color={colors.primary} /><Text style={{ color: colors.text }}>اختبار</Text></Pressable>
        </View>
        <View style={styles.languageRow}><Text style={[styles.languageLabel, { color: colors.textSoft }]}>لغة الترجمة</Text><View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>{(["ar", "en"] as const).map((lang) => <Pressable key={lang} onPress={() => setTargetLanguage(lang)} style={[styles.segmentItem, targetLanguage === lang && { backgroundColor: colors.primary }]}><Text style={{ color: targetLanguage === lang ? "#FFF" : colors.textSoft }}>{lang === "ar" ? "العربية" : "English"}</Text></Pressable>)}</View></View>
        <Pressable onPress={() => { setUpload(null); setArtifact(null); setMessage(""); }}><Text style={[styles.changeFile, { color: colors.primary }]}>اختيار ملف آخر</Text></Pressable>
      </>}
      {progress ? <View style={styles.uploadProgress}><View style={styles.uploadProgressHead}><Pressable onPress={() => abortRef.current?.abort()}><Text style={{ color: colors.danger, fontSize: 9, fontWeight: "900" }}>إلغاء</Text></Pressable><Text style={{ color: colors.textSoft, fontSize: 8 }}>{formatUploadProgress(progress)}</Text></View><View style={[styles.uploadTrack, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.uploadFill, { width: `${progress.percent}%`, backgroundColor: colors.primary }]} /></View></View> : null}
      {busyAction && busyAction !== "upload" && busyAction !== "chat" ? <View style={[styles.thinking, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="sparkles" size={18} color={colors.primary} /><Text style={{ color: colors.text }}>{busyAction === "quiz" ? "نصنع بطاقات اختبار متوازنة…" : busyAction === "translation" ? "نترجم مع مراجعة المصطلحات…" : "نرتّب الأفكار في ملخص واضح…"}</Text></View> : null}
      {message ? <Text style={[styles.message, { color: message.startsWith("تعذر") || message.includes("يتجاوز") ? colors.danger : colors.success }]}>{message}</Text> : null}
    </Card>

    {artifact ? <Card style={styles.artifact}><View style={styles.artifactHead}><View><Text style={[styles.artifactEyebrow, { color: colors.primary }]}>{artifact.kind === "summary" ? "الملخص" : "الترجمة"}</Text><Text style={[styles.artifactTitle, { color: colors.text }]}>{artifact.title}</Text></View><Ionicons name="bookmark" size={20} color={colors.primary} /></View><Text selectable style={[styles.artifactContent, { color: colors.text }]}>{artifact.content}</Text>{artifact.conversationId ? <AppButton title="فتح السجل الكامل" variant="ghost" icon="time-outline" onPress={() => router.push({ pathname: "/ai/conversation/[id]", params: { id: String(artifact.conversationId) } })} /> : null}</Card> : null}

    <SectionTitle title="سجل أدوات مراس" subtitle="ارجع إلى محادثاتك وملفاتك من أي جهاز" action={<Pressable onPress={() => void conversations.refetch()}><Ionicons name="refresh-outline" size={19} color={colors.primary} /></Pressable>} />
    {conversations.isLoading ? <LoadingState label="تحميل السجل…" /> : conversations.data?.conversations.length ? <View style={styles.history}>{conversations.data.conversations.slice(0, 8).map((row) => <Pressable key={row.id} onPress={() => router.push({ pathname: "/ai/conversation/[id]", params: { id: String(row.id) } })} style={({ pressed }) => [styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .8 : 1 }]}><View style={[styles.historyIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={row.kind === "chat" ? "chatbubble-ellipses-outline" : "document-text-outline"} size={20} color={colors.primary} /></View><View style={styles.historyCopy}><Text numberOfLines={1} style={[styles.historyTitle, { color: colors.text }]}>{row.title}</Text><Text numberOfLines={2} style={[styles.historyPreview, { color: colors.textSoft }]}>{row.preview || "افتح لمشاهدة المحتوى المحفوظ"}</Text></View><Ionicons name="chevron-back" size={17} color={colors.textSoft} /></Pressable>)}</View> : <EmptyState icon="chatbubbles-outline" title="سجلك يبدأ من هنا" text="أنشئ محادثة أو ارفع أول ملف، وسيُحفظ كل شيء تلقائيًا." />}

    {ai.entitlement.tier === "free" ? <Card style={styles.subscribe}><View style={[styles.subscribeIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="diamond-outline" size={25} color={colors.primary} /></View><View style={styles.subscribeCopy}><Text style={[styles.subscribeTitle, { color: colors.text }]}>أدوات مراس الكامل · {ai.entitlement.monthlyPrice} ر.س شهريًا</Text><Text style={[styles.subscribeText, { color: colors.textSoft }]}>ويأتي مجانًا تلقائيًا مع أي اشتراك مادة فعّال.</Text></View>{STORE_COMMERCE_ENABLED ? <Pressable onPress={() => void Linking.openURL(absoluteUrl(ai.deepLinks.subscribe))} style={[styles.subscribeButton, { backgroundColor: colors.primary }]}><Text style={{ color: "#FFF", fontSize: 10, fontWeight: "900" }}>اشترك</Text></Pressable> : null}</Card> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 20, overflow: "hidden", marginTop: 6 }, heroHead: { flexDirection: "row", alignItems: "center", gap: 10 }, spark: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.13)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)" }, heroHeadCopy: { flex: 1, alignItems: "flex-start" }, heroKicker: { color: "#BCD2FB", fontSize: 9, fontWeight: "800" }, heroTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", marginTop: 3 }, plan: { minWidth: 62, alignItems: "center", padding: 7, borderRadius: 12, backgroundColor: "rgba(255,255,255,.11)" }, planTitle: { color: "#FFF", fontSize: 10, fontWeight: "900" }, planSub: { color: "#C7D8F7", fontSize: 7, marginTop: 2 }, heroText: { color: "#D7E3F8", fontSize: 11, lineHeight: 20, textAlign: "right", writingDirection: "rtl", marginTop: 14 }, usageRow: { flexDirection: "row", marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,.2)" }, usage: { flex: 1, alignItems: "center" }, usageValue: { color: "#FFF", fontSize: 18, fontWeight: "900" }, usageLabel: { color: "#BFD0EE", fontSize: 7, marginTop: 2 },
  services: { gap: 9 }, servicePressable: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 11, padding: 11, borderWidth: 1, borderRadius: 20 }, serviceIcon: { width: 54, height: 54, borderRadius: 17, alignItems: "center", justifyContent: "center" }, serviceCopy: { flex: 1, alignItems: "flex-start" }, serviceTitle: { fontSize: 13, fontWeight: "900", textAlign: "right" }, serviceText: { fontSize: 9, lineHeight: 15, textAlign: "right", marginTop: 3 }, remaining: { minWidth: 44, height: 32, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  workspace: { marginTop: 15 }, workspaceHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }, workspaceIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" }, workspaceCopy: { flex: 1, alignItems: "flex-start" }, workspaceTitle: { fontSize: 13, fontWeight: "900", textAlign: "right" }, workspaceText: { fontSize: 8, lineHeight: 14, textAlign: "right", marginTop: 3 }, actionGrid: { flexDirection: "row", gap: 7 }, actionButton: { flex: 1, minHeight: 72, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 6 }, languageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 11 }, languageLabel: { fontSize: 9, fontWeight: "800" }, segment: { flexDirection: "row", padding: 3, borderRadius: 11 }, segmentItem: { minWidth: 76, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, alignItems: "center" }, changeFile: { fontSize: 9, fontWeight: "900", textAlign: "center", marginTop: 12 }, uploadProgress: { marginTop: 11 }, uploadProgressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, uploadTrack: { height: 7, borderRadius: 99, overflow: "hidden", marginTop: 7 }, uploadFill: { height: "100%", borderRadius: 99 }, thinking: { minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, marginTop: 11 }, message: { fontSize: 9, lineHeight: 16, textAlign: "center", marginTop: 10 },
  artifact: { marginTop: 11 }, artifactHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }, artifactEyebrow: { fontSize: 8, fontWeight: "900" }, artifactTitle: { fontSize: 15, fontWeight: "900", textAlign: "right", marginTop: 2 }, artifactContent: { fontSize: 11, lineHeight: 22, textAlign: "right", writingDirection: "rtl", marginBottom: 12 },
  history: { gap: 8 }, historyRow: { minHeight: 73, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderWidth: 1, borderRadius: 18 }, historyIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }, historyCopy: { flex: 1, alignItems: "flex-start" }, historyTitle: { fontSize: 12, fontWeight: "900", textAlign: "right" }, historyPreview: { fontSize: 8, lineHeight: 14, textAlign: "right", marginTop: 3 },
  subscribe: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18 }, subscribeIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }, subscribeCopy: { flex: 1, alignItems: "flex-start" }, subscribeTitle: { fontSize: 11, fontWeight: "900", textAlign: "right" }, subscribeText: { fontSize: 8, lineHeight: 14, textAlign: "right", marginTop: 3 }, subscribeButton: { minHeight: 38, minWidth: 64, paddingHorizontal: 10, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
