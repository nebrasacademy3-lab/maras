import { QUIZ_DIFFICULTIES } from "@/src/lib/lesson-experience";
import { StudyRichText } from "./study-rich-text";
import { AiReportButton } from "@/src/components/AiReportButton";
import { normalizeStudyProgress, studyProgressLabel, type StudyProgress } from "@/src/lib/study-progress";
import { SUMMARY_LANGUAGES, SUMMARY_DETAILS } from "@/src/lib/study-summary-policy";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { InlineQuiz } from "./inline-quiz";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Field, LoadingState, SectionTitle } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { uploadNativeStudyFile } from "@/src/lib/study-upload-native";
import { downloadStudyPdf } from "@/src/lib/study-pdf-native";
import { controlStudyJob, observeStudyJob, requestStudyAction, savedStudyJob, StudyJobError } from "@/src/lib/study-jobs";
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
  return user ? <View style={{ gap: 6 }}><StudyPdfControl key={`${user.id}:${id}`} id={id} userId={user.id}/><AiReportButton source="artifact" reference={String(id)} /></View> : null;
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
  const [difficulty, setDifficulty] = useState("medium");
  const [summaryDetail, setSummaryDetail] = useState("balanced");
  const [result, setResult] = useState<StudyResult | null>(null), [busy, setBusy] = useState(false), [phase, setPhase] = useState(""), [error, setError] = useState("");
  const [progress,setProgress]=useState<StudyProgress|null>(null), [controlBusy,setControlBusy]=useState(false), [confirmCancel,setConfirmCancel]=useState(false);
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
    try { const value = await observeStudyJob<StudyResult>({ id, status: "queued" }, signal, setPhase, setProgress); if (!signal.aborted) await finish(value); }
    catch (reason) { await failed(reason, signal); }
    finally { if (!signal.aborted) setBusy(false); }
  }, [failed, finish]);
  useEffect(() => {
    const abort = new AbortController(); abortRef.current = abort;
    void savedStudyJob(jobScope).then(id => { if (user?.id && id && /^[a-f0-9-]{36}$/.test(id) && !abort.signal.aborted) void resume(id, abort.signal); });
    return () => { abortRef.current?.abort(); abort.abort(); };
  }, [jobScope, resume, user?.id]);
  async function upload() {
    if (busy || !user) return;
    try {
      const selected = await DocumentPicker.getDocumentAsync({ type: [docxMime, pptxMime, "application/pdf", "text/plain", "text/markdown", "image/png", "image/jpeg"], copyToCacheDirectory: true, multiple: false });
      if (selected.canceled || !selected.assets[0]) return;
      const asset = selected.assets[0];
      setProgress(null); setBusy(true); setPhase("upload"); setError(""); setResult(null);
      const abort = new AbortController(); abortRef.current = abort;
      const uploaded = await uploadNativeStudyFile(asset, user.id, abort.signal, value => setPhase(value.phase === "hashing" ? "فحص بصمة الملف…" : value.phase === "finalizing" ? "اعتماد الملف وفحصه الأمني…" : `رفع الأجزاء: ${value.percent}%`));
      if (!abort.signal.aborted) setFile(uploaded);
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
      const value = await requestStudyAction<StudyResult>(source.id, { action, targetLanguage: language, language, questionCount, summaryDetail, difficulty }, { signal: abort.signal, onStatus: setPhase, onProgress:setProgress, onJob: async id => { setPendingId(id); await savedStudyJob(jobScope, id); } });
      if (!abort.signal.aborted) await finish(value);
    } catch (reason) { await failed(reason, abort.signal); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function control(action: "pause" | "resume" | "cancel") {
    if (!pendingId || controlBusy) return;
    const id=pendingId,signal=abortRef.current?.signal;
    if (signal?.aborted) return;
    setControlBusy(true);setError("");setConfirmCancel(false);
    try {
      const {job}=await controlStudyJob<StudyResult>(id,action,signal);
      if (signal?.aborted) return;
      setPhase(job.status);setProgress(normalizeStudyProgress(job.progress,job.status));
      if (job.status==="cancelled") {abortRef.current?.abort();await savedStudyJob(jobScope,null);setPendingId(null);setBusy(false);setError("أُلغي الطلب. قد يكون نداء المزوّد الجاري قد استهلك حصة.");}
      else if (job.status==="paused") {abortRef.current?.abort();abortRef.current=new AbortController();setBusy(false);}
      else if (action==="resume" && !busy) {const abort=new AbortController();abortRef.current=abort;void resume(id,abort.signal);}
    } catch(reason) {if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "تعذر تغيير حالة الطلب");}
    finally {setControlBusy(false);}
  }
  return <Card style={{ gap: 16 }}>
    <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{names[action]}</Text>
    {resources ? <View style={{ gap: 9 }}><Text style={{ color: colors.textSoft }}>ملف الدرس المعتمد</Text>{resources.map(resource => <Pressable key={resource.id} accessibilityRole="radio" accessibilityState={{ checked: resourceId === resource.id, disabled: busy }} disabled={busy || Boolean(pendingId)} onPress={() => { setResourceId(resource.id); setResult(null); }} style={{ padding: 14, borderRadius: 13, borderWidth: 1, borderColor: resourceId === resource.id ? colors.primary : colors.border, backgroundColor: colors.surfaceAlt, flexDirection: "row", gap: 10 }}><Ionicons name={resourceId === resource.id ? "radio-button-on" : "radio-button-off"} size={20} color={colors.primary}/><Text style={{ color: colors.text, flex: 1 }}>{resource.title}{!resource.lessonId ? " · مشترك للمادة" : ""}</Text></Pressable>)}</View> : <><AppButton title={file?.originalName || "اختيار ملف المحاضرة"} variant="soft" icon="cloud-upload-outline" disabled={busy || Boolean(pendingId)} onPress={() => void upload()}/><Text selectable style={{ color: colors.textSoft, lineHeight: 23 }}>Word · PowerPoint · PDF · صور ونصوص. نستخرج نصوص DOCX وPPTX؛ استخدم PDF للمخططات والصور داخل الملف.</Text></>}
    {action === "summary" && <><Text style={{ color: colors.textSoft }}>لغة الملخص</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{SUMMARY_LANGUAGES.map(option => <AppButton key={option.value} title={option.label} full={false} disabled={busy || Boolean(pendingId)} variant={(language === "العربية" ? "ar" : language) === option.value ? "primary" : "soft"} onPress={() => setLanguage(option.value)}/>)}</View><Text style={{ color: colors.textSoft }}>مستوى التفصيل · لا يغيّر نطاق التغطية</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{SUMMARY_DETAILS.map(option => <AppButton key={option.value} title={option.label} full={false} disabled={busy || Boolean(pendingId)} variant={summaryDetail === option.value ? "primary" : "soft"} onPress={() => setSummaryDetail(option.value)}/>)}</View></>}
    {action === "quiz" && <View style={{ gap: 8 }}><Text style={{ color: colors.textSoft }}>مستوى الصعوبة</Text><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{QUIZ_DIFFICULTIES.map(option => <AppButton key={option.value} full={false} title={option.label} disabled={busy || Boolean(pendingId)} variant={difficulty === option.value ? "primary" : "soft"} onPress={() => setDifficulty(option.value)}/>)}</View></View>}
    {action !== "summary" && <Field label={action === "quiz" ? "لغة الاختبار" : "اللغة المطلوبة"} value={language} maxLength={60} editable={!busy && !pendingId} onChangeText={setLanguage}/>}
    {action === "quiz" && <View style={{ gap: 9 }}><Text style={{ color: colors.textSoft }}>عدد الأسئلة</Text><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{[5, 10, 15, 20].map(count => <AppButton key={count} title={String(count)} full={false} disabled={busy || Boolean(pendingId)} variant={count === questionCount ? "primary" : "soft"} onPress={() => setQuestionCount(count)}/>)}</View></View>}
    <AppButton title={busy ? "جارٍ المعالجة" : names[action]} loading={busy} disabled={Boolean(pendingId) || (resources ? !resourceId : !file) || !language.trim()} onPress={() => void run()}/>
    {busy && <Text selectable accessibilityLiveRegion="polite" style={{ color: colors.primary, lineHeight: 24 }}>{phase === "upload" ? "جارٍ رفع الملف وفحصه…" : phase === "processing" ? "جارٍ إعداد النتيجة…" : phase === "reconnecting" ? "إعادة الاتصال بالطلب المحفوظ…" : phase.startsWith("رفع الأجزاء:") || phase.includes("الملف") ? phase : "طلبك محفوظ في قائمة المعالجة. لا ترسله مجددًا."}</Text>}
    {busy && (phase === "upload" || phase.startsWith("رفع الأجزاء:") || phase.includes("الملف")) && <AppButton title="إيقاف الرفع مؤقتًا" variant="soft" onPress={() => { abortRef.current?.abort(); setBusy(false); setPhase(""); setError("توقف الرفع مؤقتًا. أعد اختيار الملف نفسه لاستئناف الأجزاء الناقصة فقط."); }}/ >}
    {progress && <Text selectable accessibilityLiveRegion="polite" style={{color:colors.textSoft,lineHeight:24}}>{studyProgressLabel(progress)}</Text>}
    {pendingId && progress && <View style={{gap:10}}>
      <AppButton title={phase==="paused" ? "استئناف الأجزاء المتبقية" : "إيقاف المعالجة مؤقتًا"} variant="soft" disabled={controlBusy || progress.phase==="pausing"} onPress={()=>void control(phase==="paused" ? "resume" : "pause")}/>
      {confirmCancel ? <><Text style={{color:colors.textSoft,lineHeight:24}}>لن تبدأ أجزاء جديدة بعد الإلغاء. قد يكون نداء المزوّد الجاري قد استهلك حصة؛ تبقى الأجزاء المعتمدة مؤقتًا وفق سياسة الاحتفاظ.</Text><AppButton title="تأكيد إلغاء الطلب" variant="soft" disabled={controlBusy} onPress={()=>void control("cancel")}/><AppButton title="الرجوع دون إلغاء" variant="ghost" onPress={()=>setConfirmCancel(false)}/></> : <AppButton title="إلغاء المعالجة" variant="ghost" disabled={controlBusy} onPress={()=>setConfirmCancel(true)}/>}
    </View>}
    {error ? <Text selectable accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 24 }}>{error}</Text> : null}
    {pendingId && !busy && <AppButton title="متابعة الطلب المحفوظ" variant="soft" onPress={() => { const abort = new AbortController(); abortRef.current = abort; void resume(pendingId, abort.signal); }}/ >}
    {result?.cached && <Text style={{ color: colors.textSoft }}>نتيجة محفوظة لنفس المصدر والإعدادات، دون طلب توليد جديد.</Text>}
    {result?.artifact && <View style={{ gap: 16 }}><Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{result.artifact.title}</Text><StudyArtifactDownload id={result.artifact.id}/><StudyRichText content={result.artifact.content}/></View>}
    {result?.quiz && <InlineQuiz key={result.quiz.id} id={result.quiz.id}/>}
    <Text style={{ color: colors.textSoft, fontSize: 12, lineHeight: 21 }}>إعداد وتنسيق مراس العلم. المحتوى مساعدة دراسية؛ راجعه مع مرجع المقرر. حقوق المصدر لأصحابه.</Text>
  </Card>;
}

export function LessonStudyTools({ courseSlug, lessonId }: { courseSlug: string; lessonId: string }) {
  const { user } = useAuth(), { colors } = useTheme();
  const [action, setAction] = useState<StudyAction | null>(null);
  const query = useQuery({ queryKey: ["lesson-study-resources", user?.id, courseSlug, lessonId], enabled: Boolean(user), staleTime: 60_000, queryFn: ({ signal }) => api<{ resources: Resource[] }>(`/api/course-resources?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`, { signal }) });
  const resources = (query.data?.resources || []).filter(file => /pdf|wordprocessingml|presentationml|text\/|image\/(png|jpeg)/.test(file.contentType)).sort((a,b) => Number(Boolean(b.lessonId)) - Number(Boolean(a.lessonId)));
  return <View style={{ gap: 12, marginVertical: 16 }}><SectionTitle title="ثبّت فهمك بعد الدرس" subtitle="أدوات مباشرة من ملف الدرس دون إعادة رفعه"/>{query.isLoading ? <LoadingState label="تحميل ملف الدرس…"/> : query.isError ? <><Text selectable style={{ color: colors.danger }}>{query.error.message}</Text><AppButton title="إعادة المحاولة" onPress={() => void query.refetch()}/></> : !resources.length ? <Text style={{ color: colors.textSoft, lineHeight: 24 }}>ستظهر الأدوات هنا عندما تربط الإدارة ملفًا مدعومًا بهذا الدرس.</Text> : action ? <><AppButton title="كل أدوات الدرس" variant="ghost" onPress={() => setAction(null)}/><StudyFileTools key={`${user?.id}.${lessonId}.${action}`} action={action} resources={resources} scope={`${courseSlug}.${lessonId}`}/></> : <View style={{ gap: 12 }}>{(["summary", "translation", "quiz"] as const).map(item => <Pressable accessibilityRole="button" key={item} onPress={() => setAction(item)} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 20, gap: 8 }}><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 18 }}>{names[item]}</Text><Text style={{ color: colors.textSoft, lineHeight: 22 }}>{item === "quiz" ? "بطاقات وأسئلة مع الشرح وإعادة المحاولة" : "نتيجة منظمة في ملف Word يحمل حقوق مراس"}</Text></Pressable>)}</View>}</View>;
}
