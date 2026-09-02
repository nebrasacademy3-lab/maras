import { Ionicons } from "@expo/vector-icons";
import { getDocumentAsync } from "expo-document-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Redirect, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { SupportChat } from "@/src/components/SupportChat";
import { AppButton, Card, EmptyState, Field, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, apiUpload, ApiError } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { PublicSettings, SupportTicket } from "@/src/types";

type PickedFile = { uri: string; name: string; type: string; size: number };
const labels: Record<string, string> = { new: "جديدة", open: "مفتوحة", waiting: "بانتظار ردك", resolved: "محلولة", closed: "مغلقة" };
const categoryLabels: Record<string, string> = { technical: "مشكلة تقنية", payment: "الدفع", course: "المواد", account: "الحساب" };
const categories = Object.entries(categoryLabels).map(([id, label]) => ({ id, label }));

export default function Support() {
  const { colors } = useTheme();
  const { isRTL, locale } = useLanguage();
  const { user } = useAuth();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ ticket?: string }>();
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(params.ticket || 0) || null);
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [category, setCategory] = useState("technical");
  const [newFiles, setNewFiles] = useState<PickedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: PublicSettings }>("/api/public/settings") });
  const tickets = useQuery({ queryKey: ["support", user?.id], queryFn: () => api<{ tickets: SupportTicket[] }>("/api/support"), enabled: Boolean(user) });
  const rows = useMemo(() => tickets.data?.tickets || [], [tickets.data?.tickets]);
  const selected = useMemo(() => rows.find((ticket) => ticket.id === selectedId) || null, [rows, selectedId]);

  useEffect(() => {
    const ticketId = Number(params.ticket || 0);
    if (!ticketId) return;
    const timer = setTimeout(() => setSelectedId(ticketId), 0);
    return () => clearTimeout(timer);
  }, [params.ticket]);
  const reload = async () => { await Promise.all([client.invalidateQueries({ queryKey: ["support"] }), client.invalidateQueries({ queryKey: ["dashboard"] })]); };

  const pickNewFiles = async () => {
    const result = await getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: ["image/*", "audio/*", "application/pdf", "text/plain", "application/msword", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    });
    if (!result.canceled) setNewFiles(result.assets.slice(0, 8).map((asset) => ({ uri: asset.uri, name: asset.name || "attachment", type: asset.mimeType || "application/octet-stream", size: asset.size || 0 })));
  };

  const submit = async () => {
    if (!title.trim() || (!messageText.trim() && !newFiles.length) || sending) return;
    setSending(true); setFeedback("");
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("priority", "normal");
      form.append("title", title.trim());
      form.append("message", messageText.trim());
      form.append("contactChannel", "in_app");
      newFiles.forEach((file) => form.append("files", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob));
      const result = await apiUpload<{ ticket?: { id: number } }>("/api/support", form, { timeoutMs: 15 * 60_000 });
      setTitle(""); setMessageText(""); setNewFiles([]); setNewOpen(false);
      await reload();
      if (result.ticket?.id) setSelectedId(result.ticket.id);
      setFeedback("تم فتح المحادثة بنجاح");
    } catch (reason) { setFeedback(reason instanceof ApiError ? reason.message : "تعذر فتح المحادثة"); }
    finally { setSending(false); }
  };

  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const rate = async () => {
    if (!selected || !rating) return;
    setRatingBusy(true);
    try {
      await api("/api/support", { method: "PATCH", body: JSON.stringify({ ticketId: selected.id, action: "rate", rating, comment: ratingComment.trim() }) });
      await reload(); setFeedback("تم إرسال تقييمك، شكرًا لك"); setRating(0); setRatingComment("");
    } catch (reason) { setFeedback(reason instanceof ApiError ? reason.message : "تعذر حفظ التقييم"); }
    finally { setRatingBusy(false); }
  };
  const reopen = async () => {
    if (!selected) return;
    try {
      await api("/api/support", { method: "PATCH", body: JSON.stringify({ ticketId: selected.id, action: "reopen" }) });
      await reload(); setFeedback("تمت إعادة فتح المحادثة");
    } catch (reason) { setFeedback(reason instanceof ApiError ? reason.message : "تعذر إعادة فتح المحادثة"); }
  };

  if (!user) return <Redirect href="/(auth)/login?return_to=%2Fsupport" />;
  if (tickets.isLoading) return <Screen><LoadingState label="جارٍ تحميل محادثات الدعم..." /></Screen>;

  if (selected) return <Screen keyboard showFooter={false}>
    <AppHeader title={selected.title} subtitle={`${selected.ticketNumber} · ${labels[selected.status] || "حالة غير معروفة"}`} back onBack={() => setSelectedId(null)} />
    <View style={[styles.ticketBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flex: 1, alignItems: "flex-start" }}><Text style={[styles.ticketTitle, { color: colors.text }]}>{selected.title}</Text><Text style={[styles.meta, { color: colors.textSoft }]}>{categoryLabels[selected.category] || "دعم عام"} · آخر تحديث {new Date(selected.updatedAt || selected.createdAt).toLocaleString(locale)}</Text></View>
      <View style={[styles.statusPill, { backgroundColor: ["closed", "resolved"].includes(selected.status) ? `${colors.success}14` : `${colors.primary}14` }]}><Text style={{ color: ["closed", "resolved"].includes(selected.status) ? colors.success : colors.primary, fontSize: 8, fontWeight: "900" }}>{labels[selected.status] || "حالة غير معروفة"}</Text></View>
    </View>
    {["closed", "resolved"].includes(selected.status) && <View style={styles.compactAction}><AppButton full={false} title="إعادة فتح المحادثة" variant="soft" icon="refresh-outline" onPress={() => void reopen()} /></View>}
    {["closed", "resolved"].includes(selected.status) && (selected.satisfactionRating ? <Card style={styles.ratingCard}><Text style={[styles.ratingTitle, { color: colors.text }]}>شكرًا لتقييمك: {"★".repeat(selected.satisfactionRating)}</Text>{selected.satisfactionComment ? <Text style={[styles.meta, { color: colors.textSoft }]}>{selected.satisfactionComment}</Text> : null}</Card> : <Card style={styles.ratingCard}><Text style={[styles.ratingTitle, { color: colors.text }]}>كيف كانت تجربتك مع الدعم؟</Text><View style={styles.ratingRow}>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} onPress={() => setRating(value)} accessibilityRole="radio" accessibilityState={{ selected: rating === value }} accessibilityLabel={`${value} من 5`}><Ionicons name={value <= rating ? "star" : "star-outline"} size={26} color={value <= rating ? colors.warning : colors.textSoft} /></Pressable>)}</View><Field label="ملاحظة اختيارية" value={ratingComment} onChangeText={setRatingComment} placeholder="ما الذي يمكن تحسينه؟" /><AppButton title="إرسال التقييم" icon="star-outline" variant="soft" loading={ratingBusy} disabled={!rating} onPress={() => void rate()} /></Card>)}
    <SupportChat ticket={selected} viewer="student" onReload={reload} onFeedback={setFeedback} />
    {!!feedback && <Text style={[styles.feedback, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text>}
  </Screen>;

  const publicSettings = settings.data?.settings;
  return <Screen keyboard>
    <AppHeader title="الدعم والمساعدة" subtitle={publicSettings?.support_hours || "فريق مراس معك"} back />
    <View style={[styles.hero, { backgroundColor: colors.primary }]}><View style={styles.heroIcon}><Ionicons name="chatbubbles" size={23} color="#FFF" /></View><View style={{ flex: 1, alignItems: "flex-start" }}><Text style={styles.heroTitle}>محادثات دعم مرتبة وسريعة</Text><Text style={styles.heroCopy}>كل رسالة ومرفقاتها تظهر معًا بالترتيب الصحيح، ويمكنك الرد والصوت والصور داخل المحادثة.</Text></View></View>

    <View style={styles.quickLinks}>
      {publicSettings?.whatsapp_url && <Pressable onPress={() => void Linking.openURL(publicSettings.whatsapp_url)} style={[styles.quickLink, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="logo-whatsapp" size={20} color="#20A96B" /><Text style={{ color: colors.text, fontSize: 9, fontWeight: "800" }}>واتساب</Text></Pressable>}
      {publicSettings?.support_email && <Pressable onPress={() => void Linking.openURL(`mailto:${publicSettings.support_email}`)} style={[styles.quickLink, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="mail-outline" size={20} color={colors.primary} /><Text style={{ color: colors.text, fontSize: 9, fontWeight: "800" }}>البريد</Text></Pressable>}
      <Pressable onPress={() => setNewOpen((open) => !open)} style={[styles.quickLink, styles.newTicketLink, { backgroundColor: colors.primary, borderColor: colors.primary }]}><Ionicons name={newOpen ? "close" : "add"} size={20} color="#FFF" /><Text style={{ color: "#FFF", fontSize: 9, fontWeight: "900" }}>{newOpen ? "إغلاق" : "محادثة جديدة"}</Text></Pressable>
    </View>

    {newOpen && <Card style={styles.newTicketCard}>
      <SectionTitle title="محادثة جديدة" subtitle="اكتب التفاصيل وأرفق ما يساعد فريق الدعم" />
      <View style={styles.categories}>{categories.map((item) => <Pressable key={item.id} onPress={() => setCategory(item.id)} style={[styles.category, { backgroundColor: category === item.id ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: category === item.id ? "#FFF" : colors.text, fontSize: 8, fontWeight: "800" }}>{item.label}</Text></Pressable>)}</View>
      <Field label="العنوان" value={title} onChangeText={setTitle} placeholder="مثال: مشكلة في تشغيل الدرس" />
      <TextInput multiline value={messageText} onChangeText={setMessageText} placeholder="اكتب تفاصيل المشكلة..." placeholderTextColor={colors.textSoft} style={[styles.messageInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
      <Pressable onPress={() => void pickNewFiles()} style={[styles.attachNew, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}><Ionicons name="attach-outline" size={18} color={colors.primary} /><Text style={{ color: colors.text, fontSize: 9, fontWeight: "800" }}>{newFiles.length ? `${newFiles.length} مرفقات جاهزة` : "إرفاق صور أو ملفات"}</Text></Pressable>
      {!!newFiles.length && <View style={styles.fileNames}>{newFiles.map((file, index) => <View key={`${file.uri}-${index}`} style={styles.fileName}><Pressable onPress={() => setNewFiles((current) => current.filter((_, i) => i !== index))}><Ionicons name="close-circle" size={17} color={colors.danger} /></Pressable><Text numberOfLines={1} style={{ color: colors.textSoft, fontSize: 8, flex: 1 }}>{file.name}</Text></View>)}</View>}
      <AppButton title="إرسال وفتح المحادثة" icon="send-outline" loading={sending} disabled={title.trim().length < 3 || (!messageText.trim() && !newFiles.length)} onPress={() => void submit()} />
    </Card>}

    {!!feedback && <Text style={[styles.feedback, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text>}
    <SectionTitle title="محادثاتك" subtitle={`${rows.length} تذكرة دعم`} />
    {rows.length ? <View style={styles.ticketList}>{rows.map((ticket) => {
      const last = ticket.replies?.[ticket.replies.length - 1];
      return <Pressable key={ticket.id} onPress={() => setSelectedId(ticket.id)}>
        <Card style={styles.ticketCard}>
          <View style={styles.cardTop}><View style={[styles.statusPill, { backgroundColor: ["closed", "resolved"].includes(ticket.status) ? `${colors.success}14` : `${colors.primary}14` }]}><Text style={{ color: ["closed", "resolved"].includes(ticket.status) ? colors.success : colors.primary, fontSize: 8, fontWeight: "900" }}>{labels[ticket.status] || "حالة غير معروفة"}</Text></View><View style={{ flex: 1, alignItems: "flex-start" }}><Text style={[styles.ticketTitle, { color: colors.text }]}>{ticket.title}</Text><Text style={[styles.meta, { color: colors.textSoft }]}>{ticket.ticketNumber}</Text></View></View>
          <Text numberOfLines={2} style={[styles.preview, { color: colors.textSoft }]}>{last?.body || last?.files?.[0]?.originalName || ticket.message}</Text>
          <View style={styles.cardBottom}><Text style={{ color: colors.textSoft, fontSize: 8 }}>{new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString(locale)}</Text><View style={styles.openLabel}><Text style={{ color: colors.primary, fontSize: 8, fontWeight: "900" }}>فتح المحادثة</Text><Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={14} color={colors.primary} /></View></View>
        </Card>
      </Pressable>;
    })}</View> : <EmptyState icon="chatbubble-ellipses-outline" title="لا توجد محادثات" text="افتح محادثة جديدة وسيظهر الرد هنا بشكل مرتب." action={<AppButton title="فتح محادثة" onPress={() => setNewOpen(true)} />} />}
  </Screen>;
}

const styles = StyleSheet.create({
  ratingCard: { gap: 8, marginBottom: 10 }, ratingTitle: { fontSize: 12, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, ratingRow: { flexDirection: "row-reverse", gap: 6 },
  hero: { borderRadius: 20, padding: 16, flexDirection: "row", gap: 11, alignItems: "center", marginTop: 4 }, heroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.14)" }, heroTitle: { color: "#FFF", fontSize: 14, fontWeight: "900", textAlign: "right" }, heroCopy: { color: "rgba(255,255,255,.82)", fontSize: 9, lineHeight: 16, textAlign: "right", marginTop: 3 },
  quickLinks: { flexDirection: "row", gap: 7, marginTop: 10, flexWrap: "wrap" }, quickLink: { minHeight: 42, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, newTicketLink: { flexGrow: 1 },
  newTicketCard: { marginTop: 12 }, categories: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }, category: { minHeight: 34, borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  messageInput: { minHeight: 92, maxHeight: 180, borderWidth: 1, borderRadius: 14, padding: 11, textAlignVertical: "top", writingDirection: "rtl", fontSize: 10, marginBottom: 10 }, attachNew: { minHeight: 42, borderWidth: 1, borderRadius: 12, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", marginBottom: 10 }, fileNames: { gap: 5, marginBottom: 10 }, fileName: { minHeight: 30, flexDirection: "row", gap: 6, alignItems: "center" },
  feedback: { fontSize: 9, textAlign: "center", fontWeight: "800", marginTop: 8 }, ticketList: { gap: 8 }, ticketCard: { padding: 13 }, cardTop: { flexDirection: "row", alignItems: "center", gap: 9 }, ticketTitle: { fontSize: 11, fontWeight: "900", textAlign: "right" }, meta: { fontSize: 7, marginTop: 3, textAlign: "right" }, statusPill: { minHeight: 28, borderRadius: 10, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" }, preview: { fontSize: 9, lineHeight: 16, textAlign: "right", marginTop: 9 }, cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }, openLabel: { flexDirection: "row", alignItems: "center", gap: 3 },
  ticketBar: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: "row", gap: 9, alignItems: "center" }, compactAction: { alignItems: "flex-start", marginTop: 8 },
});
