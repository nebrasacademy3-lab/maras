import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { absoluteUrl, apiUpload, ApiError, getApiToken } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { SupportFile, SupportReply, SupportTicket } from "@/src/types";

type PickedFile = { uri: string; name: string; type: string; size: number };

type Props = {
  ticket: SupportTicket;
  viewer: "student" | "manager";
  onReload: () => void | Promise<void>;
  onFeedback?: (message: string) => void;
};

function isImage(file: SupportFile) { return file.contentType.startsWith("image/"); }
function isAudio(file: SupportFile) { return file.contentType.startsWith("audio/"); }
function formatBytes(bytes: number) { if (!bytes) return ""; if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function authHeaders(): Record<string, string> { const token = getApiToken(); return token ? { authorization: `Bearer ${token}` } : {}; }

function AudioAttachment({ file, mine }: { file: SupportFile; mine: boolean }) {
  const { colors } = useTheme();
  const source = useMemo(() => ({ uri: absoluteUrl(`/api/support/files/${file.id}?inline=1`), headers: authHeaders() }), [file.id]);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const current = Math.max(0, Math.round(status.currentTime || 0));
  const duration = Math.max(0, Math.round(status.duration || 0));
  return <View style={styles.audioRow}>
    <Pressable onPress={() => status.playing ? player.pause() : player.play()} style={[styles.audioPlay, { backgroundColor: mine ? "rgba(255,255,255,.18)" : colors.surfaceAlt }]}><Ionicons name={status.playing ? "pause" : "play"} size={18} color={mine ? "#FFF" : colors.primary} /></Pressable>
    <View style={styles.audioCopy}><View style={[styles.wave, { backgroundColor: mine ? "rgba(255,255,255,.35)" : colors.border }]} /><Text style={{ color: mine ? "rgba(255,255,255,.8)" : colors.textSoft, fontSize: 8 }}>{current}s{duration ? ` / ${duration}s` : ""} · رسالة صوتية</Text></View>
  </View>;
}

async function downloadFile(file: SupportFile) {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!base) throw new Error("مساحة التخزين غير متاحة");
  const dir = `${base}meras-support/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const safeName = `${file.id}-${file.originalName}`.replace(/[\\/:*?"<>|]/g, "-");
  const result = await FileSystem.downloadAsync(absoluteUrl(`/api/support/files/${file.id}`), `${dir}${safeName}`, { headers: authHeaders() });
  return result.uri;
}

function Attachment({ file, mine, onFeedback }: { file: SupportFile; mine: boolean; onFeedback: (value: string) => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try { const uri = await downloadFile(file); await Linking.openURL(uri); }
    catch { onFeedback("تم حفظ الملف داخل مساحة تطبيق مراس، لكن تعذر فتحه تلقائيًا على هذا الجهاز."); }
    finally { setBusy(false); }
  };
  if (isImage(file)) return <View style={styles.imageAttachment}>
    <Image source={{ uri: absoluteUrl(`/api/support/files/${file.id}?inline=1`), headers: authHeaders() }} style={styles.chatImage} contentFit="cover" transition={120} />
    <Pressable onPress={() => void open()} style={[styles.imageDownload, { backgroundColor: "rgba(0,0,0,.55)" }]}>{busy ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="download-outline" size={16} color="#FFF" />}</Pressable>
    <Text numberOfLines={1} style={{ color: mine ? "#FFF" : colors.text, fontSize: 8, marginTop: 5 }}>{file.originalName}</Text>
  </View>;
  if (isAudio(file)) return <View style={styles.attachmentBlock}><AudioAttachment file={file} mine={mine} /><Pressable onPress={() => void open()} style={styles.smallDownload}>{busy ? <ActivityIndicator size="small" color={mine ? "#FFF" : colors.primary} /> : <Ionicons name="download-outline" size={14} color={mine ? "#FFF" : colors.primary} />}<Text style={{ color: mine ? "#FFF" : colors.primary, fontSize: 8 }}>حفظ الصوت</Text></Pressable></View>;
  return <Pressable onPress={() => void open()} style={[styles.documentRow, { backgroundColor: mine ? "rgba(255,255,255,.12)" : colors.surfaceAlt }]}>
    <View style={[styles.docIcon, { backgroundColor: mine ? "rgba(255,255,255,.16)" : colors.surface }]}><Ionicons name="document-text-outline" size={19} color={mine ? "#FFF" : colors.primary} /></View>
    <View style={styles.documentCopy}><Text numberOfLines={2} style={{ color: mine ? "#FFF" : colors.text, fontSize: 9, fontWeight: "800", textAlign: "right" }}>{file.originalName}</Text><Text style={{ color: mine ? "rgba(255,255,255,.72)" : colors.textSoft, fontSize: 7 }}>{formatBytes(file.sizeBytes)}</Text></View>
    {busy ? <ActivityIndicator size="small" color={mine ? "#FFF" : colors.primary} /> : <Ionicons name="download-outline" size={17} color={mine ? "#FFF" : colors.primary} />}
  </Pressable>;
}

export function SupportChat({ ticket, viewer, onReload, onFeedback }: Props) {
  const { colors } = useTheme();
  const { locale, direction, rowDirection, startAlignment, language } = useLanguage();
  const scroll = useRef<ScrollView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [replyTo, setReplyTo] = useState<SupportReply | null>(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const replies = useMemo(() => [...(ticket.replies || [])].filter((row) => !row.internal).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id), [ticket.replies]);
  const replyMap = useMemo(() => new Map(replies.map((row) => [row.id, row])), [replies]);
  const allFiles = useMemo(() => replies.flatMap((reply) => reply.files || []), [replies]);
  const say = (value: string) => { setFeedback(value); onFeedback?.(value); };

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 60); }, [replies.length, ticket.id]);

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: ["image/*", "audio/*", "application/pdf", "text/plain", "application/msword", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    });
    if (result.canceled) return;
    const next = result.assets.map((asset) => ({ uri: asset.uri, name: asset.name || "attachment", type: asset.mimeType || "application/octet-stream", size: asset.size || 0 }));
    setPicked((current) => [...current, ...next].slice(0, 8));
  };

  const toggleRecording = async () => {
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (recorder.uri) {
          const info = await FileSystem.getInfoAsync(recorder.uri);
          setPicked((current) => [...current, { uri: recorder.uri!, name: `voice-${Date.now()}.m4a`, type: "audio/mp4", size: info.exists && "size" in info ? Number(info.size || 0) : 0 }].slice(0, 8));
          say("تم إرفاق الرسالة الصوتية. اضغط إرسال لإرسالها.");
        }
        return;
      }
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { Alert.alert(language === "ar" ? "إذن الميكروفون" : "Microphone permission", language === "ar" ? "اسمح لمراس باستخدام الميكروفون لإرسال رسالة صوتية." : "Allow Meras to use the microphone to send a voice message."); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setFeedback("");
    } catch { say("تعذر تسجيل الصوت على هذا الجهاز."); }
  };

  const send = async () => {
    if ((!body.trim() && !picked.length) || sending) return;
    setSending(true); setFeedback("");
    try {
      const form = new FormData();
      form.append("ticketId", String(ticket.id));
      form.append("message", body.trim());
      if (replyTo && replyTo.id > 0) form.append("replyToId", String(replyTo.id));
      picked.forEach((file) => form.append("files", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob));
      await apiUpload("/api/support", form, { timeoutMs: 15 * 60_000 });
      setBody(""); setPicked([]); setReplyTo(null);
      await onReload();
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
    } catch (reason) { say(reason instanceof ApiError ? reason.message : "تعذر إرسال الرسالة"); }
    finally { setSending(false); }
  };

  const downloadAll = async () => {
    if (!allFiles.length || downloadingAll) return;
    setDownloadingAll(true); setFeedback("");
    try {
      await Promise.all(allFiles.map((file) => downloadFile(file)));
      say(`تم حفظ ${allFiles.length} مرفق داخل مساحة تطبيق مراس.`);
    } catch { say("تعذر تنزيل بعض المرفقات. يمكنك تنزيل كل ملف منفردًا."); }
    finally { setDownloadingAll(false); }
  };

  return <View style={[styles.chat, { direction, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
    <View style={[styles.chatHead, { flexDirection: rowDirection, borderBottomColor: colors.border }]}>
      <View style={[styles.chatHeadCopy, { alignItems: startAlignment }]}><Text style={{ color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "right" }}>المحادثة</Text><Text style={{ color: colors.textSoft, fontSize: 8 }}>{replies.length} رسالة · {allFiles.length} مرفق</Text></View>
      {allFiles.length > 0 && <Pressable onPress={() => void downloadAll()} style={[styles.downloadAll, { flexDirection: rowDirection, backgroundColor: colors.surface }]}>{downloadingAll ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="download-outline" size={15} color={colors.primary} />}<Text style={{ color: colors.primary, fontSize: 8, fontWeight: "800" }}>تحميل الكل</Text></Pressable>}
    </View>

    <ScrollView ref={scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={styles.thread} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
      {replies.map((message) => {
        const mine = viewer === "student" ? message.authorRole === "student" : message.authorRole !== "student";
        const quoted = message.replyToId ? replyMap.get(message.replyToId) : null;
        return <View key={message.id} style={[styles.messageRow, mine ? styles.mineRow : styles.theirRow]}>
          <View style={[styles.messageBubble, mine ? styles.mineBubble : styles.theirBubble, { backgroundColor: mine ? colors.primary : colors.surface, borderColor: mine ? colors.primary : colors.border }]}>
            <View style={styles.messageMeta}><Text style={{ color: mine ? "rgba(255,255,255,.74)" : colors.textSoft, fontSize: 7 }}>{new Date(message.createdAt).toLocaleString(locale, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" })}</Text><Text style={{ color: mine ? "#FFF" : colors.primary, fontSize: 8, fontWeight: "900" }}>{message.authorRole === "student" ? "الطالب" : "فريق مراس"}</Text></View>
            {quoted && <View style={[styles.quote, { borderStartColor: mine ? "#FFF" : colors.primary, backgroundColor: mine ? "rgba(255,255,255,.11)" : colors.surfaceAlt }]}><Text numberOfLines={2} style={{ color: mine ? "rgba(255,255,255,.88)" : colors.textSoft, fontSize: 8, textAlign: "right" }}>{quoted.body || quoted.files?.[0]?.originalName || "مرفق"}</Text></View>}
            {!!message.body && <Text selectable style={[styles.messageText, { color: mine ? "#FFF" : colors.text }]}>{message.body}</Text>}
            {!!message.files?.length && <View style={styles.attachments}>{message.files.map((file) => <Attachment key={file.id} file={file} mine={mine} onFeedback={say} />)}</View>}
            {message.id > 0 && <Pressable onPress={() => setReplyTo(message)} style={styles.replyAction}><Ionicons name="arrow-undo-outline" size={13} color={mine ? "#FFF" : colors.primary} /><Text style={{ color: mine ? "#FFF" : colors.primary, fontSize: 8, fontWeight: "800" }}>رد</Text></Pressable>}
          </View>
        </View>;
      })}
    </ScrollView>

    {replyTo && <View style={[styles.replyPreview, { flexDirection: rowDirection, backgroundColor: colors.surface, borderColor: colors.border }]}><Pressable onPress={() => setReplyTo(null)}><Ionicons name="close-circle" size={19} color={colors.textSoft} /></Pressable><View style={{ flex: 1, alignItems: startAlignment }}><Text style={{ color: colors.primary, fontSize: 8, fontWeight: "900" }}>الرد على {replyTo.authorRole === "student" ? "الطالب" : "فريق مراس"}</Text><Text numberOfLines={1} style={{ color: colors.textSoft, fontSize: 8 }}>{replyTo.body || replyTo.files?.[0]?.originalName || "مرفق"}</Text></View></View>}
    {!!picked.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picked}>{picked.map((file, index) => <View key={`${file.uri}-${index}`} style={[styles.pickedItem, { backgroundColor: colors.surface }]}><Pressable onPress={() => setPicked((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Ionicons name="close-circle" size={17} color={colors.danger} /></Pressable><Text numberOfLines={1} style={{ color: colors.text, fontSize: 8, maxWidth: 130 }}>{file.name}</Text></View>)}</ScrollView>}
    {recorderState.isRecording && <View style={[styles.recording, { flexDirection: rowDirection, backgroundColor: `${colors.danger}12` }]}><View style={[styles.recordDot, { backgroundColor: colors.danger }]} /><Text style={{ color: colors.danger, fontSize: 9, fontWeight: "900" }}>تسجيل {Math.max(1, Math.round((recorderState.durationMillis || 0) / 1000))} ث · اضغط الميكروفون للإيقاف</Text></View>}
    {!!feedback && <Text style={[styles.feedback, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text>}
    <View style={[styles.composer, { flexDirection: rowDirection, backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable onPress={() => void send()} disabled={sending || (!body.trim() && !picked.length)} style={[styles.sendButton, { backgroundColor: (body.trim() || picked.length) && !sending ? colors.primary : colors.surfaceAlt }]}>{sending ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="send" size={18} color={(body.trim() || picked.length) ? "#FFF" : colors.textSoft} />}</Pressable>
      <TextInput multiline value={body} onChangeText={setBody} placeholder="اكتب رسالة..." placeholderTextColor={colors.textSoft} style={[styles.input, { color: colors.text }]} maxLength={4000} />
      <Pressable onPress={() => void pickFiles()} style={styles.iconButton}><Ionicons name="attach" size={22} color={colors.primary} /></Pressable>
      <Pressable onPress={() => void toggleRecording()} style={[styles.iconButton, recorderState.isRecording && { backgroundColor: `${colors.danger}12` }]}><Ionicons name={recorderState.isRecording ? "stop-circle" : "mic"} size={22} color={recorderState.isRecording ? colors.danger : colors.primary} /></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  chat: { borderWidth: 1, borderRadius: 18, overflow: "hidden", marginTop: 10 },
  chatHead: { minHeight: 54, borderBottomWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  chatHeadCopy: { flex: 1, alignItems: "flex-start" }, downloadAll: { minHeight: 34, borderRadius: 11, paddingHorizontal: 10, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center" },
  thread: { padding: 10, gap: 8, minHeight: 220 }, messageRow: { width: "100%", flexDirection: "row" }, mineRow: { justifyContent: "flex-end" }, theirRow: { justifyContent: "flex-start" },
  messageBubble: { maxWidth: "88%", minWidth: 96, borderWidth: 1, padding: 10, borderRadius: 16 }, mineBubble: { borderBottomEndRadius: 5 }, theirBubble: { borderBottomStartRadius: 5 },
  messageMeta: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 5 }, messageText: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl" },
  quote: { borderStartWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 7 }, attachments: { gap: 6, marginTop: 7 },
  imageAttachment: { position: "relative" }, chatImage: { width: 210, maxWidth: "100%", height: 150, borderRadius: 12 }, imageDownload: { position: "absolute", top: 7, end: 7, width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  attachmentBlock: { gap: 4 }, audioRow: { minWidth: 205, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }, audioPlay: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }, audioCopy: { flex: 1, gap: 5 }, wave: { height: 3, borderRadius: 2, width: "100%" }, smallDownload: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  documentRow: { minHeight: 52, borderRadius: 11, padding: 7, flexDirection: "row", alignItems: "center", gap: 7 }, docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" }, documentCopy: { flex: 1, alignItems: "flex-start" },
  replyAction: { alignSelf: "flex-start", flexDirection: "row", gap: 4, alignItems: "center", marginTop: 7, paddingVertical: 2 },
  replyPreview: { minHeight: 48, borderTopWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  picked: { gap: 6, paddingHorizontal: 9, paddingVertical: 7 }, pickedItem: { minHeight: 34, paddingHorizontal: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  recording: { marginHorizontal: 9, marginTop: 6, minHeight: 34, borderRadius: 10, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, recordDot: { width: 8, height: 8, borderRadius: 4 },
  feedback: { fontSize: 8, textAlign: "center", fontWeight: "800", paddingHorizontal: 10, paddingTop: 6 },
  composer: { margin: 8, minHeight: 52, maxHeight: 132, borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "flex-end", gap: 3, padding: 5 },
  input: { flex: 1, minHeight: 40, maxHeight: 112, paddingHorizontal: 6, paddingTop: 9, fontSize: 10, writingDirection: "rtl", textAlignVertical: "top" },
  iconButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, sendButton: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
