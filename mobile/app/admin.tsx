import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { Redirect } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ScaledText } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppearanceSettings } from "@/src/components/AppearanceSettings";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, EmptyState, ErrorState, Field, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { absoluteUrl, api, ApiError, getApiToken, jsonBody } from "@/src/lib/api";
import { ADMIN_ACTION_ROUTE_OPTIONS } from "@/src/lib/admin-action-routes";
import { assetMimeType } from "@/src/lib/file-types";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Course, Institution } from "@/src/types";

type Colors = ReturnType<typeof useTheme>["colors"];
type AdminData = {
  metrics: { students: number; activeStudents: number; institutions: number; publishedCourses: number; orders: number; paidOrders: number; revenue: number; openRequests: number; openTickets: number; pendingReviews: number; };
  services: Record<string, boolean>;
  users: { id: number; fullName: string; email: string; phone: string | null; role: string; status: string; universitySlug: string | null; specialty: string | null; academicLevel: string | null; profileCompletedAt: string | null; }[];
  requests: { id: number; userId?: number | null; courseName: string; university: string; specialty: string; status: string; preparedCourseSlug?: string | null; attachmentsCount: number; createdAt: string; student?: { fullName: string; email: string; phone: string | null; universitySlug: string | null; specialty: string | null; academicLevel: string | null; status: string; } | null; files?: { id: number; originalName: string; contentType: string; sizeBytes: number; createdAt: string; }[]; }[];
  tickets: { id: number; ticketNumber: string; title: string; message: string; userEmail: string | null; contactChannel?: string; status: string; createdAt: string; student?: { fullName: string; email: string; phone: string | null; universitySlug: string | null; specialty: string | null; academicLevel: string | null; status: string; } | null; replies?: { id: number; body: string; authorRole?: string; internal?: boolean; createdAt: string; files?: { id: number; originalName: string; }[]; }[]; }[];
  institutions: (Institution & { status: string; })[];
  courses: (Course & { status: string; specialtySlug: string; coverTheme: string; })[];
  specialties: { slug: string; name: string; description: string; status: string; }[];
  specialtyLinks: { id: number; institutionSlug: string; specialtySlug: string; status: string; }[];
  orders: { id: number; orderNumber: string; customerEmail: string; courseSlug?: string | null; courseSlugs?: string[]; items?: (string | { courseSlug?: string | null; slug?: string | null; courseTitle?: string | null; title?: string | null; })[]; total: number; status: string; createdAt: string; }[];
  reviews: { id: number; userEmail: string; courseSlug: string; rating: number; body: string; status: string; }[];
  units: { id: number; courseSlug: string; title: string; description?: string; position: number; status: string; }[];
  lessons: { id: string; courseSlug: string; unitId: number; title: string; description?: string; position: number; durationSeconds: number; freePreview: boolean; status: string; videoAssetId: number | null; }[];
  videos: { id: number; courseSlug: string; lessonId: string; status: string; sizeBytes: number; createdAt: string; }[];
  notifications: { id: number; title: string; body: string; audience: string; userEmail: string | null; actionUrl?: string | null; actionLabel?: string | null; presentation?: string; pushEnabled?: boolean; startsAt?: string | null; expiresAt?: string | null; dismissible?: boolean; createdAt: string; }[];
  coupons: { id: number; code: string; type: string; value: number; courseSlug: string | null; usageLimit: number | null; usedCount: number; status: string; }[];
  supervisorAssignments: { id: number; supervisorId: number; institutionSlug: string | null; specialty: string | null; active: boolean; }[];
  settings: Record<string, string>;
};

type Tab = "overview" | "users" | "staff" | "requests" | "support" | "catalog" | "commerce" | "reviews" | "communication" | "appearance";
type Mutate = (payload: Record<string, unknown>, success?: string) => Promise<boolean>;
type DeleteEntity = (entityType: string, entityId: string | number, label: string, impact: string) => void;
const arabicMap: Record<string, string> = { ا: "a", أ: "a", إ: "i", آ: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y", ة: "h", ى: "a", ء: "a" };
function asciiSlug(value: string) { return [...value.toLowerCase()].map((char) => arabicMap[char] || char).join("").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "item"; }
function stableHash(value: string) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36).slice(0, 7); }
function makeInstitutionSlug(name: string) { return `${asciiSlug(name)}-${stableHash(name)}`.slice(0, 80); }
function makeCourseSlug(institutionSlug: string, specialtyName: string, courseName: string) { return `${institutionSlug}-${asciiSlug(specialtyName)}-${asciiSlug(courseName)}-${stableHash(`${institutionSlug}:${specialtyName}:${courseName}`)}`.slice(0, 80); }

const requestStatuses = ["new", "assigned", "reviewing", "planned", "producing", "available", "declined"];
const adminLabels: Record<string, string> = {
  student: "طالب", supervisor: "مشرف", admin: "مدير", user: "مستخدم", public: "عام", active: "نشط", suspended: "موقوف", disabled: "معطّل", enabled: "مفعّل",
  new: "جديد", assigned: "مسند", reviewing: "قيد المراجعة", planned: "مخطط له", producing: "قيد الإنتاج", available: "متاح", declined: "متعذر",
  open: "مفتوحة", waiting: "بانتظار الطالب", resolved: "محلولة", closed: "مغلقة",
  published: "منشور", hidden: "مخفي", draft: "مسودة", pending: "قيد المراجعة", rejected: "مرفوض", ready: "جاهز",
  creating: "جارٍ إنشاء الدفع", initiated: "تم البدء", uploading: "جارٍ الرفع", paid: "مدفوع", failed: "فشل", canceled: "ملغي", cancelled: "ملغي", voided: "مُبطل", refunded: "مسترد بالكامل", partially_refunded: "مسترد جزئيًا", reversed: "معكوس", chargeback: "اعتراض مالي", expired: "منتهي", processing: "قيد المعالجة",
  percent: "نسبة مئوية", fixed: "مبلغ ثابت", in_app: "داخل التطبيق", inbox: "صندوق الإشعارات", banner: "شريط علوي", modal: "نافذة منبثقة", all: "كل المواضع", email: "البريد الإلكتروني", whatsapp: "واتساب",
};
function adminLabel(value?: string | null) { return value ? adminLabels[value] || "غير محدد" : "غير محدد"; }
function orderStatusLabel(value?: string | null) {
  if (value === "pending") return "بانتظار إنشاء الدفع";
  return adminLabel(value);
}
function Text({ children, ...props }: React.ComponentProps<typeof ScaledText>) {
  return <ScaledText {...props}>{React.Children.map(children, (child) => typeof child === "string" && adminLabels[child] ? adminLabels[child] : child)}</ScaledText>;
}
const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; }[] = [
  { key: "overview", label: "الرئيسية", icon: "grid-outline" },
  { key: "users", label: "الحسابات", icon: "people-outline" },
  { key: "staff", label: "الموظفون", icon: "person-add-outline" },
  { key: "requests", label: "الطلبات", icon: "cloud-upload-outline" },
  { key: "support", label: "الدعم", icon: "headset-outline" },
  { key: "catalog", label: "الكتالوج", icon: "library-outline" },
  { key: "commerce", label: "المبيعات", icon: "card-outline" },
  { key: "reviews", label: "التقييمات", icon: "star-outline" },
  { key: "communication", label: "التواصل", icon: "megaphone-outline" },
  { key: "appearance", label: "مظهر الجهاز", icon: "color-palette-outline" },
];

export default function Admin() {
  const { user, loading: authLoading, offline, token, authError, refresh: refreshAuth } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["admin-console", user?.id], queryFn: () => api<AdminData>("/api/admin/console"), enabled: !authLoading && user?.role === "admin" });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ["admin-console"] }); };
  const mutate: Mutate = async (payload, success = "تم حفظ التغيير") => {
    setMessage("");
    try { await api("/api/admin/console", { method: "POST", body: jsonBody(payload) }); setMessage(success); await refresh(); if (payload.action === "saveSettings") await client.invalidateQueries({ queryKey: ["settings"] }); return true; }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر تنفيذ الإجراء"); return false; }
  };
  const deleteEntity: DeleteEntity = (entityType, entityId, label, impact) => Alert.alert("تأكيد الحذف النهائي", `سيُحذف «${label}» نهائيًا.\n\n${impact}\n\nلن تُحذف الطلبات أو الفواتير أو أحداث الدفع، وتبقى سجلات التدقيق محفوظة.`, [{ text: "إلغاء", style: "cancel" }, { text: "حذف نهائي", style: "destructive", onPress: () => void mutate({ action: "deleteEntity", entityType, entityId: String(entityId), confirmation: "حذف" }, "تم الحذف النهائي وتحديث البيانات") }]);

  if (authLoading) return <Screen><LoadingState label="جارٍ التحقق من صلاحية الإدارة..." /></Screen>;
  if (!user && offline && token) return <Screen><AppHeader title="لوحة الإدارة" back /><ErrorState title="تعذر استعادة الجلسة" text={authError || "تحقق من اتصالك ثم أعد المحاولة."} onRetry={() => void refreshAuth()} /></Screen>;
  if (!user) return <Redirect href="/(auth)/login?return_to=%2Fadmin" />;
  if (user.role !== "admin") return <Screen><AppHeader title="لوحة الإدارة" back /><EmptyState icon="lock-closed-outline" title="غير مصرح" text="هذه الصفحة متاحة للحسابات الإدارية فقط، ولا توجد حسابات تجريبية عامة." /></Screen>;
  if (query.isLoading) return <Screen><LoadingState label="جارٍ تحميل مركز التحكم..." /></Screen>;
  if (!query.data) return <Screen><AppHeader title="لوحة الإدارة" back /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل البيانات" text="تحقق من الاتصال ثم أعد المحاولة." action={<AppButton title="إعادة المحاولة" onPress={() => query.refetch()} />} /></Screen>;
  const data = query.data;

  return <Screen keyboard>
    <AppHeader title="لوحة الإدارة" subtitle="تحكم مباشر وآمن في منصة مراس" back />
    <SearchPicker label="قسم لوحة الإدارة" value={tab} placeholder="اختر القسم الذي تريد إدارته" items={tabs.map((item) => ({ key: item.key, label: item.label, detail: item.key === "overview" ? "ملخص المنصة وطابور العمل" : "إدارة وتحديث مباشر" }))} onSelect={(item) => setTab(item.key as Tab)} />
    {message ? <Text style={[styles.message, { color: message.startsWith("تم") ? colors.success : colors.danger }]}>{message}</Text> : null}
    {tab === "overview" && <Overview data={data} colors={colors} />}
    {tab === "users" && <Users data={data} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "staff" && <StaffAdmin data={data} colors={colors} refresh={refresh} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "requests" && <Requests rows={data.requests} courses={data.courses} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "support" && <Support rows={data.tickets} colors={colors} mutate={mutate} refresh={refresh} onDelete={deleteEntity} />}
    {tab === "catalog" && <CatalogAdmin data={data} colors={colors} mutate={mutate} refresh={refresh} onDelete={deleteEntity} />}
    {tab === "commerce" && <Commerce data={data} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "reviews" && <Reviews data={data} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "communication" && <Communication data={data} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "appearance" && <AppearanceSettings />}
  </Screen>;
}

function Overview({ data, colors }: { data: AdminData; colors: Colors; }) {
  const metrics = [
    { icon: "cash-outline" as const, label: "الإيراد المؤكد", value: `${data.metrics.revenue.toLocaleString("ar-SA")} ر.س` },
    { icon: "people-outline" as const, label: "الطلاب النشطون", value: String(data.metrics.activeStudents) },
    { icon: "school-outline" as const, label: "الجهات", value: String(data.metrics.institutions) },
    { icon: "library-outline" as const, label: "المواد المنشورة", value: String(data.metrics.publishedCourses) },
  ];
  return <>
    <View style={styles.metricGrid}>{metrics.map((item) => <Card key={item.label} style={styles.metric}><Ionicons name={item.icon} size={24} color={colors.primary} /><Text style={[styles.metricValue, { color: colors.text }]}>{item.value}</Text><Text style={[styles.metricLabel, { color: colors.textSoft }]}>{item.label}</Text></Card>)}</View>
    <SectionTitle title="طابور العمل" />
    <Card><Queue label="طلبات مواد مفتوحة" value={data.metrics.openRequests} colors={colors} /><Queue label="تذاكر دعم مفتوحة" value={data.metrics.openTickets} colors={colors} /><Queue label="تقييمات تنتظر المراجعة" value={data.metrics.pendingReviews} colors={colors} /></Card>
    <SectionTitle title="جاهزية الخدمات" />
    <Card>{Object.entries(data.services).map(([key, ready]) => <View key={key} style={styles.service}><Ionicons name={ready ? "checkmark-circle" : "alert-circle"} size={21} color={ready ? colors.success : colors.warning} /><Text style={[styles.serviceText, { color: colors.text }]}>{({ assistant: "المساعد الذكي", payments: "بوابة Tap للدفع", email: "استعادة الحساب", videoSigning: "الفيديو الخاص" } as Record<string, string>)[key] || "خدمة غير معروفة"}</Text><Text style={{ color: ready ? colors.success : colors.warning, fontSize: 9, fontWeight: "900" }}>{ready ? "جاهز" : "يحتاج إعداد"}</Text></View>)}</Card>
  </>;
}

function Queue({ label, value, colors }: { label: string; value: number; colors: Colors; }) {
  return <View style={[styles.queue, { borderBottomColor: colors.border }]}><Text style={[styles.queueValue, { color: colors.primary }]}>{value}</Text><Text style={[styles.queueLabel, { color: colors.text }]}>{label}</Text></View>;
}

function StaffAdmin({ data, colors, mutate, refresh, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; refresh: () => Promise<void>; onDelete: DeleteEntity; }) {
  const emptyForm = { email: "", fullName: "", phone: "", password: "", role: "supervisor", universitySlug: "", specialty: "" };
  const [form, setForm] = useState(emptyForm);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const staff = data.users.filter((row) => row.role !== "student");
  const institutions = data.institutions.filter((row) => row.status === "published");
  const linkedSpecialtySlugs = new Set(data.specialtyLinks.filter((row) => row.institutionSlug === form.universitySlug && row.status === "published").map((row) => row.specialtySlug));
  const specialties = data.specialties.filter((row) => row.status === "published" && linkedSpecialtySlugs.has(row.slug));

  const submit = async (allowExisting = false) => {
    if (busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await api<{ user?: { updated?: boolean; }; }>("/api/admin/staff", {
        method: "POST",
        body: jsonBody({ ...form, allowExisting, confirmation: allowExisting ? "تحديث حساب موظف" : undefined }),
      });
      setForm(emptyForm);
      setFeedback(response.user?.updated ? "تم تحديث حساب الموظف بعد التأكيد" : "تم إنشاء حساب الموظف وربطه بالبيانات");
      await refresh();
    } catch (reason) {
      if (!allowExisting && reason instanceof ApiError && reason.code === "STAFF_ACCOUNT_EXISTS") {
        Alert.alert(
          "الحساب موجود بالفعل",
          `يوجد حساب مرتبط بـ ${form.email.trim() || form.phone.trim()}. المتابعة ستغيّر بياناته ودوره وكلمة مروره. لا تستخدم هذا الإجراء إلا إذا كنت تقصد تحديث الحساب نفسه.`,
          [
            { text: "إلغاء", style: "cancel" },
            { text: "تحديث الحساب الموجود", style: "destructive", onPress: () => void submit(true) },
          ],
        );
      } else setFeedback(reason instanceof ApiError ? reason.message : "تعذر حفظ حساب الموظف");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <SectionTitle title="إنشاء موظف وصلاحياته" subtitle="لن يُعدّل أي حساب قائم دون تحذير وتأكيد صريح" />
    <Card>
      <Field label="البريد الإلكتروني" value={form.email} onChangeText={(value) => setForm({ ...form, email: value })} keyboardType="email-address" autoCapitalize="none" />
      <Field label="الاسم الكامل" value={form.fullName} onChangeText={(value) => setForm({ ...form, fullName: value })} />
      <Field label="الجوال السعودي" value={form.phone} onChangeText={(value) => setForm({ ...form, phone: value })} keyboardType="phone-pad" />
      <Field label="كلمة المرور المؤقتة" value={form.password} onChangeText={(value) => setForm({ ...form, password: value })} secureTextEntry autoCapitalize="none" />
      <ChoiceRow values={["supervisor", "admin"]} selected={form.role} onSelect={(value) => setForm({ ...form, role: value })} colors={colors} />
      <SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر جهة منشورة" items={institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key, specialty: "" })} />
      <SearchPicker label="التخصص" value={form.specialty} placeholder={form.universitySlug ? "اختر تخصصًا مرتبطًا بالجهة" : "اختر الجهة أولًا"} disabled={!form.universitySlug} items={specialties.map((row) => ({ key: row.name, label: row.name }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />
      {feedback ? <Text style={[styles.message, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text> : null}
      <AppButton title="إنشاء موظف جديد" icon="person-add-outline" loading={busy} disabled={busy || form.email.trim().length < 5 || form.fullName.trim().length < 5 || form.phone.trim().length < 8 || form.password.length < 10 || !form.universitySlug || !form.specialty} onPress={() => void submit()} />
    </Card>
    <SectionTitle title="الموظفون الحاليون" subtitle={`${staff.length} حساب إداري أو إشرافي`} />
    {staff.length ? staff.map((row) => <Card key={row.id} style={styles.dataCard}>
      <View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{adminLabel(row.role)}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.fullName}</Text></View>
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.email} · {adminLabel(row.status)}</Text>
      <View style={styles.actionRow}>
        <AppButton full={false} title={row.status === "active" ? "تعليق" : "تنشيط"} variant={row.status === "active" ? "danger" : "soft"} disabled={row.status === "deleted"} onPress={() => void mutate({ action: "updateUser", id: row.id, role: row.role, status: row.status === "active" ? "suspended" : "active" })} />
        <AppButton full={false} title={row.role === "admin" ? "تحويل لمشرف" : "ترقية لمدير"} variant="ghost" disabled={row.status === "deleted"} onPress={() => void mutate({ action: "updateUser", id: row.id, role: row.role === "admin" ? "supervisor" : "admin", status: row.status })} />
        <AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => onDelete("user", row.id, row.fullName, "سيُحذف حساب الموظف وتوابعه غير المالية، ولن يُحذف الحساب الحالي أو آخر مدير أو أي حساب له تاريخ مالي.")} />
      </View>
    </Card>) : <EmptyState title="لا يوجد موظفون" text="أنشئ أول مشرف أو مدير من النموذج أعلاه." />}
  </>;
}

function Users({ data, colors, mutate, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; onDelete: DeleteEntity; }) {
  const supervisors = data.users.filter((row) => row.role === "supervisor" && row.status === "active");
  const [supervisorId, setSupervisorId] = useState("");
  const [institutionSlug, setInstitutionSlug] = useState("");
  const [specialty, setSpecialty] = useState("");
  const programs = useQuery({ queryKey: ["admin-programs", institutionSlug], queryFn: () => api<{ programs: { name: string; degree: string; area: string; }[]; }>(`/api/catalog/programs?institution=${encodeURIComponent(institutionSlug)}`), enabled: Boolean(institutionSlug) });
  return <>
    <SectionTitle title="الحسابات والصلاحيات" subtitle={`${data.users.length} حسابًا في أحدث النتائج`} />
    {data.users.map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{adminLabel(row.role)}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.fullName}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.email} · {row.phone || "بدون جوال"}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.specialty || "بدون تخصص"} · {row.academicLevel || "المستوى غير محدد"} · {row.profileCompletedAt && row.academicLevel ? "ملف مكتمل" : "ملف ناقص"} · {adminLabel(row.status)}</Text><View style={styles.actionRow}><AppButton full={false} title={row.status === "active" ? "تعليق" : "تنشيط"} variant={row.status === "active" ? "danger" : "soft"} disabled={row.status === "deleted"} onPress={() => mutate({ action: "updateUser", id: row.id, role: row.role, status: row.status === "active" ? "suspended" : "active" })} /><AppButton full={false} title={row.role === "student" ? "ترقية لمشرف" : "إعادة لطالب"} variant="soft" disabled={row.status === "deleted"} onPress={() => mutate({ action: "updateUser", id: row.id, status: row.status, role: row.role === "student" ? "supervisor" : "student" })} /><AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => onDelete("user", row.id, row.fullName, "سيُحذف الحساب وبياناته غير المالية وملفات الدعم، ويُمنع إذا وُجد طلب أو فاتورة أو حدث دفع.")} /></View></Card>)}
    <SectionTitle title="نطاقات المشرفين" subtitle="يربط المشرف بطلبات ومحتوى الجامعة والتخصص المحددين" />
    <Card>
      <SearchPicker label="المشرف" value={supervisorId} placeholder="اختر حساب مشرف" items={supervisors.map((row) => ({ key: String(row.id), label: row.fullName, detail: row.email }))} onSelect={(item) => setSupervisorId(item.key)} />
      <SearchPicker label="الجامعة أو الكلية" value={institutionSlug} placeholder="اختر الجهة" items={data.institutions.filter((row) => row.status === "published").map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => { setInstitutionSlug(item.key); setSpecialty(""); }} />
      <SearchPicker label="التخصص" value={specialty} placeholder={programs.isFetching ? "جارٍ تحميل التخصصات..." : "اختر تخصص الجهة"} disabled={!institutionSlug || programs.isFetching} items={(programs.data?.programs || []).map((row) => ({ key: row.name, label: row.name, detail: `${row.degree} · ${row.area}` }))} onSelect={(item) => setSpecialty(item.key)} />
      <AppButton title="حفظ نطاق الإشراف" icon="git-network-outline" disabled={!supervisorId || !institutionSlug || !specialty} onPress={() => mutate({ action: "saveSupervisorAssignment", supervisorId: Number(supervisorId), institutionSlug, specialty, active: true }, "تم ربط المشرف بالنطاق")} />
    </Card>
    {data.supervisorAssignments.map((assignment) => { const supervisor = data.users.find((row) => row.id === assignment.supervisorId); const institution = data.institutions.find((row) => row.slug === assignment.institutionSlug); return <Card key={assignment.id} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{supervisor?.fullName || `مشرف #${assignment.supervisorId}`}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{institution?.name || assignment.institutionSlug} · {assignment.specialty}</Text><View style={styles.actionRow}><AppButton full={false} title={assignment.active ? "تعطيل النطاق" : "تفعيل النطاق"} variant={assignment.active ? "danger" : "soft"} onPress={() => mutate({ action: "saveSupervisorAssignment", ...assignment, active: !assignment.active })} /><AppButton full={false} title="حذف التكليف" variant="danger" onPress={() => onDelete("supervisor_assignment", assignment.id, "تكليف المشرف", "سيُحذف نطاق التكليف فقط، ولن يُحذف حساب المشرف.")} /></View></Card>; })}
  </>;
}

function AdminRequestStatus({ status, colors }: { status: string; colors: Colors; }) { return <Text style={{ color: status === "available" ? colors.success : colors.primary, fontSize: 9, fontWeight: "900" }}>{adminLabel(status)}</Text>; }

function Requests({ rows, courses, colors, mutate, onDelete }: { rows: AdminData["requests"]; courses: AdminData["courses"]; colors: Colors; mutate: Mutate; onDelete: DeleteEntity; }) {
  const [selectedCourses, setSelectedCourses] = useState<Record<number, string>>({});
  const openFile = async (file: { id: number; originalName: string; }) => { try { const safeName = encodeURIComponent(file.originalName).replace(/%/g, "_"); const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ""}maras-request-${file.id}-${safeName}`; const result = await FileSystem.downloadAsync(absoluteUrl(`/api/supervisor/request-files/${file.id}`), uri, { headers: { authorization: `Bearer ${getApiToken()}` } }); await Linking.openURL(result.uri); } catch { /* The protected download remains available from the web admin. */ } };
  return <><SectionTitle title="طلبات المواد" subtitle="غيّر الحالة أو اختر المادة الجاهزة لإرسال رابط مباشر للطالب" />{rows.map((row) => { const selected = selectedCourses[row.id] || row.preparedCourseSlug || ""; const options = courses.filter((course) => course.status === "published" && course.university === row.university && course.specialty === row.specialty); return <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.courseName}</Text><AdminRequestStatus status={row.status} colors={colors} /></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.student?.fullName || (row.userId ? `طالب #${row.userId}` : "طالب غير مرتبط")} · {row.student?.email || "—"}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.student?.phone || "بدون جوال"} · {row.university} · {row.specialty} · {row.student?.academicLevel || "المستوى غير محدد"}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.attachmentsCount} مرفقات</Text>{row.files?.length ? <View style={styles.requestFiles}>{row.files.map((file) => <Pressable key={file.id} onPress={() => void openFile(file)} style={styles.requestFile}><Ionicons name="download-outline" size={15} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.primary, fontSize: 9, flex: 1 }}>{file.originalName} · {(file.sizeBytes / 1024 / 1024).toFixed(1)}MB</Text></Pressable>)}</View> : null}<SearchPicker label="المادة بعد التجهيز" value={selected} placeholder="اختر مادة منشورة مطابقة" items={options.map((course) => ({ key: course.slug, label: course.title, detail: course.specialty }))} onSelect={(item) => setSelectedCourses((current) => ({ ...current, [row.id]: item.key }))} /><AppButton title="تم تجهيز الطلب وإشعار الطالب" icon="checkmark-done-outline" disabled={!selected} onPress={() => void mutate({ action: "prepareRequest", id: row.id, courseSlug: selected }, "تم تجهيز الطلب وإرسال الإشعار")} /><AppButton title="حذف الطلب وملفاته" icon="trash-outline" variant="danger" onPress={() => onDelete("course_request", row.id, row.courseName, "سيُحذف الطلب وجميع ملفاته من التخزين نهائيًا.")} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statuses}>{requestStatuses.map((status) => <Pressable key={status} disabled={status === "available" && !selected} onPress={() => mutate({ action: "updateRequest", id: row.id, status, courseSlug: status === "available" ? selected : undefined })} style={[styles.status, { backgroundColor: row.status === status ? colors.primary : colors.surfaceAlt, opacity: status === "available" && !selected ? .45 : 1 }]}><Text style={{ color: row.status === status ? "#FFF" : colors.textSoft, fontSize: 8 }}>{adminLabel(status)}</Text></Pressable>)}</ScrollView></Card>; })}</>;
}

function Support({ rows, colors, mutate, refresh, onDelete }: { rows: AdminData["tickets"]; colors: Colors; mutate: Mutate; refresh: () => Promise<void>; onDelete: DeleteEntity; }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [files, setFiles] = useState<Record<number, DocumentPicker.DocumentPickerAsset | null>>({});
  const [feedback, setFeedback] = useState("");
  const selected = rows.find((row) => row.id === selectedId) || null;
  const send = async (row: AdminData["tickets"][number]) => {
    const file = files[row.id]; const text = replies[row.id] || "";
    try {
      if (file) { const form = new FormData(); form.append("ticketId", String(row.id)); form.append("message", text); form.append("files", { uri: file.uri, name: file.name, type: assetMimeType(file, "application/octet-stream") } as unknown as Blob); await api("/api/support", { method: "POST", body: form, timeoutMs: 180_000 }); setFiles({ ...files, [row.id]: null }); }
      else await mutate({ action: "updateTicket", id: row.id, status: row.status, reply: text, internal: false }, "تم إرسال الرد");
      setReplies({ ...replies, [row.id]: "" }); setFeedback("تم إرسال الرسالة إلى الطالب"); if (file) await refresh();
    } catch (reason) { setFeedback(reason instanceof ApiError ? reason.message : "تعذر إرسال الرسالة أو المرفق"); }
  };
  const pick = async (id: number) => { const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: ["image/*", "application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] }); if (!result.canceled) setFiles({ ...files, [id]: result.assets[0] || null }); };
  const openFile = async (file: { id: number; originalName: string; }) => { try { const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ""}maras-admin-support-${file.id}-${encodeURIComponent(file.originalName).replace(/%/g, "_")}`; const result = await FileSystem.downloadAsync(absoluteUrl(`/api/support/files/${file.id}`), uri, { headers: { authorization: `Bearer ${getApiToken()}` } }); await Linking.openURL(result.uri); } catch { setFeedback("تعذر فتح المرفق من الخادم"); } };
  const removeTicket = (row: AdminData["tickets"][number]) => onDelete("support_ticket", row.id, row.title, "سيُحذف عنوان التذكرة والمحادثة وجميع المرفقات من قاعدة البيانات والتخزين نهائيًا.");
  return <><SectionTitle title="محادثات الدعم" subtitle="اختر بطاقة لفتح الشات، أرسل ملفات، وأدر حالة التذكرة من نفس المكان" />{!selected ? <View>{rows.map((row) => <Pressable key={row.id} onPress={() => { setFeedback(""); setSelectedId(row.id); }}><Card style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{adminLabel(row.status)}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.title}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.ticketNumber} · {row.userEmail || "—"} · قناة {adminLabel(row.contactChannel || "in_app")}</Text>{row.student ? <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.student.fullName} · {row.student.phone || "بدون جوال"} · {row.student.universitySlug || "بدون جامعة"} · {row.student.specialty || "بدون تخصص"} · {row.student.academicLevel || "المستوى غير محدد"}</Text> : null}<Text style={[styles.dataMeta, { color: colors.primary }]}>{row.replies?.length || 0} ردود · اضغط لفتح المحادثة</Text></Card></Pressable>)}</View> : <><AppButton full={false} title="كل التذاكر" variant="ghost" icon="arrow-back-outline" onPress={() => setSelectedId(null)} /><Card style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{adminLabel(selected.status)}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{selected.title}</Text><AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => removeTicket(selected)} /></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{selected.ticketNumber} · {selected.userEmail || "—"} · قناة {adminLabel(selected.contactChannel || "in_app")}</Text>{selected.student ? <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{selected.student.fullName} · {selected.student.phone || "بدون جوال"} · {selected.student.universitySlug || "بدون جامعة"} · {selected.student.specialty || "بدون تخصص"} · {selected.student.academicLevel || "المستوى غير محدد"}</Text> : null}<View style={[styles.adminThread, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.adminBubble, { backgroundColor: colors.primary }]}><Text style={styles.adminBubbleLabel}>الطالب</Text><Text style={styles.adminBubbleText}>{selected.message}</Text></View>{selected.replies?.filter((reply) => !reply.internal && (reply.body || reply.files?.length)).map((reply) => <View key={reply.id} style={[styles.adminBubble, { backgroundColor: reply.authorRole === "student" ? colors.primary : colors.surface }]}><Text style={[styles.adminBubbleLabel, { color: reply.authorRole === "student" ? "#FFF" : colors.primary }]}>{reply.authorRole === "student" ? "الطالب" : "فريق مراس"}</Text>{reply.body ? <Text style={[styles.adminBubbleText, { color: reply.authorRole === "student" ? "#FFF" : colors.text }]}>{reply.body}</Text> : null}{reply.files?.map((file) => <Pressable key={file.id} onPress={() => void openFile(file)} style={styles.adminAttachment}><Ionicons name="document-attach-outline" size={13} color={reply.authorRole === "student" ? "#FFF" : colors.primary} /><Text style={{ color: reply.authorRole === "student" ? "#FFF" : colors.primary, fontSize: 9, flex: 1 }} numberOfLines={1}>{file.originalName}</Text></Pressable>)}</View>)}</View><TextInput value={replies[selected.id] || ""} onChangeText={(value) => setReplies({ ...replies, [selected.id]: value })} placeholder="اكتب ردك للطالب..." placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} textAlign="right" multiline /><View style={styles.actionRow}><AppButton full={false} title={files[selected.id] ? `ملف: ${files[selected.id]?.name}` : "إرفاق ملف"} variant="ghost" onPress={() => void pick(selected.id)} /><AppButton full={false} title="إرسال الرد" variant="soft" disabled={!replies[selected.id]?.trim() && !files[selected.id]} onPress={() => void send(selected)} /></View><View style={styles.actionRow}><ChoiceRow values={["open", "waiting", "resolved", "closed"]} selected={selected.status} onSelect={(status) => void mutate({ action: "updateTicket", id: selected.id, status, reply: "" }, "تم تحديث حالة المحادثة")} colors={colors} /></View>{feedback ? <Text style={[styles.message, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text> : null}</Card></>}</>;
}

function CatalogAdmin({ data, colors, mutate, refresh, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; refresh: () => Promise<void>; onDelete: DeleteEntity; }) {
  const [institution, setInstitution] = useState({ slug: "", name: "", nameEn: "", region: "", type: "حكومية", domain: "", logoUrl: "" });
  const [logo, setLogo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [specialty, setSpecialty] = useState({ slug: "", name: "", description: "", institutionSlug: "" });
  const [cover, setCover] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [course, setCourse] = useState({ slug: "", institutionSlug: "", specialtySlug: "", title: "", titleEn: "", code: "", description: "", coverImageUrl: "", price: "", oldPrice: "", accessLabel: "90 يومًا" });
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<"institution" | "course" | null>(null);
  const linkedSpecialtySlugs = new Set(data.specialtyLinks.filter((row) => row.institutionSlug === course.institutionSlug && row.status === "published").map((row) => row.specialtySlug));
  const courseSpecialties = data.specialties.filter((row) => row.status === "published" && linkedSpecialtySlugs.has(row.slug));

  const saveInstitution = async () => {
    if (busy) return;
    const institutionKey = institution.slug || makeInstitutionSlug(institution.name);
    let recordSaved = false;
    setBusy("institution");
    setFeedback("");
    try {
      await api("/api/admin/console", { method: "POST", body: jsonBody({ action: "saveInstitution", ...institution, slug: institutionKey, status: "published", featured: false }) });
      recordSaved = true;
      if (logo) {
        const form = new FormData();
        form.append("slug", institutionKey);
        form.append("file", { uri: logo.uri, name: logo.name, type: assetMimeType(logo, "image/png") } as unknown as Blob);
        await api("/api/admin/logos", { method: "POST", body: form, timeoutMs: 120_000 });
      }
      await refresh();
      setLogo(null);
      setInstitution({ slug: "", name: "", nameEn: "", region: "", type: "حكومية", domain: "", logoUrl: "" });
      setFeedback(logo ? "تم حفظ الجهة ورفع الشعار بنجاح" : "تم حفظ الجهة التعليمية");
    } catch (reason) {
      if (recordSaved) await refresh();
      const detail = reason instanceof ApiError ? reason.message : "تعذر تنفيذ العملية";
      setFeedback(recordSaved ? `حُفظت الجهة، لكن تعذر رفع الشعار: ${detail}` : detail);
    } finally { setBusy(null); }
  };
  const pickLogo = async () => { const result = await DocumentPicker.getDocumentAsync({ type: ["image/png", "image/jpeg", "image/webp"], multiple: false, copyToCacheDirectory: true }); if (!result.canceled) setLogo(result.assets[0] || null); };
  const pickCover = async () => { const result = await DocumentPicker.getDocumentAsync({ type: ["image/png", "image/jpeg", "image/webp"], multiple: false, copyToCacheDirectory: true }); if (!result.canceled) setCover(result.assets[0] || null); };
  const saveCourse = async () => {
    if (busy) return;
    const specialtyName = data.specialties.find((row) => row.slug === course.specialtySlug)?.name || course.specialtySlug;
    const courseKey = course.slug || makeCourseSlug(course.institutionSlug, specialtyName, course.title);
    let recordSaved = false;
    setBusy("course");
    setFeedback("");
    try {
      await api("/api/admin/console", { method: "POST", body: jsonBody({ action: "saveCourse", ...course, slug: courseKey, price: Number(course.price), oldPrice: Number(course.oldPrice), status: "draft", featured: false, coverTheme: "blue-violet" }) });
      recordSaved = true;
      if (cover) {
        const form = new FormData();
        form.append("courseSlug", courseKey);
        form.append("file", { uri: cover.uri, name: cover.name, type: assetMimeType(cover, "image/jpeg") } as unknown as Blob);
        await api("/api/admin/covers", { method: "POST", body: form, timeoutMs: 120_000 });
      }
      await refresh();
      setCover(null);
      setCourse({ slug: "", institutionSlug: "", specialtySlug: "", title: "", titleEn: "", code: "", description: "", coverImageUrl: "", price: "", oldPrice: "", accessLabel: "90 يومًا" });
      setFeedback(cover ? "تم حفظ المادة ورفع الغلاف بنجاح" : "تم حفظ المادة كمسودة");
    } catch (reason) {
      if (recordSaved) await refresh();
      const detail = reason instanceof ApiError ? reason.message : "تعذر تنفيذ العملية";
      setFeedback(recordSaved ? `حُفظت المادة، لكن تعذر رفع الغلاف: ${detail}` : detail);
    } finally { setBusy(null); }
  };
  const syncCatalog = async () => { const ok = await mutate({ action: "syncCatalogTemplates", templatePrice: 49 }, "تم تجهيز الجامعات والتخصصات والمواد والوحدات"); if (ok) await refresh(); };
  return <>
    <SectionTitle title="تجهيز الكتالوج الكامل" subtitle="ينشئ السجلات الإدارية والوحدات والدروس التجريبية تلقائيًا دون استبدال ما عدّلته يدويًا" />
    <Card><Text style={[styles.dataMeta, { color: colors.textSoft }]}>ستظهر المواد قابلة للاشتراك بسعر قالب 49 ر.س، ويمكنك تعديل السعر والمادة من الإدارة ورفع الفيديوهات لاحقًا لكل درس.</Text><AppButton title="تجهيز كل الجامعات والتخصصات والمواد" icon="sparkles-outline" onPress={() => void syncCatalog()} /></Card>
    {feedback ? <Text style={[styles.message, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text> : null}
    <SectionTitle title="إضافة جامعة أو كلية" subtitle="ارفع PNG أو JPEG أو WebP عالي الدقة، أو استخدم رابط HTTPS رسميًا" />
    <Card><Field label="المعرّف (اختياري — يُنشأ تلقائيًا)" value={institution.slug} onChangeText={(value) => setInstitution({ ...institution, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="university-slug" autoCapitalize="none" /><Field label="الاسم العربي" value={institution.name} onChangeText={(value) => setInstitution({ ...institution, name: value })} /><Field label="الاسم الإنجليزي" value={institution.nameEn} onChangeText={(value) => setInstitution({ ...institution, nameEn: value })} /><Field label="المنطقة" value={institution.region} onChangeText={(value) => setInstitution({ ...institution, region: value })} /><ChoiceRow values={["حكومية", "أهلية", "كلية", "تقنية"]} selected={institution.type} onSelect={(value) => setInstitution({ ...institution, type: value })} colors={colors} /><Field label="النطاق الرسمي" value={institution.domain} onChangeText={(value) => setInstitution({ ...institution, domain: value })} placeholder="university.edu.sa" autoCapitalize="none" /><Field label="رابط الشعار الرسمي — اختياري" value={institution.logoUrl} onChangeText={(value) => setInstitution({ ...institution, logoUrl: value })} placeholder="https://.../logo.svg" autoCapitalize="none" /><AppButton title={logo ? `الشعار: ${logo.name}` : "اختيار شعار PNG أو JPEG أو WebP"} variant="soft" icon="image-outline" disabled={Boolean(busy)} onPress={pickLogo} /><View style={styles.spacer} /><AppButton title="حفظ الجهة ورفع الشعار" icon="save-outline" loading={busy === "institution"} disabled={Boolean(busy) || institution.name.length < 3 || !institution.region} onPress={() => void saveInstitution()} /></Card>
    <SectionTitle title="إضافة تخصص وربطه" />
    <Card><Field label="المعرّف (اختياري — يُنشأ تلقائيًا)" value={specialty.slug} onChangeText={(value) => setSpecialty({ ...specialty, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="computer-science" /><Field label="اسم التخصص" value={specialty.name} onChangeText={(value) => setSpecialty({ ...specialty, name: value })} /><Field label="وصف مختصر" value={specialty.description} onChangeText={(value) => setSpecialty({ ...specialty, description: value })} /><SearchPicker label="ربطه بجهة" value={specialty.institutionSlug} placeholder="اختر الجامعة أو الكلية" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => setSpecialty({ ...specialty, institutionSlug: item.key })} /><AppButton title="حفظ التخصص" disabled={specialty.name.length < 2 || !specialty.institutionSlug} onPress={() => mutate({ action: "saveSpecialty", ...specialty, status: "published" }, "تم حفظ التخصص وربطه")} /></Card>
    <SectionTitle title="إضافة مادة" subtitle="ترتبط بجهة وتخصص إداري فعليين" />
    <Card><Field label="المعرّف (اختياري — يُنشأ تلقائيًا)" value={course.slug} onChangeText={(value) => setCourse({ ...course, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="course-slug" /><Field label="اسم المادة" value={course.title} onChangeText={(value) => setCourse({ ...course, title: value })} /><Field label="الاسم الإنجليزي" value={course.titleEn} onChangeText={(value) => setCourse({ ...course, titleEn: value })} /><Field label="رمز المادة" value={course.code} onChangeText={(value) => setCourse({ ...course, code: value })} /><SearchPicker label="الجهة" value={course.institutionSlug} placeholder="اختر الجهة" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: `${row.region} · ${adminLabel(row.status)}` }))} onSelect={(item) => setCourse({ ...course, institutionSlug: item.key, specialtySlug: "" })} /><SearchPicker label="التخصص" value={course.specialtySlug} placeholder={course.institutionSlug ? "اختر تخصصًا منشورًا مرتبطًا بالجهة" : "اختر الجهة أولًا"} disabled={!course.institutionSlug} items={courseSpecialties.map((row) => ({ key: row.slug, label: row.name }))} onSelect={(item) => setCourse({ ...course, specialtySlug: item.key })} /><TextInput value={course.description} onChangeText={(value) => setCourse({ ...course, description: value })} placeholder="وصف المادة" placeholderTextColor={colors.textSoft} multiline textAlign="right" style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /><Field label="رابط صورة الغلاف HTTPS — اختياري" value={course.coverImageUrl} onChangeText={(value) => setCourse({ ...course, coverImageUrl: value })} placeholder="https://..." autoCapitalize="none" /><AppButton title={cover ? `الغلاف: ${cover.name}` : "اختيار غلاف PNG أو JPEG أو WebP"} variant="soft" icon="image-outline" disabled={Boolean(busy)} onPress={pickCover} />{cover || course.coverImageUrl ? <Image source={{ uri: cover?.uri || absoluteUrl(course.coverImageUrl) }} style={styles.coverPreview} resizeMode="cover" /> : null}<Field label="السعر" value={course.price} onChangeText={(value) => setCourse({ ...course, price: value })} keyboardType="decimal-pad" /><Field label="السعر السابق — اختياري" value={course.oldPrice} onChangeText={(value) => setCourse({ ...course, oldPrice: value })} keyboardType="decimal-pad" /><Field label="مدة الوصول" value={course.accessLabel} onChangeText={(value) => setCourse({ ...course, accessLabel: value })} /><AppButton title="حفظ المادة ورفع الغلاف" loading={busy === "course"} disabled={Boolean(busy) || course.title.length < 3 || !course.institutionSlug || !course.specialtySlug || !course.price} onPress={() => void saveCourse()} /></Card>
    <ContentEditor data={data} colors={colors} mutate={mutate} />
    <SectionTitle title="الجهات الحالية" subtitle="نشر وإخفاء وتمييز الصفحات" />
    {data.institutions.slice(0, 25).map((row) => <Card key={row.slug} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.name}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.region} · {row.type} · {adminLabel(row.status)}</Text><View style={styles.actionRow}><AppButton full={false} title={row.featured ? "إلغاء التمييز" : "تمييز"} variant="soft" onPress={() => mutate(institutionPayload(row, row.status, !row.featured))} /><AppButton full={false} title={row.status === "published" ? "إخفاء" : "نشر"} variant="ghost" onPress={() => mutate(institutionPayload(row, row.status === "published" ? "hidden" : "published", Boolean(row.featured)))} /><AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => onDelete("institution", row.slug, row.name, "سيُحذف الشعار والمواد والمحتوى التابع، ويُمنع إذا وُجد طلاب أو طلبات أو نشاط مالي مرتبط.")} /></View></Card>)}
    <SectionTitle title="التخصصات الحالية" />
    {data.specialties.slice(0, 50).map((row) => <Card key={row.slug} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.name}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.slug} · {adminLabel(row.status)}</Text><AppButton full={false} title="حذف التخصص" variant="danger" onPress={() => onDelete("specialty", row.slug, row.name, "سيُحذف ربط التخصص والمواد التابعة، ويُمنع إذا كان مرتبطًا بطلاب أو سجل مالي.")} /></Card>)}
    <SectionTitle title="المواد الحالية" />
    {data.courses.filter((row) => row.specialtySlug).slice(0, 25).map((row) => <Card key={row.slug} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.title}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.university} · {row.price} ر.س · {adminLabel(row.status)}</Text><View style={styles.actionRow}><AppButton full={false} title={row.featured ? "إلغاء التمييز" : "تمييز"} variant="soft" onPress={() => mutate(coursePayload(row, row.status, !row.featured))} /><AppButton full={false} title={row.status === "published" ? "إخفاء" : "نشر"} variant="ghost" onPress={() => mutate(coursePayload(row, row.status === "published" ? "hidden" : "published", Boolean(row.featured)))} /><AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => onDelete("course", row.slug, row.title, "سيُحذف الغلاف والوحدات والدروس والفيديوهات والتقدم والمفضلة والسلة. يُمنع عند وجود تاريخ مالي أو وصول فعال.")} /></View></Card>)}
    <SectionTitle title="المحتوى الحالي" subtitle="يمكن حذف الوحدة أو الدرس أو الفيديو كلٌّ على حدة" />
    {data.units.map((unit) => <Card key={`unit-${unit.id}`} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{unit.title}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{unit.courseSlug} · الوحدة #{unit.id}</Text><AppButton full={false} title="حذف الوحدة" variant="danger" onPress={() => onDelete("unit", unit.id, unit.title, "سيُحذف الدروس والفيديوهات والتقدم والملاحظات التابعة.")} /></Card>)}
    {data.lessons.map((lesson) => <Card key={`lesson-${lesson.id}`} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{lesson.title}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{lesson.courseSlug} · {lesson.description || "بدون وصف"}</Text><View style={styles.actionRow}><AppButton full={false} title="حذف الدرس" variant="danger" onPress={() => onDelete("lesson", lesson.id, lesson.title, "سيُحذف الفيديو والتقدم والملاحظات المرتبطة.")} />{data.videos.filter((video) => video.lessonId === lesson.id).map((video) => <AppButton key={video.id} full={false} title="حذف الفيديو" variant="danger" onPress={() => onDelete("video", video.id, `فيديو ${lesson.title}`, "سيُحذف ملف الفيديو الخاص ويُفصل عن الدرس.")} />)}</View></Card>)}
  </>;
}

function ContentEditor({ data, colors, mutate }: { data: AdminData; colors: Colors; mutate: Mutate; }) {
  const emptyUnit = { id: "", courseSlug: "", title: "", description: "", position: "0", status: "draft" };
  const emptyLesson = { id: "", courseSlug: "", unitId: "", title: "", description: "", position: "0", durationSeconds: "0", status: "draft", freePreview: false };
  const [unit, setUnit] = useState(emptyUnit);
  const [lesson, setLesson] = useState(emptyLesson);
  const unitRows = data.units.filter((row) => row.courseSlug === unit.courseSlug);
  const lessonUnits = data.units.filter((row) => row.courseSlug === lesson.courseSlug);
  const lessonRows = data.lessons.filter((row) => row.courseSlug === lesson.courseSlug);
  const courses = data.courses.map((row) => ({ key: row.slug, label: row.title, detail: `${row.university} · ${adminLabel(row.status)}` }));

  const saveUnit = async () => {
    const saved = await mutate({
      action: "saveUnit",
      id: unit.id ? Number(unit.id) : undefined,
      courseSlug: unit.courseSlug,
      title: unit.title,
      description: unit.description,
      position: Number(unit.position) || 0,
      status: unit.status,
    }, unit.id ? "تم تحديث الوحدة" : "تم إنشاء الوحدة");
    if (saved) setUnit({ ...emptyUnit, courseSlug: unit.courseSlug });
  };

  const saveLesson = async () => {
    const saved = await mutate({
      action: "saveLesson",
      id: lesson.id || undefined,
      courseSlug: lesson.courseSlug,
      unitId: Number(lesson.unitId),
      title: lesson.title,
      description: lesson.description,
      position: Number(lesson.position) || 0,
      durationSeconds: Number(lesson.durationSeconds) || 0,
      status: lesson.status,
      freePreview: lesson.freePreview,
    }, lesson.id ? "تم تحديث الدرس" : "تم إنشاء الدرس");
    if (saved) setLesson({ ...emptyLesson, courseSlug: lesson.courseSlug, unitId: lesson.unitId });
  };

  return <>
    <SectionTitle title="بناء محتوى المادة" subtitle="أنشئ الوحدات والدروس أو اختر سجلًا موجودًا لتعديله من التطبيق" />
    <Card>
      <Text style={[styles.switchTitle, { color: colors.text, marginBottom: 12 }]}>الوحدات</Text>
      <SearchPicker label="المادة" value={unit.courseSlug} placeholder="اختر المادة" items={courses} onSelect={(item) => setUnit({ ...emptyUnit, courseSlug: item.key })} />
      <SearchPicker
        label="الوحدة المراد تعديلها"
        value={unit.id ? `unit:${unit.id}` : "new-unit"}
        placeholder="إنشاء وحدة جديدة"
        disabled={!unit.courseSlug}
        items={[{ key: "new-unit", label: "إنشاء وحدة جديدة" }, ...unitRows.map((row) => ({ key: `unit:${row.id}`, label: row.title, detail: `الترتيب ${row.position} · ${adminLabel(row.status)}` }))]}
        onSelect={(item) => {
          const existing = unitRows.find((row) => `unit:${row.id}` === item.key);
          setUnit(existing ? { id: String(existing.id), courseSlug: existing.courseSlug, title: existing.title, description: existing.description || "", position: String(existing.position), status: existing.status } : { ...emptyUnit, courseSlug: unit.courseSlug });
        }}
      />
      <Field label="عنوان الوحدة" value={unit.title} onChangeText={(value) => setUnit({ ...unit, title: value })} />
      <TextInput value={unit.description} onChangeText={(value) => setUnit({ ...unit, description: value })} placeholder="وصف الوحدة" placeholderTextColor={colors.textSoft} multiline textAlign="right" style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
      <Field label="ترتيب الوحدة" value={unit.position} onChangeText={(value) => setUnit({ ...unit, position: value })} keyboardType="number-pad" />
      <ChoiceRow values={["draft", "published", "hidden"]} selected={unit.status} onSelect={(value) => setUnit({ ...unit, status: value })} colors={colors} />
      <AppButton title={unit.id ? "تحديث الوحدة" : "إنشاء الوحدة"} icon="albums-outline" disabled={!unit.courseSlug || unit.title.trim().length < 2} onPress={() => void saveUnit()} />
    </Card>
    <Card style={{ marginTop: 12 }}>
      <Text style={[styles.switchTitle, { color: colors.text, marginBottom: 12 }]}>الدروس</Text>
      <SearchPicker label="المادة" value={lesson.courseSlug} placeholder="اختر المادة" items={courses} onSelect={(item) => setLesson({ ...emptyLesson, courseSlug: item.key })} />
      <SearchPicker label="الوحدة التابعة" value={lesson.unitId} placeholder={lesson.courseSlug ? "اختر وحدة من المادة" : "اختر المادة أولًا"} disabled={!lesson.courseSlug} items={lessonUnits.map((row) => ({ key: String(row.id), label: row.title, detail: `الترتيب ${row.position}` }))} onSelect={(item) => setLesson({ ...lesson, unitId: item.key, id: "" })} />
      <SearchPicker
        label="الدرس المراد تعديله"
        value={lesson.id ? `lesson:${lesson.id}` : "new-lesson"}
        placeholder="إنشاء درس جديد"
        disabled={!lesson.courseSlug}
        items={[{ key: "new-lesson", label: "إنشاء درس جديد" }, ...lessonRows.map((row) => ({ key: `lesson:${row.id}`, label: row.title, detail: `${adminLabel(row.status)} · ${row.durationSeconds} ثانية` }))]}
        onSelect={(item) => {
          const existing = lessonRows.find((row) => `lesson:${row.id}` === item.key);
          setLesson(existing ? { id: existing.id, courseSlug: existing.courseSlug, unitId: String(existing.unitId), title: existing.title, description: existing.description || "", position: String(existing.position), durationSeconds: String(existing.durationSeconds), status: existing.status, freePreview: existing.freePreview } : { ...emptyLesson, courseSlug: lesson.courseSlug, unitId: lesson.unitId });
        }}
      />
      <Field label="عنوان الدرس" value={lesson.title} onChangeText={(value) => setLesson({ ...lesson, title: value })} />
      <TextInput value={lesson.description} onChangeText={(value) => setLesson({ ...lesson, description: value })} placeholder="وصف الدرس" placeholderTextColor={colors.textSoft} multiline textAlign="right" style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
      <Field label="ترتيب الدرس" value={lesson.position} onChangeText={(value) => setLesson({ ...lesson, position: value })} keyboardType="number-pad" />
      <Field label="المدة بالثواني" value={lesson.durationSeconds} onChangeText={(value) => setLesson({ ...lesson, durationSeconds: value })} keyboardType="number-pad" />
      <ChoiceRow values={["draft", "published", "hidden"]} selected={lesson.status} onSelect={(value) => setLesson({ ...lesson, status: value })} colors={colors} />
      <ToggleRow label="معاينة مجانية" text="يسمح للطالب بتجربة هذا الدرس قبل شراء المادة" enabled={lesson.freePreview} onToggle={() => setLesson({ ...lesson, freePreview: !lesson.freePreview })} colors={colors} />
      <AppButton title={lesson.id ? "تحديث الدرس" : "إنشاء الدرس"} icon="play-circle-outline" disabled={!lesson.courseSlug || !lesson.unitId || lesson.title.trim().length < 2} onPress={() => void saveLesson()} />
    </Card>
  </>;
}

function institutionPayload(row: AdminData["institutions"][number], status: string, featured: boolean) { return { action: "saveInstitution", slug: row.slug, name: row.name, nameEn: row.nameEn, region: row.region, type: row.type, domain: row.domain || "", logoUrl: row.logo || "", status, featured }; }
function coursePayload(row: AdminData["courses"][number], status: string, featured: boolean) { return { action: "saveCourse", slug: row.slug, institutionSlug: row.universitySlug, specialtySlug: row.specialtySlug, title: row.title, titleEn: row.titleEn, code: row.code || "", description: row.description, price: row.price, oldPrice: row.oldPrice || 0, accessLabel: row.access, status, featured, coverTheme: row.coverTheme }; }
function orderCourseTitles(order: AdminData["orders"][number], courses: AdminData["courses"]) {
  const courseBySlug = new Map(courses.map((course) => [course.slug, course.title]));
  const titles: string[] = [];
  const append = (title?: string | null) => { const normalized = title?.trim(); if (normalized && !titles.includes(normalized)) titles.push(normalized); };
  const titleForSlug = (slug?: string | null) => slug ? courseBySlug.get(slug) || `مادة (${slug})` : "";
  for (const item of order.items || []) {
    if (typeof item === "string") append(titleForSlug(item));
    else append(item.courseTitle || item.title || titleForSlug(item.courseSlug || item.slug));
  }
  for (const slug of order.courseSlugs || []) append(titleForSlug(slug));
  append(titleForSlug(order.courseSlug));
  return titles;
}

function Commerce({ data, colors, mutate, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; onDelete: DeleteEntity; }) {
  const students = data.users.filter((row) => row.role === "student" && row.status === "active");
  const [access, setAccess] = useState({ userEmail: "", courseSlug: "", expiresAt: "" });
  const [coupon, setCoupon] = useState({ code: "", type: "percent", value: "", courseSlug: "", usageLimit: "" });
  return <>
    <SectionTitle title="منح صلاحية مادة" subtitle="تُسجل العملية وتصل للطالب بإشعار فوري" />
    <Card><SearchPicker label="الطالب" value={access.userEmail} placeholder="اختر حساب الطالب" items={students.map((row) => ({ key: row.email, label: row.fullName, detail: row.email }))} onSelect={(item) => setAccess({ ...access, userEmail: item.key })} /><SearchPicker label="المادة" value={access.courseSlug} placeholder="اختر المادة" items={data.courses.map((row) => ({ key: row.slug, label: row.title, detail: row.university }))} onSelect={(item) => setAccess({ ...access, courseSlug: item.key })} /><Field label="انتهاء الصلاحية — اختياري" value={access.expiresAt} onChangeText={(value) => setAccess({ ...access, expiresAt: value })} placeholder="2027-01-31T23:59:00Z" autoCapitalize="none" /><AppButton title="منح المادة" icon="key-outline" disabled={!access.userEmail || !access.courseSlug} onPress={() => mutate({ action: "grantAccess", ...access }, "تم منح المادة وإشعار الطالب")} /></Card>
    <SectionTitle title="إنشاء كوبون" />
    <Card><Field label="كود الخصم" value={coupon.code} onChangeText={(value) => setCoupon({ ...coupon, code: value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} autoCapitalize="characters" /><ChoiceRow values={["percent", "fixed"]} selected={coupon.type} onSelect={(value) => setCoupon({ ...coupon, type: value })} colors={colors} /><Field label={coupon.type === "percent" ? "النسبة" : "المبلغ"} value={coupon.value} onChangeText={(value) => setCoupon({ ...coupon, value })} keyboardType="decimal-pad" /><SearchPicker label="مادة محددة — اختياري" value={coupon.courseSlug} placeholder="كل المواد" items={data.courses.map((row) => ({ key: row.slug, label: row.title, detail: row.university }))} onSelect={(item) => setCoupon({ ...coupon, courseSlug: item.key })} /><Field label="حد الاستخدام — اختياري" value={coupon.usageLimit} onChangeText={(value) => setCoupon({ ...coupon, usageLimit: value })} keyboardType="number-pad" /><AppButton title="حفظ الكوبون" disabled={coupon.code.length < 3 || !coupon.value} onPress={() => mutate({ action: "saveCoupon", ...coupon, value: Number(coupon.value), usageLimit: Number(coupon.usageLimit) }, "تم حفظ الكوبون")} /></Card>
    <SectionTitle title="الكوبونات الحالية" />
    {data.coupons.map((row) => <Card key={row.id} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.code}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.type === "percent" ? `${row.value}%` : `${row.value} ر.س`} · استُخدم {row.usedCount}{row.usageLimit ? `/${row.usageLimit}` : ""} · {adminLabel(row.status)}</Text><AppButton full={false} title="حذف الكوبون" variant="danger" onPress={() => onDelete("coupon", row.code, row.code, "سيُحذف الكوبون فقط، ولن تتغير الطلبات أو الفواتير السابقة.")} /></Card>)}
    <SectionTitle title="آخر الطلبات" subtitle={`${data.metrics.paidOrders} مدفوعة من ${data.metrics.orders}`} />
    {data.orders.slice(0, 50).map((row) => { const courseTitles = orderCourseTitles({ ...row, items: row.items, courseSlugs: row.courseSlugs }, data.courses); return <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: row.status === "paid" ? colors.success : colors.warning }]}>{orderStatusLabel(row.status)}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>#{row.orderNumber}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.customerEmail}</Text><Text style={[styles.orderCourses, { color: colors.text }]}>{courseTitles.length ? `المواد (${courseTitles.length}): ${courseTitles.join("، ")}` : "لا توجد مواد مرتبطة بهذا الطلب"}</Text><Text style={[styles.amount, { color: colors.text }]}>{row.total.toLocaleString("ar-SA")} ر.س</Text></Card>; })}
  </>;
}

function Reviews({ data, colors, mutate, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; onDelete: DeleteEntity; }) {
  return <><SectionTitle title="التقييمات الموثقة" subtitle="تنشر فقط آراء أصحاب الشراء والتقدم الحقيقيين" />{data.reviews.map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={styles.stars}>{"★".repeat(row.rating)}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.userEmail}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{data.courses.find((course) => course.slug === row.courseSlug)?.title || row.courseSlug} · {adminLabel(row.status)}</Text><Text style={[styles.ticketBody, { color: colors.text }]}>{row.body}</Text><View style={styles.actionRow}><AppButton full={false} title="نشر" variant="soft" onPress={() => mutate({ action: "updateReview", id: row.id, status: "published" }, "تم نشر التقييم")} /><AppButton full={false} title="رفض" variant="danger" onPress={() => mutate({ action: "updateReview", id: row.id, status: "rejected" }, "تم رفض التقييم")} /><AppButton full={false} title="تعليق" variant="ghost" onPress={() => mutate({ action: "updateReview", id: row.id, status: "pending" })} /><AppButton full={false} title="حذف التقييم" variant="danger" onPress={() => onDelete("review", row.id, `تقييم ${row.courseSlug}`, "سيُحذف التقييم فقط، مع إبقاء المادة والحساب وسجل التدقيق.")} /></View></Card>)}</>;
}

function communicationSettings(source: AdminData["settings"]) {
  return {
    registration_enabled: source.registration_enabled || "true",
    purchases_enabled: source.purchases_enabled || "true",
    course_requests_enabled: source.course_requests_enabled || "true",
    support_enabled: source.support_enabled || "true",
    onboarding_enabled: source.onboarding_enabled || "true",
    maintenance_message: source.maintenance_message || "",
    announcement: source.announcement || "",
    whatsapp_number: source.whatsapp_number || "",
    whatsapp_message: source.whatsapp_message || "",
    support_email: source.support_email || "",
    support_hours: source.support_hours || "",
    social_x: source.social_x || "",
    social_instagram: source.social_instagram || "",
    social_tiktok: source.social_tiktok || "",
    social_youtube: source.social_youtube || "",
    social_telegram: source.social_telegram || "",
    social_linkedin: source.social_linkedin || "",
    social_facebook: source.social_facebook || "",
    social_snapchat: source.social_snapchat || "",
    social_threads: source.social_threads || "",
  };
}

type CommunicationSettings = ReturnType<typeof communicationSettings>;
type CommunicationSettingKey = keyof CommunicationSettings;
type DirtyCommunicationSettings = Partial<Record<CommunicationSettingKey, boolean>>;
const operationSettingKeys: readonly CommunicationSettingKey[] = ["registration_enabled", "purchases_enabled", "course_requests_enabled", "support_enabled", "onboarding_enabled", "maintenance_message"];
const contactSettingKeys: readonly CommunicationSettingKey[] = ["announcement", "whatsapp_number", "whatsapp_message", "support_email", "support_hours", "social_x", "social_instagram", "social_tiktok", "social_youtube", "social_telegram", "social_linkedin", "social_facebook", "social_snapchat", "social_threads"];
const communicationSettingKeys: readonly CommunicationSettingKey[] = [...operationSettingKeys, ...contactSettingKeys];

function Communication({ data, colors, mutate, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; onDelete: DeleteEntity; }) {
  const [settings, setSettings] = useState(() => communicationSettings(data.settings));
  const [dirtySettings, setDirtySettings] = useState<DirtyCommunicationSettings>({});
  const settingsRef = useRef(settings);
  const dirtySettingsRef = useRef(dirtySettings);
  const serverSettingsRef = useRef(settings);
  const emptyNotice = { title: "", body: "", audience: "student", userEmail: "", actionUrl: "/notifications", actionLabel: "", presentation: "inbox", pushEnabled: true, startsAt: "", expiresAt: "", dismissible: true };
  const [notice, setNotice] = useState(emptyNotice);
  useEffect(() => {
    const incoming = communicationSettings(data.settings);
    const timer = setTimeout(() => {
      const nextSettings = { ...settingsRef.current };
      const nextDirty = { ...dirtySettingsRef.current };
      for (const key of communicationSettingKeys) {
        if (nextDirty[key] && nextSettings[key] !== incoming[key]) continue;
        nextSettings[key] = incoming[key];
        delete nextDirty[key];
      }
      serverSettingsRef.current = incoming;
      settingsRef.current = nextSettings;
      dirtySettingsRef.current = nextDirty;
      setSettings(nextSettings);
      setDirtySettings(nextDirty);
    }, 0);
    return () => clearTimeout(timer);
  }, [data.settings]);
  const update = (key: CommunicationSettingKey, value: string) => {
    const nextSettings = { ...settingsRef.current, [key]: value };
    const nextDirty = { ...dirtySettingsRef.current };
    if (value === serverSettingsRef.current[key]) delete nextDirty[key]; else nextDirty[key] = true;
    settingsRef.current = nextSettings;
    dirtySettingsRef.current = nextDirty;
    setSettings(nextSettings);
    setDirtySettings(nextDirty);
  };
  const saveSettingsGroup = async (keys: readonly CommunicationSettingKey[], success: string) => {
    const changedKeys = keys.filter((key) => dirtySettingsRef.current[key]);
    if (!changedKeys.length) return;
    const values = Object.fromEntries(changedKeys.map((key) => [key, settingsRef.current[key]]));
    const saved = await mutate({ action: "saveSettings", values }, success);
    if (!saved) return;
    const nextDirty = { ...dirtySettingsRef.current };
    for (const key of changedKeys) if (settingsRef.current[key] === values[key]) delete nextDirty[key];
    dirtySettingsRef.current = nextDirty;
    setDirtySettings(nextDirty);
  };
  const operationSettingsChanged = operationSettingKeys.some((key) => dirtySettings[key]);
  const contactSettingsChanged = contactSettingKeys.some((key) => dirtySettings[key]);
  const actionRouteItems = [{ key: "none", label: "دون رابط أو زر" }, ...ADMIN_ACTION_ROUTE_OPTIONS];
  const createNotification = async () => {
    const targetedEmail = notice.userEmail.trim().toLowerCase();
    const saved = await mutate({
      action: "createNotification",
      title: notice.title,
      body: notice.body,
      audience: targetedEmail ? "user" : notice.audience,
      userEmail: targetedEmail || null,
      actionUrl: notice.actionUrl || null,
      actionLabel: notice.actionUrl ? notice.actionLabel.trim() || null : null,
      presentation: notice.presentation,
      pushEnabled: notice.pushEnabled,
      startsAt: notice.startsAt.trim() || null,
      expiresAt: notice.expiresAt.trim() || null,
      dismissible: notice.dismissible,
    }, notice.startsAt.trim() ? "تم حفظ الحملة المجدولة" : "تم إنشاء الحملة وإرسالها حسب الإعدادات");
    if (saved) setNotice(emptyNotice);
  };
  const featureRows = [
    { key: "registration_enabled" as const, label: "إنشاء الحسابات", text: "إظهار التسجيل وقبول الحسابات الجديدة", icon: "person-add-outline" as const },
    { key: "purchases_enabled" as const, label: "الشراء والدفع", text: "السلة والكوبونات وبدء الدفع", icon: "card-outline" as const },
    { key: "course_requests_enabled" as const, label: "طلبات المواد", text: "إرسال السلايدات والطلبات الجديدة", icon: "cloud-upload-outline" as const },
    { key: "support_enabled" as const, label: "الدعم الفني", text: "إيقاف فتح التذاكر وردود الطلاب؛ يبقى فريق الإدارة قادرًا على المعالجة", icon: "headset-outline" as const },
    { key: "onboarding_enabled" as const, label: "جولة البداية", text: "عرض التعريف الاحترافي أول مرة", icon: "sparkles-outline" as const },
  ];
  const futurePushConflict = Boolean(notice.pushEnabled && notice.startsAt.trim());
  const campaignInvalid = !notice.dismissible && !notice.actionUrl;
  return (
    <>
      <SectionTitle title="تشغيل خدمات المنصة" subtitle="هذه المفاتيح تتحكم فورًا في الويب والتطبيق، ويظل المحتوى المقروء متاحًا" />
      <Card>
        {featureRows.map((item) => {
          const enabled = settings[item.key] !== "false";
          return (
            <Pressable key={item.key} accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={() => update(item.key, enabled ? "false" : "true")} style={[styles.switchRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.switchIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={item.icon} size={20} color={colors.primary} /></View>
              <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: colors.text }]}>{item.label}</Text><Text style={[styles.switchText, { color: colors.textSoft }]}>{item.text}</Text></View>
              <View style={[styles.switchTrack, { backgroundColor: enabled ? colors.success : colors.border }]}><View style={[styles.switchThumb, { transform: [{ translateX: enabled ? -18 : 0 }] }]} /></View>
            </Pressable>
          );
        })}
        <Text style={[styles.switchTitle, { color: colors.text, marginTop: 14 }]}>رسالة الإيقاف أو الصيانة</Text>
        <Text style={[styles.switchText, { color: colors.textSoft, marginTop: 4, marginBottom: 8 }]}>تظهر للمستخدم بدل الإجراء المتوقف. اتركها فارغة عند التشغيل الطبيعي.</Text>
        <TextInput value={settings.maintenance_message} onChangeText={(value) => update("maintenance_message", value)} placeholder="مثال: نجري تحديثًا قصيرًا، وستعود الخدمة الساعة 6 مساءً" placeholderTextColor={colors.textSoft} multiline textAlign="right" style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
        <AppButton title="حفظ تشغيل الخدمات" icon="save-outline" disabled={!operationSettingsChanged} onPress={() => void saveSettingsGroup(operationSettingKeys, "تم تحديث تشغيل الخدمات في الويب والتطبيق")} />
      </Card>

      <SectionTitle title="التنبيه العام وقنوات التواصل" subtitle="تظهر القيم المحفوظة تلقائيًا في الويب والتطبيق وصفحة الدعم" />
      <Card>
        <Text style={[styles.switchTitle, { color: colors.text }]}>التنبيه العام الثابت</Text>
        <Text style={[styles.switchText, { color: colors.textSoft, marginTop: 4 }]}>رسالة مختصرة تظهر في الصفحة الرئيسية للتطبيق والويب، مستقلة عن حملات الإشعارات أدناه.</Text>
        <TextInput value={settings.announcement} onChangeText={(value) => update("announcement", value)} placeholder="اكتب تنبيهًا عامًا، أو اتركه فارغًا لإخفائه" placeholderTextColor={colors.textSoft} maxLength={500} multiline textAlign="right" style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
        <Field label="رقم واتساب" value={settings.whatsapp_number} onChangeText={(value) => update("whatsapp_number", value)} keyboardType="phone-pad" />
        <Field label="رسالة واتساب الافتراضية" value={settings.whatsapp_message} onChangeText={(value) => update("whatsapp_message", value)} />
        <Field label="بريد الدعم" value={settings.support_email} onChangeText={(value) => update("support_email", value)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="ساعات العمل" value={settings.support_hours} onChangeText={(value) => update("support_hours", value)} />
        <Text style={[styles.dataMeta, { color: colors.textSoft }]}>الشبكات الاجتماعية</Text>
        {[["social_x", "X"], ["social_instagram", "إنستغرام"], ["social_tiktok", "تيك توك"], ["social_youtube", "يوتيوب"], ["social_telegram", "تيليغرام"], ["social_linkedin", "لينكدإن"], ["social_facebook", "فيسبوك"], ["social_snapchat", "سناب شات"], ["social_threads", "ثريدز"]].map(([key, label]) => (
          <Field key={key} label={"رابط " + label} value={settings[key as keyof typeof settings]} onChangeText={(value) => update(key as keyof typeof settings, value)} autoCapitalize="none" />
        ))}
        <AppButton title="حفظ التنبيه وقنوات التواصل" icon="save-outline" disabled={!contactSettingsChanged} onPress={() => void saveSettingsGroup(contactSettingKeys, "تم تحديث التنبيه والقنوات في الويب والتطبيق")} />
      </Card>

      <SectionTitle title="حملات الإشعارات والإعلانات" subtitle="استهداف فردي أو حسب الفئة، مع موضع العرض والرابط والجدولة والتحكم بالتنبيه الفوري" />
      <Card>
        <Text style={[styles.switchTitle, { color: colors.text, marginBottom: 8 }]}>الفئة المستهدفة</Text>
        <ChoiceRow values={["public", "student", "supervisor", "admin", "user"]} selected={notice.audience} onSelect={(value) => setNotice({ ...notice, audience: value })} colors={colors} />
        <Field label={notice.audience === "user" ? "بريد المستخدم — مطلوب" : "بريد مستخدم محدد — اختياري"} value={notice.userEmail} onChangeText={(value) => setNotice({ ...notice, userEmail: value })} keyboardType="email-address" autoCapitalize="none" />
        {notice.userEmail.trim() ? <Text style={[styles.switchText, { color: colors.primary, marginBottom: 10 }]}>عند إدخال البريد تُرسل الحملة لهذا الحساب فقط بفئة «مستخدم».</Text> : null}
        <Field label="عنوان الحملة" value={notice.title} onChangeText={(value) => setNotice({ ...notice, title: value })} />
        <TextInput value={notice.body} onChangeText={(value) => setNotice({ ...notice, body: value })} placeholder="نص الإشعار أو الإعلان" placeholderTextColor={colors.textSoft} multiline textAlign="right" style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
        <Text style={[styles.switchTitle, { color: colors.text, marginBottom: 8 }]}>موضع العرض</Text>
        <ChoiceRow values={["inbox", "banner", "modal", "all"]} selected={notice.presentation} onSelect={(value) => setNotice({ ...notice, presentation: value })} colors={colors} />
        <SearchPicker label="وجهة الزر داخل المنصة" value={notice.actionUrl || "none"} placeholder="اختر وجهة معتمدة" items={actionRouteItems} onSelect={(item) => setNotice({ ...notice, actionUrl: item.key === "none" ? "" : item.key, actionLabel: item.key === "none" ? "" : notice.actionLabel })} />
        <Field label="نص الزر — اختياري" value={notice.actionLabel} editable={Boolean(notice.actionUrl)} onChangeText={(value) => setNotice({ ...notice, actionLabel: value })} placeholder={notice.actionUrl ? "مثال: عرض التفاصيل" : "اختر وجهة أولًا"} />
        <Field label="بداية العرض — اختياري" value={notice.startsAt} onChangeText={(value) => setNotice({ ...notice, startsAt: value })} placeholder="2026-09-01T09:00:00Z" autoCapitalize="none" />
        <Field label="نهاية العرض — اختياري" value={notice.expiresAt} onChangeText={(value) => setNotice({ ...notice, expiresAt: value })} placeholder="2026-09-07T21:00:00Z" autoCapitalize="none" />
        <ToggleRow label="تنبيه فوري Push" text="يرسل فور الحفظ للأجهزة المسجلة؛ عطّله عند جدولة الحملة للمستقبل" enabled={notice.pushEnabled} onToggle={() => setNotice({ ...notice, pushEnabled: !notice.pushEnabled })} colors={colors} />
        <ToggleRow label="قابل للإخفاء" text="إذا عطّلته، يجب تحديد وجهة زر معتمدة حتى لا يُحاصر المستخدم" enabled={notice.dismissible} onToggle={() => setNotice({ ...notice, dismissible: !notice.dismissible })} colors={colors} />
        {futurePushConflict ? <Text style={[styles.message, { color: colors.danger }]}>عطّل التنبيه الفوري لحفظ حملة يبدأ عرضها مستقبلًا.</Text> : null}
        {campaignInvalid ? <Text style={[styles.message, { color: colors.danger }]}>الإعلان غير القابل للإخفاء يحتاج وجهة زر معتمدة.</Text> : null}
        <AppButton title={notice.startsAt.trim() ? "حفظ الحملة المجدولة" : "إنشاء الحملة"} icon="send-outline" disabled={notice.title.trim().length < 3 || notice.body.trim().length < 3 || (notice.audience === "user" && !notice.userEmail.trim()) || futurePushConflict || campaignInvalid} onPress={() => void createNotification()} />
      </Card>

      <SectionTitle title="الحملات الحالية" subtitle="آخر 30 إشعارًا وإعلانًا محفوظًا" />
      <View>
        {data.notifications.slice(0, 30).map((row) => {
          const destination = ADMIN_ACTION_ROUTE_OPTIONS.find((item) => item.key === row.actionUrl)?.label || (row.actionUrl ? "رابط داخلي معتمد" : "دون رابط");
          return (
            <Card key={row.id} style={styles.dataCard}>
              <Text style={[styles.dataTitle, { color: colors.text }]}>{row.title}</Text>
              <Text style={[styles.ticketBody, { color: colors.text }]}>{row.body}</Text>
              <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{adminLabel(row.audience)} · {row.userEmail || "كل الفئة"} · {adminLabel(row.presentation || "inbox")}</Text>
              <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.pushEnabled === false ? "دون تنبيه فوري" : "مع تنبيه فوري"} · {row.dismissible === false ? "غير قابل للإخفاء" : "قابل للإخفاء"} · {destination}</Text>
              {row.startsAt || row.expiresAt ? <Text style={[styles.dataMeta, { color: colors.textSoft }]}>البداية: {row.startsAt ? new Date(row.startsAt).toLocaleString("ar-SA") : "فورًا"} · النهاية: {row.expiresAt ? new Date(row.expiresAt).toLocaleString("ar-SA") : "مفتوحة"}</Text> : null}
              <AppButton full={false} title="حذف الحملة" variant="danger" onPress={() => onDelete("notification", row.id, row.title, "سيُحذف الإشعار أو الإعلان فقط، مع إبقاء سجل التدقيق محفوظًا.")} />
            </Card>
          );
        })}
      </View>
    </>
  );
}

function ChoiceRow({ values, selected, onSelect, colors }: { values: string[]; selected: string; onSelect: (value: string) => void; colors: Colors; }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.choice, { backgroundColor: selected === value ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: selected === value ? "#FFF" : colors.text, fontSize: 9, fontWeight: "800" }}>{adminLabel(value)}</Text></Pressable>)}</ScrollView>;
}

function ToggleRow({ label, text, enabled, onToggle, colors }: { label: string; text: string; enabled: boolean; onToggle: () => void; colors: Colors; }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={onToggle} style={[styles.switchRow, { borderBottomColor: colors.border }]}><View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: colors.text }]}>{label}</Text><Text style={[styles.switchText, { color: colors.textSoft }]}>{text}</Text></View><View style={[styles.switchTrack, { backgroundColor: enabled ? colors.success : colors.border }]}><View style={[styles.switchThumb, { transform: [{ translateX: enabled ? -18 : 0 }] }]} /></View></Pressable>;
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingBottom: 14 }, tab: { minWidth: 88, minHeight: 56, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 5 }, message: { fontSize: 10, textAlign: "center", marginBottom: 8, fontWeight: "800" },
  metricGrid: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }, metric: { width: "48%", minHeight: 130, alignItems: "flex-end" }, metricValue: { fontSize: 20, fontWeight: "900", marginTop: 12 }, metricLabel: { fontSize: 9, marginTop: 4 },
  queue: { minHeight: 54, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, queueValue: { fontSize: 18, fontWeight: "900" }, queueLabel: { fontSize: 11, fontWeight: "800" }, service: { minHeight: 50, flexDirection: "row-reverse", alignItems: "center", gap: 9 }, serviceText: { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "right" },
  dataCard: { marginBottom: 9 }, coverPreview: { width: "100%", height: 150, borderRadius: 16, marginTop: 10, backgroundColor: "#CBD5E1" }, requestFiles: { marginTop: 6, gap: 5 }, requestFile: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingVertical: 6 }, dataHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, dataTitle: { flex: 1, fontSize: 13, fontWeight: "900", textAlign: "right" }, role: { fontSize: 9, fontWeight: "900" }, dataMeta: { fontSize: 8, textAlign: "right", marginTop: 5 }, orderCourses: { fontSize: 10, lineHeight: 18, fontWeight: "800", textAlign: "right", marginTop: 8 }, actionRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginTop: 12 }, statuses: { gap: 6, marginTop: 11 }, status: { minHeight: 34, borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  ticketBody: { fontSize: 10, lineHeight: 18, textAlign: "right", marginTop: 9 }, adminThread: { gap: 7, padding: 10, borderRadius: 13, marginTop: 10 }, adminBubble: { padding: 10, borderRadius: 12 }, adminBubbleLabel: { color: "#FFF", fontSize: 9, fontWeight: "900", textAlign: "right" }, adminBubbleText: { color: "#FFF", fontSize: 10, lineHeight: 18, textAlign: "right", marginTop: 4 }, adminAttachment: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingTop: 6 }, area: { minHeight: 90, borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 11, marginBottom: 12, textAlignVertical: "top", writingDirection: "rtl" }, choices: { flexDirection: "row-reverse", gap: 7, paddingBottom: 12 }, choice: { minHeight: 36, borderRadius: 11, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, spacer: { height: 10 }, amount: { fontSize: 15, fontWeight: "900", textAlign: "right", marginTop: 10 }, stars: { color: "#F7A810", letterSpacing: 2 },
  switchRow: { minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8 }, switchIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, switchCopy: { flex: 1, alignItems: "flex-end" }, switchTitle: { fontSize: 11, fontWeight: "900", textAlign: "right" }, switchText: { fontSize: 8, lineHeight: 14, textAlign: "right" }, switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: "center" }, switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: .15, shadowRadius: 3, elevation: 2 },
});
