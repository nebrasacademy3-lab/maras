import { InstructorAssignments } from "@/src/components/instructor-assignments";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, type Href } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { AppHeader } from "@/src/components/AppHeader";
import { InstructorContracts } from "@/src/components/instructor-contracts";
import { InstructorProfileFields } from "@/src/components/instructor-profile-fields";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, EmptyState, Field, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { RegisteredDevices } from "@/src/components/RegisteredDevices";
import { AccountMfaPanel } from "@/src/components/account-mfa-panel";
import { api, apiUpload, ApiError, formatUploadProgress, getApiToken, jsonBody, type ApiUploadProgress } from "@/src/lib/api";
import { downloadProtectedFile } from "@/src/lib/downloads";
import { MerasAlert } from "@/src/lib/interaction-events";
import { INSTRUCTOR_DEFAULT_PROFILE, INSTRUCTOR_DOCUMENT_LABELS, instructorApplicationEditable, instructorReadyToSubmit, type InstructorBank, type InstructorDocument, type InstructorDocumentKind, type InstructorProfileInput, type InstructorProfileResponse } from "@/src/lib/instructor";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

const statusLabels: Record<string, string> = { draft: "مسودة طلب الانضمام", submitted: "طلبك قيد المراجعة", changes_requested: "تحتاج الإدارة بعض التعديلات", approved: "تمت الموافقة على طلبك", rejected: "لم يُقبل الطلب", suspended: "الملف موقوف" };

export default function InstructorScreen() {
  const { user, loading } = useAuth();
  if (loading) return <Screen><LoadingState /></Screen>;
  if (!user) return <Screen><AppHeader title="فريق مراس للشارحين" subtitle="معرفتك تستحق أن تصل" back /><EmptyState icon="school-outline" title="انضم لفريق مراس كشارح" text="قدّم خبرتك والمواد التي تستطيع شرحها. نراجع الطلب، ونتفق على الأجر وفترة التجربة وحقوق المحتوى في عقد واضح. يمكنك العمل حسب الساعات أو حسب المادة." action={<View style={{ gap: 10 }}><AppButton title="إنشاء حساب شارح" onPress={() => router.push("/instructor-register" as Href)} /><AppButton title="تسجيل الدخول" variant="soft" onPress={() => router.push("/(auth)/login?return_to=%2Finstructor" as Href)} /></View>} /></Screen>;
  if (user.role !== "instructor") return <Screen><AppHeader title="مساحة الشارح" back /><EmptyState icon="person-circle-outline" title="حساب مستقل للشارح" text="أنت الآن تستخدم حسابًا آخر. مساحة الشارح متاحة لحسابات الشارحين فقط، ولا تمنح صلاحيات الإدارة أو الإشراف." action={<AppButton title="العودة إلى حسابي" onPress={() => router.replace("/(tabs)/account")} />} /></Screen>;
  if (!user.emailVerified) return <Redirect href={"/verify-email?return_to=%2Finstructor" as Href} />;
  return <InstructorWorkspace key={user.id} userId={user.id} />;
}

function InstructorWorkspace({ userId }: { userId: number }) {
  const { colors } = useTheme();
  const query = useQuery({ queryKey: ["instructor-profile", userId], queryFn: ({ signal }) => api<InstructorProfileResponse>("/api/instructor/profile", { signal }), staleTime: 30_000, retry: false });
  if (query.isLoading) return <Screen><AppHeader title="مساحة الشارح" back /><LoadingState /></Screen>;
  if (!query.data) return <Screen><AppHeader title="مساحة الشارح" back /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل ملف الشارح" text={query.error instanceof Error ? query.error.message : "تحقق من الاتصال ثم أعد المحاولة."} action={<AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} />} /></Screen>;
  const data = query.data;
  return <Screen keyboard><AppHeader title="مساحة الشارح" subtitle={data.user.fullName} back />
    <Card style={{ gap: 10, marginBottom: 18, backgroundColor: colors.surfaceAlt }}><Text accessibilityRole="header" style={{ color: colors.primary, fontSize: 23, fontWeight: "800", textAlign: "right" }}>{statusLabels[data.profile.status] || data.profile.status}</Text><Text style={{ color: colors.textSoft, fontSize: 15, lineHeight: 26, textAlign: "right" }}>{data.profile.status === "submitted" ? "استلمت الإدارة ملفك. يمكنك متابعة الحالة هنا، وستصلك المستجدات في إشعارات حسابك. المستندات مقفلة أثناء المراجعة." : data.profile.status === "approved" ? "تابع إشعارات حسابك لمعرفة خطوات التعاقد والمواد المسندة إليك. الأجر والالتزامات تحدد في العقد المعتمد." : "أكمل نبذتك، ثم أضف مستنداتك وصورتك الشخصية. عند جاهزية الملف أرسله إلى الإدارة للمراجعة."}</Text>{data.profile.reviewNotes ? <Text style={{ color: colors.text, fontSize: 15, lineHeight: 25, textAlign: "right" }}>ملاحظة الإدارة: {data.profile.reviewNotes}</Text> : null}<AppButton title="تحديث الحالة" variant="ghost" loading={query.isFetching} onPress={() => void query.refetch()} /></Card>
    <InstructorEditor key={data.profile.revision} data={data} refresh={async () => { const updated = await query.refetch(); return !updated.isError; }} />
    <InstructorContracts userId={userId} />
    <InstructorAssignments userId={userId} />
    <SectionTitle title="حماية حساب الشارح" subtitle="حساب مستقل؛ الأدوار والصلاحيات يحددها الخادم" />
    <RegisteredDevices /><AccountMfaPanel />
    <View style={{ gap: 10, marginTop: 18 }}><AppButton title="إشعاراتي" variant="soft" onPress={() => router.push("/notifications")} /><AppButton title="الدعم الفني" variant="ghost" onPress={() => router.push("/support")} /><AppButton title="الأمان وكلمة المرور" variant="ghost" onPress={() => router.push("/security")} /></View>
  </Screen>;
}

function profileFields(value: InstructorProfileInput): InstructorProfileInput {
  return Object.fromEntries(Object.keys(INSTRUCTOR_DEFAULT_PROFILE).map(key => [key, value[key as keyof InstructorProfileInput]])) as InstructorProfileInput;
}
function InstructorEditor({ data, refresh }: { data: InstructorProfileResponse; refresh: () => Promise<boolean> }) {
  const { colors } = useTheme();
  const [form, setForm] = useState(() => profileFields(data.profile));
  const [bank, setBank] = useState<InstructorBank>(() => data.profile.bank || { accountHolder: data.user.fullName, bankName: "", iban: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<ApiUploadProgress | null>(null);
  const mounted = useRef(true), writing = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const editable = instructorApplicationEditable(data.profile.status);
  const dirty = JSON.stringify(form) !== JSON.stringify(profileFields(data.profile));
  const text = { color: colors.textSoft, fontSize: 14, lineHeight: 25, textAlign: "right" as const };
  const assertActive = (token: string) => { if (!mounted.current || getApiToken() !== token) throw new ApiError("تغير الحساب أو أُغلقت الصفحة. لم تُرسل المستندات للحساب الجديد.", 409); };
  async function operation(key: string, work: (token: string, signal: AbortSignal) => Promise<void>) {
    if (writing.current) return;
    const token = getApiToken(); writing.current = true; setBusy(key); setMessage("");
    const abort = new AbortController(); controller.current = abort;
    try { await work(token, abort.signal); }
    catch (error) { if (mounted.current && getApiToken() === token) setMessage(error instanceof Error ? error.message : "تعذر إكمال العملية. حاول مرة أخرى."); }
    finally { if (mounted.current) { setBusy(""); setProgress(null); } writing.current = false; controller.current = null; }
  }
  async function updated(token: string) {
    assertActive(token);
    setMessage("تم حفظ التغيير. جارٍ تحديث الملف…");
    if (!await refresh() && mounted.current) setMessage("تم تنفيذ التغيير، لكن تعذر تحديث العرض. حدّث الحالة قبل تكرار العملية.");
  }
  const save = (action: "save" | "bank" | "submit") => operation(action, async (token, signal) => {
    assertActive(token);
    await api("/api/instructor/profile", { method: "POST", signal, body: jsonBody({ action, expectedRevision: data.profile.revision, ...(action === "save" ? form : action === "bank" ? { bank } : {}) }) });
    await updated(token);
  });
  async function upload(kind: InstructorDocumentKind) {
    if (!editable || dirty || ((kind === "selfie" || kind.startsWith("identity_") || kind === "passport") && (!data.identityCollection.enabled || !consent))) return;
    await operation(kind, async (token, signal) => {
      let uri = "";
      try {
        let file: { uri: string; name: string; mimeType: string; size?: number } | null = null;
        if (kind === "selfie") {
          const camera = await import("expo-image-picker");
          const permission = await camera.requestCameraPermissionsAsync();
          assertActive(token);
          if (!permission.granted) { setMessage("نحتاج إذن الكاميرا لالتقاط صورتك الشخصية. يمكنك تفعيله من إعدادات الجهاز ثم المحاولة."); return; }
          const result = await camera.launchCameraAsync({ mediaTypes: ["images"], cameraType: camera.CameraType.front, allowsEditing: false, quality: 0.85, exif: false, base64: false });
          uri = result.assets?.[0]?.uri || "";
          assertActive(token);
          if (result.canceled || !result.assets[0]) return;
          const image = result.assets[0]; file = { uri: image.uri, name: "selfie.jpg", mimeType: image.mimeType || "image/jpeg", size: image.fileSize };
        } else {
          const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], multiple: false, copyToCacheDirectory: true });
          uri = result.assets?.[0]?.uri || "";
          assertActive(token);
          if (result.canceled || !result.assets[0]) return;
          const asset = result.assets[0]; file = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType || "application/octet-stream", size: asset.size };
        }
        uri = file.uri;
        if (file.size && file.size > 10 * 1024 * 1024) throw new Error("اختر ملفًا لا يتجاوز 10 ميجابايت.");
        const body = new FormData(); body.append("kind", kind); body.append("expectedRevision", String(data.profile.revision));
        if (kind === "selfie") body.append("captureSource", "camera");
        if (Platform.OS === "web") { const blob = await (await fetch(file.uri)).blob(); assertActive(token); body.append("file", blob, file.name); }
        else body.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
        assertActive(token);
        await apiUpload("/api/instructor/documents", body, { timeoutMs: 90_000, signal, onProgress: value => mounted.current && setProgress(value) });
        await updated(token);
      } finally {
        if (uri && FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
    });
  }
  function remove(document: InstructorDocument) {
    const initialToken = getApiToken();
    MerasAlert.alert("حذف المستند", "هل تريد حذف هذا المستند من طلب الانضمام؟ يمكنك رفع بديل بعد الحذف.", [{ text: "إلغاء", style: "cancel" }, { text: "حذف المستند", style: "destructive", onPress: () => {
      if (!mounted.current || getApiToken() !== initialToken) return;
      void operation("delete-" + document.id, async (token, signal) => { assertActive(token); await api("/api/instructor/documents/" + document.id, { method: "DELETE", signal, body: jsonBody({ expectedRevision: data.profile.revision }) }); await updated(token); });
    } }]);
  }
  const download = (document: InstructorDocument) => operation("download-" + document.id, async (token) => { assertActive(token); await downloadProtectedFile({ path: "/api/instructor/documents/" + document.id, fileName: document.originalName, mimeType: document.contentType, saveToFiles: true }); });
  const submit = () => {
    const token = getApiToken();
    MerasAlert.alert("تقديم الطلب للإدارة", "تأكد من اكتمال بياناتك ومستنداتك. بعد الإرسال يقفل الملف حتى تنتهي المراجعة أو تطلب الإدارة تعديلات.", [{ text: "مراجعة لاحقًا", style: "cancel" }, { text: "تقديم الطلب", onPress: () => { if (mounted.current && getApiToken() === token) void save("submit"); } }]);
  };
  return <View style={{ gap: 18 }}>
    <Card style={{ gap: 12 }}><SectionTitle title="ملفك المهني" subtitle="أظهر قدرتك على شرح المواد التي تتقنها" /><InstructorProfileFields value={form} onChange={setForm} disabled={!editable || Boolean(busy)} />{editable ? <AppButton title="حفظ الملف" loading={busy === "save"} disabled={!dirty || Boolean(busy)} onPress={() => void save("save")} /> : null}</Card>
    {dirty ? <Text style={{ ...text, color: colors.warning }}>احفظ تعديل بياناتك قبل رفع المستندات أو تقديم الطلب أو تغيير الحساب البنكي.</Text> : null}
    <Card style={{ gap: 12 }}><SectionTitle title="المستندات والتحقق" subtitle="JPEG أو PNG أو PDF · حتى 10 ميجابايت للملف · 12 مستندًا كحد أقصى" /><Text style={text}>أرفق جواز السفر أو وجهي الهوية، وصورة شخصية تلتقطها الآن من الكاميرا. السيرة الذاتية والشهادات تدعم خبرتك. التقاط الصورة لا يُعد إثبات حضور حيوي آليًا؛ تراجع الإدارة المستندات.</Text>
      {data.identityCollection.enabled ? <><Text style={text}>غرض وأساس طلب الهوية: {data.identityCollection.basis}</Text><Text style={text}>مدة حفظ مستندات التحقق المحددة: {data.identityCollection.retentionDays} يومًا.</Text>{editable ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(value => !value)} style={{ flexDirection: "row-reverse", gap: 8, paddingVertical: 12 }}><Ionicons name={consent ? "checkbox" : "square-outline"} color={colors.primary} size={26} /><Text style={{ ...text, flex: 1 }}>قرأت غرض جمع مستندات التحقق ومدة حفظها وسياسة الخصوصية، وأؤكد أن المستندات تخصني.</Text></Pressable> : null}</> : <Text style={{ ...text, color: colors.warning }}>استقبال مستندات الهوية قيد الإعداد لدى الإدارة. يمكنك حفظ بياناتك وإرفاق السيرة الذاتية والشهادات الآن.</Text>}
      {data.documents.map(document => <View key={document.id} style={{ gap: 7, paddingVertical: 13, borderTopWidth: 1, borderColor: colors.border }}><Text style={{ ...text, color: colors.text, fontWeight: "800" }}>{INSTRUCTOR_DOCUMENT_LABELS[document.kind]}</Text><Text style={text}>{document.originalName} · {(document.sizeBytes / 1024 / 1024).toFixed(1)} م.ب{document.expiresAt ? " · ينتهي الاحتفاظ " + new Date(document.expiresAt).toLocaleDateString("ar-SA") : ""}</Text><AppButton title="تحميل نسختي" variant="ghost" disabled={Boolean(busy)} loading={busy === "download-" + document.id} onPress={() => void download(document)} />{editable ? <AppButton title="حذف المستند" variant="danger" disabled={dirty || Boolean(busy)} loading={busy === "delete-" + document.id} onPress={() => remove(document)} /> : null}</View>)}
      {/* The callback invokes upload only on a user press; refs guard asynchronous work, never render. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {editable ? (Object.keys(INSTRUCTOR_DOCUMENT_LABELS) as InstructorDocumentKind[]).filter(kind => kind === "certificate" || !data.documents.some(document => document.kind === kind)).map(kind => <AppButton key={kind} title={kind === "selfie" ? "التقاط صورتي بالكاميرا" : "إرفاق " + INSTRUCTOR_DOCUMENT_LABELS[kind]} icon={kind === "selfie" ? "camera-outline" : "attach-outline"} variant="soft" disabled={dirty || Boolean(busy) || data.documents.length >= 12 || (["selfie", "passport", "identity_front", "identity_back"].includes(kind) && (!data.identityCollection.enabled || !consent))} loading={busy === kind} onPress={() => void upload(kind)} />) : null}
      {progress ? <><Text style={text}>{formatUploadProgress(progress)}</Text><AppButton title="إلغاء الرفع" variant="ghost" onPress={() => controller.current?.abort()} /></> : null}
      <AppButton title="فتح إعدادات أذونات الجهاز" variant="ghost" onPress={() => void Linking.openSettings().catch(() => setMessage("تعذر فتح إعدادات الجهاز."))} />
    </Card>
    {message ? <Text accessibilityLiveRegion="polite" style={{ ...text, color: colors.primary }}>{message}</Text> : null}
    {editable ? <Card style={{ gap: 12 }}><Text style={text}>احفظ الملف وأكمل المستندات المطلوبة ثم أرسله للإدارة. الأسعار وفترة التجربة تعتمد في العقد؛ اختيار نظام العمل لا ينشئ التزامًا ماليًا.</Text><AppButton title="تقديم طلب الانضمام" disabled={dirty || Boolean(busy) || !instructorReadyToSubmit(data)} loading={busy === "submit"} onPress={submit} /></Card> : null}
    <Card style={{ gap: 12 }}><SectionTitle title="الحساب البنكي" subtitle="يُستخدم لصرف المستحقات المعتمدة وفق عقدك" /><Field label="اسم صاحب الحساب" value={bank.accountHolder} onChangeText={accountHolder => setBank({ ...bank, accountHolder })} maxLength={160} editable={!busy && data.profile.status !== "suspended"} /><Field label="اسم البنك" value={bank.bankName} onChangeText={bankName => setBank({ ...bank, bankName })} maxLength={160} editable={!busy && data.profile.status !== "suspended"} /><Field label="IBAN" value={bank.iban} onChangeText={iban => setBank({ ...bank, iban: iban.replace(/\s/g, "").toUpperCase() })} inputDirection="ltr" autoCapitalize="characters" maxLength={34} editable={!busy && data.profile.status !== "suspended"} /><AppButton title="حفظ الحساب البنكي" disabled={dirty || Boolean(busy) || data.profile.status === "suspended" || bank.accountHolder.trim().length < 5 || bank.bankName.trim().length < 2 || bank.iban.length < 15} loading={busy === "bank"} onPress={() => void save("bank")} /></Card>
  </View>;
}
