import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import React, { useMemo, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppearanceSettings } from "@/src/components/AppearanceSettings";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, EmptyState, Field, LoadingState, Screen, SearchBox, SectionTitle } from "@/src/components/ui";
import { absoluteUrl, api, ApiError, getApiToken, jsonBody } from "@/src/lib/api";
import { assetMimeType } from "@/src/lib/file-types";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Course } from "@/src/types";

type UnitRow = { id: number; courseSlug: string; title: string; position: number; status: string };
type LessonRow = { id: string; courseSlug: string; unitId: number; title: string; position: number; durationSeconds: number; freePreview: boolean; status: string; videoAssetId: number | null };
type VideoRow = { id: number; courseSlug: string; lessonId: string; status: string; sizeBytes: number; createdAt: string };
type Workspace = { ok: true; courses: Course[]; units: UnitRow[]; lessons: LessonRow[]; videos: VideoRow[]; assignments: { id: number; institutionSlug: string | null; specialty: string | null }[] };
type RequestRow = { id: number; courseName: string; university: string; specialty: string; status: string; notes: string; attachmentsCount: number; createdAt: string; files: { id: number; originalName: string; sizeBytes: number }[] };
type RequestsPayload = { ok: true; requests: RequestRow[] };
type Tab = "requests" | "content" | "appearance";

const statuses = ["assigned", "reviewing", "planned", "producing", "available", "declined"];
const labels: Record<string, string> = { assigned: "مسند", reviewing: "مراجعة", planned: "مخطط", producing: "إنتاج", available: "متاح", declined: "متعذر" };

export default function Supervisor() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const allowed = user?.role === "supervisor" || user?.role === "admin";
  const [tab, setTab] = useState<Tab>("requests");
  const [feedback, setFeedback] = useState("");
  const [openingFile, setOpeningFile] = useState<number | null>(null);
  const workspace = useQuery({ queryKey: ["supervisor-workspace"], queryFn: () => api<Workspace>("/api/supervisor/workspace"), enabled: allowed });
  const requests = useQuery({ queryKey: ["supervisor-requests"], queryFn: () => api<RequestsPayload>("/api/supervisor/requests"), enabled: allowed });

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["supervisor-workspace"] }),
      client.invalidateQueries({ queryKey: ["supervisor-requests"] }),
    ]);
  };
  const run = async (task: () => Promise<unknown>, success: string) => {
    setFeedback("");
    try { await task(); setFeedback(success); await refresh(); }
    catch (reason) { setFeedback(reason instanceof ApiError ? reason.message : "تعذر تنفيذ الإجراء"); }
  };

  if (!allowed) return <Screen><AppHeader title="مساحة المشرف" back /><EmptyState icon="lock-closed-outline" title="غير مصرح" text="هذه المساحة تظهر فقط للمشرفين الذين عيّنتهم الإدارة." /></Screen>;
  if (workspace.isLoading || requests.isLoading) return <Screen><LoadingState label="جارٍ تجهيز مساحة الإشراف..." /></Screen>;
  if (workspace.isError || requests.isError || !workspace.data || !requests.data) return <Screen><AppHeader title="مساحة المشرف" back /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل مساحة الإشراف" text="تحقق من الاتصال ثم أعد المحاولة." action={<AppButton title="إعادة المحاولة" onPress={() => { void workspace.refetch(); void requests.refetch(); }} />} /></Screen>;
  return <Screen keyboard>
    <AppHeader title="مساحة المشرف" subtitle={`${workspace.data?.courses.length || 0} مواد ضمن نطاقك`} back />
    <View style={styles.tabs}>
      <TabButton active={tab === "requests"} label="طلبات الطلاب" icon="file-tray-full-outline" onPress={() => setTab("requests")} colors={colors} />
      <TabButton active={tab === "content"} label="إدارة المحتوى" icon="videocam-outline" onPress={() => setTab("content")} colors={colors} />
      <TabButton active={tab === "appearance"} label="المظهر" icon="color-palette-outline" onPress={() => setTab("appearance")} colors={colors} />
    </View>
    {feedback ? <Text style={[styles.feedback, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text> : null}
    {tab === "requests" ? <RequestQueue rows={requests.data?.requests || []} colors={colors} run={run} openingFile={openingFile} onOpenFile={async (file) => { setOpeningFile(file.id); try { const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ""}maras-request-${file.id}-${encodeURIComponent(file.originalName).replace(/%/g, "_")}`; const result = await FileSystem.downloadAsync(absoluteUrl(`/api/supervisor/request-files/${file.id}`), uri, { headers: { authorization: `Bearer ${getApiToken()}` } }); await Linking.openURL(result.uri); } catch (reason) { setFeedback(reason instanceof ApiError ? reason.message : "تعذر فتح المرفق من الخادم"); } finally { setOpeningFile(null); } }} /> : tab === "content" ? <ContentManager data={workspace.data!} colors={colors} run={run} /> : <AppearanceSettings />}
  </Screen>;
}

function TabButton({ active, label, icon, onPress, colors }: { active: boolean; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <Pressable onPress={onPress} style={[styles.tab, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}><Ionicons name={icon} size={20} color={active ? "#FFF" : colors.primary} /><Text style={{ color: active ? "#FFF" : colors.text, fontSize: 11, fontWeight: "900" }}>{label}</Text></Pressable>;
}

function RequestQueue({ rows, colors, run, openingFile, onOpenFile }: { rows: RequestRow[]; colors: ReturnType<typeof useTheme>["colors"]; run: (task: () => Promise<unknown>, success: string) => Promise<void>; openingFile: number | null; onOpenFile: (file: RequestRow["files"][number]) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const filtered = useMemo(() => rows.filter((row) => {
    const statusOk = statusFilter === "الكل" || row.status === statusFilter;
    const needle = query.trim().toLocaleLowerCase("ar");
    const queryOk = !needle || `${row.courseName} ${row.university} ${row.specialty} ${row.notes}`.toLocaleLowerCase("ar").includes(needle);
    return statusOk && queryOk;
  }), [query, rows, statusFilter]);
  return <>
    <SectionTitle title="طابور طلبات المواد" subtitle={`${filtered.length} طلب ظاهر · التغيير يرسل تحديثًا فوريًا للطالب`} />
    <SearchBox value={query} onChangeText={setQuery} placeholder="ابحث باسم المادة أو الجامعة أو التخصص" />
    <View style={styles.requestFilters}>
      {["الكل", ...statuses].map((status) => <Pressable key={status} onPress={() => setStatusFilter(status)} style={[styles.filterChip, { backgroundColor: statusFilter === status ? colors.primary : colors.surface, borderColor: statusFilter === status ? colors.primary : colors.border }]}><Text style={{ color: statusFilter === status ? "#FFF" : colors.text, fontSize: 9, fontWeight: "800" }}>{status === "الكل" ? status : labels[status]}</Text></Pressable>)}
    </View>
    {filtered.length ? filtered.map((row) => <Card key={row.id} style={styles.request}>
      <View style={styles.requestHead}><View style={[styles.counter, { backgroundColor: colors.surfaceAlt }]}><Text style={{ color: colors.primary, fontWeight: "900" }}>#{row.id}</Text></View><View style={styles.flex}><Text style={[styles.title, { color: colors.text }]}>{row.courseName}</Text><Text style={[styles.meta, { color: colors.textSoft }]}>{row.university} · {row.specialty}</Text></View></View>
      {row.notes ? <Text style={[styles.notes, { color: colors.text }]}>{row.notes}</Text> : null}
      <Text style={[styles.meta, { color: colors.textSoft }]}>{row.attachmentsCount} مرفقات · {new Date(row.createdAt).toLocaleDateString("ar-SA")}</Text>
      {row.files?.map((file) => <Pressable key={file.id} accessibilityRole="button" accessibilityLabel={`فتح المرفق ${file.originalName}`} onPress={() => void onOpenFile(file)} disabled={openingFile === file.id} style={[styles.file, { borderColor: colors.border, opacity: openingFile === file.id ? .55 : 1 }]}><Ionicons name={openingFile === file.id ? "hourglass-outline" : "document-outline"} size={17} color={colors.primary} /><Text numberOfLines={1} style={[styles.fileName, { color: colors.text }]}>{file.originalName}</Text><Text style={[styles.fileSize, { color: colors.textSoft }]}>{openingFile === file.id ? "جارٍ الفتح" : `${Math.ceil(file.sizeBytes / 1024)} KB`}</Text></Pressable>)}
      <Text style={[styles.fieldLabel, { color: colors.text }]}>تحديث حالة الطلب</Text>
      <View style={styles.statusGrid}>{statuses.map((status) => <Pressable key={status} onPress={() => run(() => api("/api/supervisor/requests", { method: "PATCH", body: jsonBody({ id: row.id, status }) }), "تم تحديث الطلب وإشعار الطالب")} style={[styles.status, { backgroundColor: row.status === status ? colors.primary : colors.surfaceAlt, borderColor: row.status === status ? colors.primary : colors.border }]}><Text style={{ color: row.status === status ? "#FFF" : colors.text, fontSize: 8, fontWeight: "800" }}>{labels[status]}</Text></Pressable>)}</View>
    </Card>) : <EmptyState icon="checkmark-done-circle-outline" title="لا توجد طلبات مطابقة" text={rows.length ? "غيّر البحث أو الفلتر لإظهار طلبات أخرى." : "لا توجد طلبات جديدة ضمن نطاق إشرافك الآن."} />}
  </>;
}
function ContentManager({ data, colors, run }: { data: Workspace; colors: ReturnType<typeof useTheme>["colors"]; run: (task: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [courseSlug, setCourseSlug] = useState(data.courses[0]?.slug || "");
  const [unitTitle, setUnitTitle] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const units = useMemo(() => data.units.filter((row) => row.courseSlug === courseSlug), [courseSlug, data.units]);
  const lessons = useMemo(() => data.lessons.filter((row) => row.courseSlug === courseSlug), [courseSlug, data.lessons]);
  const [unitId, setUnitId] = useState<number | null>(units[0]?.id || null);
  const [uploadingLesson, setUploadingLesson] = useState<string | null>(null);
  const activeUnitId = unitId ?? units[0]?.id ?? null;
  const selected = data.courses.find((row) => row.slug === courseSlug);

  const changeCourse = (slug: string) => { setCourseSlug(slug); setUnitId(data.units.find((row) => row.courseSlug === slug)?.id || null); };
  const addUnit = () => run(async () => { await api("/api/supervisor/workspace", { method: "POST", body: jsonBody({ action: "saveUnit", courseSlug, title: unitTitle, position: units.length }) }); setUnitTitle(""); }, "تم إنشاء الوحدة");
  const addLesson = () => run(async () => { await api("/api/supervisor/workspace", { method: "POST", body: jsonBody({ action: "saveLesson", courseSlug, unitId: activeUnitId, id: lessonId.trim(), title: lessonTitle, position: lessons.filter((row) => row.unitId === activeUnitId).length, durationSeconds: Math.max(0, Number(durationMinutes) * 60), freePreview: false }) }); setLessonId(""); setLessonTitle(""); setDurationMinutes(""); }, "تم إنشاء الدرس");
  const upload = async (target: LessonRow) => {
    const result = await DocumentPicker.getDocumentAsync({ type: "video/*", multiple: false, copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    if (!file) return;
    setUploadingLesson(target.id);
    await run(async () => {
      const contentType = assetMimeType(file, /\.mov$/i.test(file.name) ? "video/quicktime" : "video/mp4");
      const response = await FileSystem.uploadAsync(absoluteUrl("/api/admin/videos"), file.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${getApiToken()}`,
          "content-type": contentType,
          "x-meras-client": "mobile-v1",
          "x-meras-course": courseSlug,
          "x-meras-lesson": target.id,
        },
      });
      let payload: { error?: string } = {};
      try { payload = response.body ? JSON.parse(response.body) as { error?: string } : {}; } catch { /* Keep the HTTP status as the source of truth. */ }
      if (response.status < 200 || response.status >= 300) throw new ApiError(payload.error || "تعذر رفع الفيديو", response.status);
    }, "تم رفع الفيديو إلى التخزين الخاص");
    setUploadingLesson(null);
  };

  if (!data.courses.length) return <EmptyState icon="albums-outline" title="لا توجد مواد مسندة" text="تحتاج الإدارة إلى ربط حسابك بجامعة أو تخصص أو مادة قابلة للتحرير." />;
  return <>
    <SectionTitle title="المادة المسندة" subtitle="أنشئ الوحدات والدروس وارفع الفيديو إلى المخزن الخاص" />
    <SearchPicker label="المادة" value={courseSlug} placeholder="اختر المادة المسندة" items={data.courses.map((course) => ({ key: course.slug, label: course.title, detail: `${course.university} · ${course.specialty}` }))} onSelect={(item) => changeCourse(item.key)} />
    {selected ? <Card><Text style={[styles.title, { color: colors.text }]}>{selected.title}</Text><Text style={[styles.meta, { color: colors.textSoft }]}>{selected.university} · {selected.specialty}</Text></Card> : null}
    <SectionTitle title="إضافة وحدة" />
    <Card><Field label="عنوان الوحدة" value={unitTitle} onChangeText={setUnitTitle} placeholder="مثال: أساسيات الفصل الأول" /><AppButton title="إنشاء الوحدة" icon="add-circle-outline" disabled={!courseSlug || unitTitle.trim().length < 2} onPress={addUnit} /></Card>
    <SectionTitle title="إضافة درس" subtitle="المعرّف إنجليزي فريد، مثل chapter-1-intro" />
    <Card>
      <SearchPicker label="الوحدة" value={activeUnitId ? String(activeUnitId) : undefined} placeholder="اختر الوحدة" items={units.map((unit) => ({ key: String(unit.id), label: unit.title }))} onSelect={(item) => setUnitId(Number(item.key))} disabled={!units.length} />
      <Field label="معرّف الدرس" value={lessonId} onChangeText={(value) => setLessonId(value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase())} placeholder="lesson-01" autoCapitalize="none" />
      <Field label="عنوان الدرس" value={lessonTitle} onChangeText={setLessonTitle} placeholder="شرح المفهوم الأساسي" />
      <Field label="المدة بالدقائق" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" placeholder="15" />
      <AppButton title="إنشاء الدرس" icon="add-outline" disabled={!activeUnitId || lessonId.length < 2 || lessonTitle.trim().length < 2} onPress={addLesson} />
    </Card>
    <SectionTitle title="الدروس والفيديو" subtitle="حد الرفع 200 ميجابايت، والرابط النهائي مؤقت وموقّع" />
    {units.map((unit) => <Card key={unit.id} style={styles.unitCard}><Text style={[styles.unitTitle, { color: colors.text }]}>{unit.title}</Text>{lessons.filter((row) => row.unitId === unit.id).map((lesson) => { const ready = data.videos.some((video) => video.lessonId === lesson.id && video.status === "ready"); return <View key={lesson.id} style={[styles.lesson, { borderTopColor: colors.border }]}><View style={[styles.videoState, { backgroundColor: ready ? `${colors.success}18` : colors.surfaceAlt }]}><Ionicons name={ready ? "checkmark-circle" : "videocam-outline"} size={20} color={ready ? colors.success : colors.primary} /></View><View style={styles.flex}><Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text><Text style={[styles.meta, { color: colors.textSoft }]}>{lesson.id} · {ready ? "فيديو جاهز" : "بانتظار الفيديو"}</Text></View><AppButton full={false} title={ready ? "استبدال" : "رفع"} variant="soft" loading={uploadingLesson === lesson.id} onPress={() => upload(lesson)} /></View>; })}</Card>)}
  </>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, tabs: { flexDirection: "row-reverse", gap: 9 }, tab: { flex: 1, minHeight: 65, borderWidth: 1, borderRadius: 18, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 }, feedback: { fontSize: 10, fontWeight: "800", textAlign: "center", marginTop: 12 }, request: { marginBottom: 10 }, requestHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 }, counter: { minWidth: 48, minHeight: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, title: { fontSize: 14, fontWeight: "900", textAlign: "right" }, meta: { fontSize: 8, marginTop: 4, textAlign: "right" }, notes: { fontSize: 10, lineHeight: 18, textAlign: "right", marginVertical: 10 }, file: { minHeight: 42, borderTopWidth: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, fileName: { flex: 1, fontSize: 9, textAlign: "right" }, fileSize: { fontSize: 7 }, statuses: { flexDirection: "row-reverse", gap: 6, paddingVertical: 9 }, requestFilters: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginVertical: 12 }, filterChip: { minHeight: 36, minWidth: 72, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" }, statusGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, paddingVertical: 9 }, status: { flexBasis: "30%", flexGrow: 1, minHeight: 37, paddingHorizontal: 9, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" }, courses: { flexDirection: "row-reverse", gap: 8, paddingBottom: 12 }, courseChip: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }, fieldLabel: { fontSize: 12, fontWeight: "800", textAlign: "right", marginBottom: 5 }, unitCard: { marginBottom: 10, paddingVertical: 7 }, unitTitle: { fontSize: 14, fontWeight: "900", textAlign: "right", padding: 9 }, lesson: { minHeight: 75, borderTopWidth: 1, flexDirection: "row-reverse", alignItems: "center", gap: 9, paddingVertical: 10 }, lessonTitle: { fontSize: 10, fontWeight: "900", textAlign: "right" }, videoState: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" } });
