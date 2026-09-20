import {useAdminCapabilities} from "@/src/lib/admin-capabilities";
import {useAuth} from "@/src/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import { Platform, Switch, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, Field, SectionTitle } from "@/src/components/ui";
import { api, apiUpload, jsonBody } from "@/src/lib/api";
import { assetMimeType } from "@/src/lib/file-types";
import { useTheme } from "@/src/providers/ThemeProvider";

type Source = { id: number; title: string; description: string; lessonId: string | null; status: string; studentVisible: boolean; scanStatus: string; sortOrder: number };
type Sources = { resources: Source[]; lessons: { id: string; title: string }[] };
const officeTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "image/png", "image/jpeg"];

/** Uses the same protected resource API and scan workflow as the web administrator. */
export function AdminLessonSources({ courses }: { courses: { slug: string; title: string }[] }) {
  const { colors } = useTheme(); const access=useAdminCapabilities(); const {user}=useAuth();
  const [course, setCourse] = useState(""), [lesson, setLesson] = useState(""), [title, setTitle] = useState("");
  const [asset, setAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [visible, setVisible] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const sources = useQuery({ queryKey: ["admin-lesson-sources",user?.id,access.permissions.join(","),course], queryFn: ({signal}) => api<Sources>(`/api/admin/course-resources?course=${encodeURIComponent(course)}`,{signal}), enabled: Boolean(course)&&access.can(["catalog.view"]) });
  const lessons = [{ key: "", label: "ملف مشترك لكل دروس المادة" }, ...(sources.data?.lessons || []).map(row => ({ key: row.id, label: row.title }))];
  async function pick() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: officeTypes, multiple: false, copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      if ((result.assets[0].size || 0) > 25 * 1024 * 1024) throw new Error("الحد الأقصى لملف الدرس 25 ميجابايت. للأدوات استخدم ملفًا لا يتجاوز 20 ميجابايت.");
      setAsset(result.assets[0]); if (!title.trim()) setTitle(result.assets[0].name.replace(/\.[^.]+$/, "")); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر اختيار الملف."); }
  }
  async function upload() {
    if (!course || !asset || busy || !access.can(["catalog.manage"])) return;
    setBusy(true); setMessage("");
    try {
      const form = new FormData();
      form.append("title", title.trim()); form.append("lessonId", lesson); form.append("studentVisible", String(visible)); form.append("sortOrder", "0");
      if (Platform.OS === "web" && asset.file) form.append("file", asset.file, asset.name);
      else form.append("file", { uri: asset.uri, name: asset.name, type: assetMimeType(asset, "application/octet-stream") } as unknown as Blob);
      await apiUpload(`/api/admin/course-resources?course=${encodeURIComponent(course)}`, form, { timeoutMs: 15 * 60_000 });
      setAsset(null); setTitle(""); setMessage("تم رفع الملف وربطه. إن كان الفحص معلقًا، حدّث القائمة ثم فعّل ظهوره بعد اجتياز الفحص."); await sources.refetch();
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر رفع الملف."); }
    finally { setBusy(false); }
  }
  async function update(row: Source, changes: Partial<Source>) {
    if (busy || !access.can(["catalog.manage"])) return; setBusy(true); setMessage("");
    try {
      await api("/api/admin/course-resources", { method: "PATCH", body: jsonBody({ action: "update", ...row, ...changes }) });
      setMessage("تم تحديث ربط الملف وظهوره."); await sources.refetch();
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر حفظ التعديل."); }
    finally { setBusy(false); }
  }
  return <>
    <SectionTitle title="ملفات الدروس وأدواتها" subtitle="اربط ملفًا بكل درس ليستخدمه الطالب مباشرة تحت الفيديو" />
    <Card style={{ gap: 14 }}>
      <SearchPicker placeholder="اختر المادة" label="المادة" value={course} items={courses.map(row => ({ key: row.slug, label: row.title }))} onSelect={item => { if (busy) return; setCourse(item.key); setLesson(""); setAsset(null); setTitle(""); setMessage(""); }} />
      {course ? <>
        {access.can(["catalog.manage"]) && <><SearchPicker placeholder="ملف مشترك" label="ربط الملف بالدرس" value={lesson} items={lessons} onSelect={item => { if (!busy) setLesson(item.key); }} />
        <Field label="عنوان الملف" value={title} maxLength={180} editable={!busy} onChangeText={setTitle} />
        <Text selectable style={{ color: colors.textSoft, lineHeight: 23 }}>Word وPowerPoint وPDF. اختر «مشترك» لملف المادة كله، أو حدد درسًا بعينه. الملفات غير الآمنة لا تظهر للطلاب.</Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><Switch value={visible} onValueChange={setVisible} disabled={busy} accessibilityLabel="إظهار الملف للمشتركين بعد الفحص" /><Text style={{ color: colors.text }}>إظهار للمشتركين بعد الفحص</Text></View>
        <AppButton title={asset?.name || "اختيار ملف الدرس"} variant="soft" disabled={busy} onPress={() => void pick()} />
        <AppButton title="رفع وربط الملف" loading={busy} disabled={!asset || title.trim().length < 2 || sources.isLoading || sources.isError} onPress={() => void upload()} />
        </>}<AppButton title="تحديث الملفات وحالة الفحص" variant="soft" disabled={busy} onPress={() => void sources.refetch()} />
        {sources.error ? <Text selectable style={{ color: colors.danger }}>{sources.error.message}</Text> : null}
        {sources.data?.resources.map(row => <View key={row.id} style={{ gap: 10, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }}>
          <Text selectable style={{ color: colors.text, fontWeight: "800" }}>{row.title}</Text>
          <Text selectable style={{ color: colors.textSoft }}>الفحص: {row.scanStatus} · {row.studentVisible ? "ظاهر" : "مخفي"}</Text>
          {access.can(["catalog.manage"])&&<><SearchPicker placeholder="ملف مشترك" label="الدرس المرتبط" value={row.lessonId || ""} items={lessons} onSelect={item => { if (!busy) void update(row, { lessonId: item.key || null }); }} />
          <AppButton title={row.studentVisible ? "إخفاء عن الطلاب" : "إظهار للمشتركين"} variant="soft" disabled={busy || (!row.studentVisible && row.scanStatus !== "clean")} onPress={() => void update(row, { studentVisible: !row.studentVisible, status: "active" })} /></>}
        </View>)}
      </> : null}
      {message ? <Text selectable accessibilityLiveRegion="polite" style={{ color: colors.text, lineHeight: 24 }}>{message}</Text> : null}
    </Card>
  </>;
}
