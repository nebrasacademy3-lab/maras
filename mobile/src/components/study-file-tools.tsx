import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field, LoadingState, SectionTitle } from "@/src/components/ui";
import { api, apiUpload } from "@/src/lib/api";
import { assetMimeType } from "@/src/lib/file-types";
import { downloadStudyPdf } from "@/src/lib/study-pdf-native";
import { observeStudyJob, requestStudyAction, savedStudyJob, StudyJobError } from "@/src/lib/study-jobs";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export type StudyAction = "summary" | "translation" | "quiz";
type Resource = { id: number; title: string; contentType: string; lessonId: string | null };
type StudyFile = { id: number; originalName: string; scanStatus: string };
type StudyResult = { cached?: boolean; artifact?: { id: number; title: string; content: string }; quiz?: { id: number; title: string } };
const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pptxMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const names = { summary: "تلخيص الملف", translation: "ترجمة الملف", quiz: "اختبار من الملف" };

export function StudyArtifactDownload({ id }: { id: number }) {
  const { user } = useAuth();
  return user ? <StudyPdfControl key={`${user.id}:${id}`} id={id} userId={user.id}/> : null;
}
function StudyPdfControl({ id, userId }: { id: number; userId: number }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  async function download() {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setMessage("");
    try {
      const result = await downloadStudyPdf({ id, userId, signal: controller.signal, onPending: () => setMessage("يجري تجهيز PDF من النص المحفوظ دون توليد جديد…") });
      if (!controller.signal.aborted) setMessage(result.action === "cancelled" ? "أُلغي الحفظ." : result.action === "saved" ? "حُفظ ملف PDF بنجاح." : "أُغلقت نافذة المشاركة.");
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "تعذر تنزيل PDF"); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  return <View style={{ gap: 9 }}><AppButton title="تنزيل PDF · مراس العلم" icon="download-outline" variant="soft" loading={busy} onPress={() => void download()}/>{message ? <Text selectable accessibilityLiveRegion="polite" style={{ color: colors.textSoft, lineHeight: 22 }}>{message}</Text> : null}</View>;
}

export function StudyFileTools({ action, resources, scope = "workspace" }: { action: StudyAction; resources?: Resource[]; scope?: string }) {
  const { user } = useAuth(), { colors } = useTheme();
  const [file, setFile] = useState<StudyFile | null>(null), [resourceId, setResourceId] = useState(resources?.[0]?.id || 0);
  const [language, setLanguage] = useState("العربية"), [questionCount, setQuestionCount] = useState(10);
  const [result, setResult] = useState<StudyResult | null>(null), [busy, setBusy] = useState(false), [phase, setPhase] = useState(""), [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const jobScope = `${user?.id || "guest"}.${scope}.${action}`;
  const finish = useCallback(async (value: StudyResult) => { setResult(value); setPendingId(null); await savedStudyJob(jobScope, null); }, [jobScope]);
  const failed = useCallback(async (reason: unknown, signal: AbortSignal) => {
    if (signal.aborted) return;
    if (reason instanceof StudyJobError && reason.terminal) { setPendingId(null); await savedStudyJob(jobScope, null); }
    setError(reason instanceof Error ? reason.message : "تعذر إكمال المعالجة.");
  }, [jobScope]);
  const resume = useCallback(async (id: string, signal: AbortSignal) => {
    setBusy(true); setError(""); setPendingId(id);
    try { await finish(await observeStudyJob<StudyResult>({ id, status: "queued" }, signal, setPhase)); }
    catch (reason) { await failed(reason, signal); }
    finally { if (!signal.aborted) setBusy(false); }
  }, [failed, finish]);
  useEffect(() => {
    const abort = new AbortController(); abortRef.current = abort;
    void savedStudyJob(jobScope).then(id => { if (user?.id && id && /^[a-f0-9-]{36}$/.test(id) && !abort.signal.aborted) void resume(id, abort.signal); });
    return () => { abortRef.current?.abort(); abort.abort(); };
  }, [jobScope, resume, user?.id]);
  async function upload() {
    if (busy) return;
    try {
      const selected = await DocumentPicker.getDocumentAsync({ type: [docxMime, pptxMime, "application/pdf", "text/plain", "text/markdown", "image/png", "image/jpeg"], copyToCacheDirectory: true, multiple: false });
      if (selected.canceled || !selected.assets[0]) return;
      const asset = selected.assets[0];
      if ((asset.size || 0) > 20 * 1024 * 1024) throw new Error("قسّم الملف إلى أجزاء لا تتجاوز 20 ميجابايت.");
      setBusy(true); setPhase("upload"); setError(""); setResult(null);
      const abort = new AbortController(); abortRef.current = abort;
      const form = new FormData();
      if (Platform.OS === "web" && asset.file) form.append("file", asset.file, asset.name);
      else form.append("file", { uri: asset.uri, name: asset.name, type: assetMimeType(asset, "application/octet-stream") } as unknown as Blob);
      const payload = await apiUpload<{ file: StudyFile }>("/api/ai/files", form, { signal: abort.signal, timeoutMs: 15 * 60_000 });
      if (!abort.signal.aborted) setFile(payload.file);
    } catch (reason) { if (!abortRef.current?.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر رفع الملف"); }
    finally { if (!abortRef.current?.signal.aborted) setBusy(false); }
  }
  async function run() {
    if (!user || busy) return;
    setBusy(true); setResult(null); setError(""); setPhase("queued");
    const abort = new AbortController(); abortRef.current = abort;
    try {
      const source = resources ? (await api<{ file: StudyFile }>(`/api/course-resources/${resourceId}/study`, { method: "POST", signal: abort.signal })).file : file;
      if (!source) throw new Error("اختر ملفًا أولًا.");
      const value = await requestStudyAction<StudyResult>(source.id, { action, targetLanguage: language, language, questionCount }, { signal: abort.signal, onStatus: setPhase, onJob: async id => { setPendingId(id); await savedStudyJob(jobScope, id); } });
      await finish(value);
    } catch (reason) { await failed(reason, abort.signal); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <Card style={{ gap: 16 }}>
    <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{names[action]}</Text>
    {resources ? <View style={{ gap: 9 }}><Text style={{ color: colors.textSoft }}>ملف الدرس المعتمد</Text>{resources.map(resource => <Pressable key={resource.id} accessibilityRole="radio" accessibilityState={{ checked: resourceId === resource.id, disabled: busy }} disabled={busy} onPress={() => { setResourceId(resource.id); setResult(null); }} style={{ padding: 14, borderRadius: 13, borderWidth: 1, borderColor: resourceId === resource.id ? colors.primary : colors.border, backgroundColor: colors.surfaceAlt, flexDirection: "row", gap: 10 }}><Ionicons name={resourceId === resource.id ? "radio-button-on" : "radio-button-off"} size={20} color={colors.primary}/><Text style={{ color: colors.text, flex: 1 }}>{resource.title}{!resource.lessonId ? " · مشترك للمادة" : ""}</Text></Pressable>)}</View> : <><AppButton title={file?.originalName || "اختيار ملف المحاضرة"} variant="soft" icon="cloud-upload-outline" disabled={busy} onPress={() => void upload()}/><Text selectable style={{ color: colors.textSoft, lineHeight: 23 }}>Word · PowerPoint · PDF · صور ونصوص. نستخرج نصوص DOCX وPPTX؛ استخدم PDF للمخططات والصور داخل الملف.</Text></>}
    {action !== "summary" && <Field label={action === "quiz" ? "لغة الاختبار" : "اللغة المطلوبة"} value={language} maxLength={60} editable={!busy} onChangeText={setLanguage}/>}
    {action === "quiz" && <View style={{ gap: 9 }}><Text style={{ color: colors.textSoft }}>عدد الأسئلة</Text><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{[5, 10, 15, 20].map(count => <AppButton key={count} title={String(count)} full={false} disabled={busy} variant={count === questionCount ? "primary" : "soft"} onPress={() => setQuestionCount(count)}/>)}</View></View>}
    <AppButton title={busy ? "جارٍ المعالجة" : names[action]} loading={busy} disabled={(resources ? !resourceId : !file) || !language.trim()} onPress={() => void run()}/>
    {busy && <Text selectable accessibilityLiveRegion="polite" style={{ color: colors.primary, lineHeight: 24 }}>{phase === "upload" ? "جارٍ رفع الملف وفحصه…" : phase === "processing" ? "جارٍ إعداد النتيجة…" : phase === "reconnecting" ? "إعادة الاتصال بالطلب المحفوظ…" : "طلبك محفوظ في قائمة المعالجة. لا ترسله مجددًا."}</Text>}
    {error ? <Text selectable accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 24 }}>{error}</Text> : null}
    {pendingId && !busy && <AppButton title="متابعة الطلب المحفوظ" variant="soft" onPress={() => { const abort = new AbortController(); abortRef.current = abort; void resume(pendingId, abort.signal); }}/>}
    {result?.cached && <Text style={{ color: colors.textSoft }}>نتيجة محفوظة لنفس المصدر والإعدادات، دون طلب توليد جديد.</Text>}
    {result?.artifact && <View style={{ gap: 16 }}><Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{result.artifact.title}</Text><StudyArtifactDownload id={result.artifact.id}/><Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 29 }}>{result.artifact.content}</Text></View>}
    {result?.quiz && <View style={{ gap: 10 }}><Text style={{ color: colors.text }}>{result.quiz.title}</Text><AppButton title="بدء الاختبار بالبطاقات" icon="play-outline" onPress={() => router.push({ pathname: "/ai/quiz/[id]", params: { id: String(result.quiz!.id) } })}/></View>}
    <Text style={{ color: colors.textSoft, fontSize: 12, lineHeight: 21 }}>إعداد وتنسيق مراس العلم. المحتوى مساعدة دراسية؛ راجعه مع مرجع المقرر. حقوق المصدر لأصحابه.</Text>
  </Card>;
}

export function LessonStudyTools({ courseSlug, lessonId }: { courseSlug: string; lessonId: string }) {
  const { user } = useAuth(), { colors } = useTheme();
  const [action, setAction] = useState<StudyAction | null>(null);
  const query = useQuery({ queryKey: ["lesson-study-resources", user?.id, courseSlug, lessonId], enabled: Boolean(user), staleTime: 60_000, queryFn: ({ signal }) => api<{ resources: Resource[] }>(`/api/course-resources?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`, { signal }) });
  const resources = (query.data?.resources || []).filter(file => /pdf|wordprocessingml|presentationml|text\/|image\/(png|jpeg)/.test(file.contentType)).sort((a,b) => Number(Boolean(b.lessonId)) - Number(Boolean(a.lessonId)));
  return <View style={{ gap: 12, marginVertical: 16 }}><SectionTitle title="ثبّت فهمك بعد الدرس" subtitle="أدوات مباشرة من ملف الدرس دون إعادة رفعه"/>{query.isLoading ? <LoadingState label="تحميل ملف الدرس…"/> : query.isError ? <><Text selectable style={{ color: colors.danger }}>{query.error.message}</Text><AppButton title="إعادة المحاولة" onPress={() => void query.refetch()}/></> : !resources.length ? <Text style={{ color: colors.textSoft, lineHeight: 24 }}>ستظهر الأدوات هنا عندما تربط الإدارة ملفًا مدعومًا بهذا الدرس.</Text> : action ? <><AppButton title="كل أدوات الدرس" variant="ghost" onPress={() => setAction(null)}/><StudyFileTools key={`${lessonId}.${action}`} action={action} resources={resources} scope={`${courseSlug}.${lessonId}`}/></> : <View style={{ gap: 12 }}>{(["summary", "translation", "quiz"] as const).map(item => <Pressable accessibilityRole="button" key={item} onPress={() => setAction(item)} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 20, gap: 8 }}><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 18 }}>{names[item]}</Text><Text style={{ color: colors.textSoft, lineHeight: 22 }}>{item === "quiz" ? "بطاقات وأسئلة مع الشرح وإعادة المحاولة" : "نتيجة منظمة في ملف Word يحمل حقوق مراس"}</Text></Pressable>)}</View>}</View>;
}
