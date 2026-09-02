import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AdminAi } from "@/src/components/AdminAi";
import { AdminFinance, AdminLearningTracks, AdminOperations, AdminStudentProfile } from "@/src/components/AdminCenters";
import { AdminReferrals } from "@/src/components/AdminReferrals";
import { AppearanceSettings } from "@/src/components/AppearanceSettings";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, EmptyState, Field, LoadingState, Screen, SearchBox, SectionTitle } from "@/src/components/ui";
import { absoluteUrl, ADMIN_STEP_UP_MESSAGE, api, ApiError, getApiToken, isAdminStepUpError, jsonBody, setAdminStepUpToken } from "@/src/lib/api";
import { downloadProtectedFile } from "@/src/lib/downloads";
import { assetMimeType } from "@/src/lib/file-types";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { Course, Institution, SupportTicket } from "@/src/types";

const LazySupportChat = React.lazy(async () => {
  const module = await import("@/src/components/SupportChat");
  return { default: module.SupportChat };
});

type Colors = ReturnType<typeof useTheme>["colors"];
type AdminData = {
  metrics: { students: number; activeStudents: number; institutions: number; publishedCourses: number; orders: number; paidOrders: number; revenue: number; openRequests: number; openTickets: number; pendingReviews: number };
  services: Record<string, boolean>;
  users: { id: number; fullName: string; email: string; phone: string | null; role: string; status: string; universitySlug: string | null; specialty: string | null; academicLevel: string | null; profileCompletedAt: string | null; deviceCount?: number; sessions?: { id: number; deviceId: string | null; deviceLabel: string; platform: string; ipAddress: string | null; lastSeenAt: string; expiresAt: string; createdAt: string }[] }[];
  deviceLimit: number;
  requests: { id: number; userId?: number | null; courseName: string; university: string; specialty: string; courseUrl?: string | null; status: string; preparedCourseSlug?: string | null; attachmentsCount: number; createdAt: string; student?: { fullName: string; email: string; phone: string | null; universitySlug: string | null; specialty: string | null; academicLevel: string | null; status: string } | null; files?: { id: number; originalName: string; contentType: string; sizeBytes: number; createdAt: string }[] }[];
  tickets: { id: number; ticketNumber: string; title: string; message: string; userEmail: string | null; contactChannel?: string; status: string; createdAt: string; student?: { fullName: string; email: string; phone: string | null; universitySlug: string | null; specialty: string | null; academicLevel: string | null; status: string } | null; replies?: { id: number; body: string; authorRole?: string; authorEmail?: string; internal?: boolean; replyToId?: number | null; createdAt: string; files?: { id: number; originalName: string; contentType: string; sizeBytes: number; createdAt: string }[] }[] }[];
  institutions: (Institution & { status: string })[];
  courses: (Course & { status: string; specialtySlug: string; coverTheme: string })[];
  specialties: { slug: string; name: string; description: string; status: string }[];
  orders: { id: number; orderNumber: string; customerEmail: string; courseSlug: string; total: number; status: string; createdAt: string }[];
  access: { id: number; userEmail: string; courseSlug: string; source: string; orderNumber: string | null; startsAt: string; expiresAt: string | null; suspendedAt: string | null; suspensionReason: string | null; revokedAt: string | null; revocationReason: string | null; updatedAt: string }[];
  reviews: { id: number; userEmail: string; courseSlug: string; rating: number; body: string; status: string }[];
  units: { id: number; courseSlug: string; title: string; description?: string; position: number; status: string }[];
  lessons: { id: string; courseSlug: string; unitId: number; title: string; description?: string; durationSeconds: number; freePreview: boolean; status: string; videoAssetId: number | null }[];
  videos: { id: number; courseSlug: string; lessonId: string; status: string; sizeBytes: number; createdAt: string }[];
  notifications: { id: number; title: string; body: string; audience: string; userEmail: string | null; actionUrl?: string | null; actionLabel?: string | null; presentation?: string; template?: string; pushEnabled?: boolean; startsAt?: string | null; expiresAt?: string | null; dismissible?: boolean; createdAt: string }[];
  coupons: { id: number; code: string; type: string; value: number; courseSlug: string | null; usageLimit: number | null; usedCount: number; status: string }[];
  supervisorAssignments: { id: number; supervisorId: number; institutionSlug: string | null; specialty: string | null; active: boolean }[];
  settings: Record<string, string>;
};

type Tab = "overview" | "users" | "subscriptions" | "staff" | "requests" | "support" | "catalog" | "commerce" | "finance" | "operations" | "bundles" | "tracks" | "referrals" | "ai" | "reviews" | "communication" | "security" | "appearance";
type Mutate = (payload: Record<string, unknown>, success?: string) => Promise<boolean>;
type DeleteEntity = (entityType: string, entityId: string | number, label: string, impact: string) => void;
const arabicMap: Record<string, string> = { ا: "a", أ: "a", إ: "i", آ: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y", ة: "h", ى: "a", ء: "a" };
function asciiSlug(value: string) { return [...value.toLowerCase()].map((char) => arabicMap[char] || char).join("").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54) || "item"; }
function stableHash(value: string) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36).slice(0, 7); }
function makeInstitutionSlug(name: string) { return `${asciiSlug(name)}-${stableHash(name)}`.slice(0, 80); }
function makeCourseSlug(institutionSlug: string, specialtyName: string, courseName: string) { return `${institutionSlug}-${asciiSlug(specialtyName)}-${asciiSlug(courseName)}-${stableHash(`${institutionSlug}:${specialtyName}:${courseName}`)}`.slice(0, 80); }
function accessOperationKey(id: number, operation: string) { return `mobile_${id}_${operation}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }

async function readLocalVideoDuration(uri: string) {
  if (Platform.OS === "web" || !uri) return 0;
  try {
    const { createVideoPlayer } = await import("expo-video");
    const player = createVideoPlayer(null);
    try {
      return await new Promise<number>((resolve) => {
        let settled = false;
        let subscription: { remove(): void } | null = null;
        const finish = (value: number) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          subscription?.remove();
          const seconds = Math.round(Number(value));
          resolve(Number.isFinite(seconds) && seconds > 0 && seconds <= 7 * 24 * 60 * 60 ? seconds : 0);
        };
        const timer = setTimeout(() => finish(player.duration || 0), 10_000);
        subscription = player.addListener("sourceLoad", ({ duration }) => finish(duration));
        void player.replaceAsync({ uri }).then(() => {
          if (player.duration > 0) finish(player.duration);
        }).catch(() => finish(0));
      });
    } finally {
      player.release();
    }
  } catch {
    return 0;
  }
}

const requestStatuses = ["new", "assigned", "reviewing", "planned", "producing", "available", "declined"];
const requestStatusLabels: Record<"ar" | "en", Record<string, string>> = {
  ar: { new: "جديد", assigned: "مسند", reviewing: "قيد المراجعة", planned: "مخطط له", producing: "قيد الإنتاج", available: "متاح", declined: "متعذر" },
  en: { new: "New", assigned: "Assigned", reviewing: "Reviewing", planned: "Planned", producing: "In production", available: "Available", declined: "Declined" },
};
const notificationAudienceLabels: Record<string, string> = { student: "جميع الطلاب", public: "الزوار والطلاب", supervisor: "المشرفون", admin: "الإدارة", user: "مستخدم محدد", segment: "شريحة طلاب مستهدفة" };
const notificationPresentationLabels: Record<string, string> = { inbox: "مركز الإشعارات", banner: "شريط إعلاني", modal: "نافذة منبثقة", all: "مركز الإشعارات والشريط والنافذة" };
const roleLabels: Record<string, string> = { student: "طالب", supervisor: "مشرف", admin: "مدير" };
const accountStatusLabels: Record<string, string> = { active: "نشط", suspended: "معلّق", inactive: "غير نشط", pending: "قيد التفعيل", invited: "بانتظار قبول الدعوة", banned: "محظور", deleted: "محذوف" };
const publicationStatusLabels: Record<string, string> = { published: "منشور", hidden: "مخفي", draft: "مسودة", archived: "مؤرشف", active: "نشط", inactive: "غير نشط", disabled: "معطّل" };
const reviewStatusLabels: Record<string, string> = { pending: "بانتظار المراجعة", published: "منشور", rejected: "مرفوض", hidden: "مخفي" };
const couponTypeLabels: Record<string, string> = { percent: "نسبة مئوية", fixed: "مبلغ ثابت" };
const grantTypeLabels: Record<string, string> = { manual_payment: "دفعة يدوية", complimentary: "منحة مجانية" };
const couponStatusLabels: Record<string, string> = { active: "نشط", inactive: "غير نشط", disabled: "معطّل", expired: "منتهي", exhausted: "مكتمل الاستخدام" };
const institutionTypeLabels: Record<string, string> = { university: "جامعة", college: "كلية", technical: "تقنية", public: "حكومية", private: "أهلية", "حكومية": "حكومية", "أهلية": "أهلية", "كلية": "كلية", "تقنية": "تقنية" };
const orderStatusLabels: Record<string, string> = { initiated: "بدأ الدفع", pending: "بانتظار الدفع", verification_pending: "قيد التحقق من الدفع", payment_review: "قيد مراجعة الدفع", paid: "مدفوع", partially_refunded: "مسترد جزئيًا", refunded: "مسترد", failed: "متعذر", canceled: "ملغي", cancelled: "ملغي", voided: "مبطل" };
const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "overview", label: "الرئيسية", icon: "grid-outline" },
  { key: "users", label: "الحسابات", icon: "people-outline" },
  { key: "subscriptions", label: "الاشتراكات", icon: "shield-checkmark-outline" },
  { key: "staff", label: "الموظفون", icon: "person-add-outline" },
  { key: "requests", label: "الطلبات", icon: "cloud-upload-outline" },
  { key: "support", label: "الدعم", icon: "headset-outline" },
  { key: "catalog", label: "الكتالوج", icon: "library-outline" },
  { key: "commerce", label: "المبيعات", icon: "card-outline" },
  { key: "finance", label: "المالية", icon: "cash-outline" },
  { key: "operations", label: "التشغيل", icon: "pulse-outline" },
  { key: "bundles", label: "الباقات", icon: "albums-outline" },
  { key: "tracks", label: "المسارات", icon: "map-outline" },
  { key: "referrals", label: "الإحالات", icon: "gift-outline" },
  { key: "ai", label: "مراس AI", icon: "sparkles-outline" },
  { key: "reviews", label: "التقييمات", icon: "star-outline" },
  { key: "communication", label: "التواصل", icon: "megaphone-outline" },
  { key: "security", label: "الأمان", icon: "shield-checkmark-outline" },
  { key: "appearance", label: "المظهر", icon: "color-palette-outline" },
];

export default function Admin() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { language, direction, rowDirection } = useLanguage();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const query = useQuery({ queryKey: ["admin-console"], queryFn: () => api<AdminData>("/api/admin/console?client=mobile"), enabled: user?.role === "admin", staleTime: 15_000, retry: 1 });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ["admin-console"] }); };
  const stepUpRequired = (detail?: string) => {
    setMessage(ADMIN_STEP_UP_MESSAGE);
    setTab("security");
    Alert.alert(language === "ar" ? "التحقق الإداري مطلوب" : "Admin verification required", detail || ADMIN_STEP_UP_MESSAGE);
  };
  const mutate: Mutate = async (payload, success = "تم حفظ التغيير") => {
    setMessage("");
    try { await api("/api/admin/console", { method: "POST", body: jsonBody(payload) }); setMessage(success); await refresh(); return true; }
    catch (reason) {
      if (isAdminStepUpError(reason)) { stepUpRequired(reason.message); return false; }
      setMessage(reason instanceof ApiError ? reason.message : "تعذر تنفيذ الإجراء");
      return false;
    }
  };
  const deleteEntity: DeleteEntity = (entityType, entityId, label, impact) => Alert.alert(
    language === "ar" ? "تأكيد الحذف النهائي" : "Confirm permanent deletion",
    language === "ar" ? `سيُحذف «${label}» نهائيًا.\n\n${impact}\n\nلن تُحذف الطلبات أو الفواتير أو أحداث الدفع، وتبقى سجلات التدقيق محفوظة.` : `Delete “${label}” permanently?\n\nThe selected non-financial data will be removed. Orders, invoices, payment events and audit logs are retained when required.`,
    [
      { text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
      { text: language === "ar" ? "حذف نهائي" : "Delete permanently", style: "destructive", onPress: () => void mutate({ action: "deleteEntity", entityType, entityId: String(entityId), confirmation: "حذف" }, "تم الحذف النهائي وتحديث البيانات") },
    ],
  );

  if (user?.role !== "admin") return <Screen><AppHeader title="لوحة الإدارة" back /><EmptyState icon="lock-closed-outline" title="غير مصرح" text="هذه الصفحة متاحة للحسابات الإدارية فقط، ولا توجد حسابات تجريبية عامة." /></Screen>;
  if (query.isLoading) return <Screen><LoadingState label="جارٍ تحميل مركز التحكم..." /></Screen>;
  if (!query.data) return <Screen><AppHeader title="لوحة الإدارة" back /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل البيانات" text="تحقق من الاتصال ثم أعد المحاولة." action={<AppButton title="إعادة المحاولة" onPress={() => query.refetch()} />} /></Screen>;
  const data = query.data;

  return <Screen keyboard>
    <AppHeader title="لوحة الإدارة" subtitle="تحكم مباشر وآمن في منصة مراس" back />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabs, { direction, flexDirection: rowDirection }]}>{tabs.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} onPress={() => setTab(item.key)} style={[styles.tab, { backgroundColor: tab === item.key ? colors.primary : colors.surface, borderColor: tab === item.key ? colors.primary : colors.border }]}><View style={styles.tabIcon}><Ionicons name={item.icon} size={18} color={tab === item.key ? "#FFF" : colors.primary} /></View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.82} style={[styles.tabLabel, { color: tab === item.key ? "#FFF" : colors.text }]}>{item.label}</Text></Pressable>)}</ScrollView>
    {message ? <Text style={[styles.message, { color: message.startsWith("تم") ? colors.success : colors.danger }]}>{message}</Text> : null}
    {tab === "overview" && <Overview data={data} colors={colors} />}
    {tab === "users" && (profileEmail ? <AdminStudentProfile email={profileEmail} onClose={() => setProfileEmail("")} onStepUpRequired={stepUpRequired} /> : <Users data={data} colors={colors} mutate={mutate} onDelete={deleteEntity} onOpenProfile={setProfileEmail} />)}
    {tab === "subscriptions" && <SubscriptionAdmin data={data} colors={colors} mutate={mutate} />}
    {tab === "staff" && <StaffAdmin data={data} colors={colors} refresh={refresh} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "requests" && <Requests rows={data.requests} courses={data.courses} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "support" && <Support rows={data.tickets} colors={colors} mutate={mutate} refresh={refresh} onDelete={deleteEntity} />}
    {tab === "catalog" && <CatalogAdmin data={data} colors={colors} mutate={mutate} refresh={refresh} onDelete={deleteEntity} />}
    {tab === "commerce" && <Commerce data={data} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "finance" && <AdminFinance onStepUpRequired={stepUpRequired} />}
    {tab === "operations" && <AdminOperations onStepUpRequired={stepUpRequired} />}
    {tab === "bundles" && <MobileBundleAdmin colors={colors} institutions={data.institutions}/>}
    {tab === "tracks" && <AdminLearningTracks onStepUpRequired={stepUpRequired} />}
    {tab === "referrals" && <AdminReferrals onStepUpRequired={stepUpRequired} />}
    {tab === "ai" && <AdminAi onStepUpRequired={stepUpRequired} />}
    {tab === "reviews" && <Reviews data={data} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "communication" && <Communication data={data} colors={colors} mutate={mutate} onDelete={deleteEntity} />}
    {tab === "security" && <MobileAdminSecurity colors={colors} />}
    {tab === "appearance" && <AppearanceSettings />}
  </Screen>;
}

function Overview({ data, colors }: { data: AdminData; colors: Colors }) {
  const { locale } = useLanguage();
  const metrics = [
    { icon: "cash-outline" as const, label: "الإيراد المؤكد", value: `${data.metrics.revenue.toLocaleString(locale)} ر.س` },
    { icon: "people-outline" as const, label: "الطلاب النشطون", value: String(data.metrics.activeStudents) },
    { icon: "school-outline" as const, label: "الجهات", value: String(data.metrics.institutions) },
    { icon: "library-outline" as const, label: "المواد المنشورة", value: String(data.metrics.publishedCourses) },
  ];
  return <>
    <View style={styles.metricGrid}>{metrics.map((item) => <Card key={item.label} style={styles.metric}><Ionicons name={item.icon} size={24} color={colors.primary} /><Text style={[styles.metricValue, { color: colors.text }]}>{item.value}</Text><Text style={[styles.metricLabel, { color: colors.textSoft }]}>{item.label}</Text></Card>)}</View>
    <SectionTitle title="طابور العمل" />
    <Card><Queue label="طلبات مواد مفتوحة" value={data.metrics.openRequests} colors={colors} /><Queue label="تذاكر دعم مفتوحة" value={data.metrics.openTickets} colors={colors} /><Queue label="تقييمات تنتظر المراجعة" value={data.metrics.pendingReviews} colors={colors} /></Card>
    <SectionTitle title="جاهزية الخدمات" />
    <Card>{Object.entries(data.services).map(([key, ready]) => <View key={key} style={styles.service}><Ionicons name={ready ? "checkmark-circle" : "alert-circle"} size={21} color={ready ? colors.success : colors.warning} /><Text style={[styles.serviceText, { color: colors.text }]}>{({ assistant: "المساعد الذكي", payments: "بوابة Tap للدفع", email: "استعادة الحساب", videoSigning: "الفيديو الخاص" } as Record<string, string>)[key] || "خدمة إضافية"}</Text><Text style={{ color: ready ? colors.success : colors.warning, fontSize: 9, fontWeight: "900" }}>{ready ? "جاهز" : "يحتاج إعداد"}</Text></View>)}</Card>
  </>;
}

function Queue({ label, value, colors }: { label: string; value: number; colors: Colors }) {
  return <View style={[styles.queue, { borderBottomColor: colors.border }]}><Text style={[styles.queueValue, { color: colors.primary }]}>{value}</Text><Text style={[styles.queueLabel, { color: colors.text }]}>{label}</Text></View>;
}

function StaffAdmin({ data, colors, mutate, refresh, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; refresh: () => Promise<void>; onDelete: DeleteEntity }) {
  const [form, setForm] = useState({ email: "", fullName: "", phone: "", password: "", role: "supervisor", universitySlug: "", specialty: "" });
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const staff = data.users.filter((row) => row.role !== "student");
  const create = async () => {
    setBusy(true); setFeedback("");
    try {
      const response = await api("/api/admin/staff", { method: "POST", body: jsonBody(form) });
      void response;
      setForm({ email: "", fullName: "", phone: "", password: "", role: "supervisor", universitySlug: "", specialty: "" });
      setFeedback("تم إنشاء حساب الموظف وربطه بالبيانات");
      await refresh();
    } catch (reason) { setFeedback(reason instanceof ApiError ? reason.message : "تعذر إنشاء حساب الموظف"); }
    finally { setBusy(false); }
  };
  return <><SectionTitle title="إنشاء موظف وصلاحياته" subtitle="الحساب الجديد يبدأ بصلاحيات محددة ولا يصل إلى الإدارة إلا بدور مصرح" /><Card><Field label="البريد الإلكتروني" value={form.email} onChangeText={(value) => setForm({ ...form, email: value })} keyboardType="email-address" autoCapitalize="none" /><Field label="الاسم الكامل" value={form.fullName} onChangeText={(value) => setForm({ ...form, fullName: value })} /><Field label="الجوال السعودي" value={form.phone} onChangeText={(value) => setForm({ ...form, phone: value })} keyboardType="phone-pad" /><Field label="كلمة المرور المؤقتة" value={form.password} onChangeText={(value) => setForm({ ...form, password: value })} secureTextEntry autoCapitalize="none" /><ChoiceRow values={["supervisor", "admin"]} selected={form.role} onSelect={(value) => setForm({ ...form, role: value })} colors={colors} labels={roleLabels} /><SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key })} /><SearchPicker label="التخصص" value={form.specialty} placeholder="اختر التخصص" items={data.specialties.map((row) => ({ key: row.name, label: row.name }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />{feedback ? <Text style={[styles.message, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text> : null}<AppButton title="إنشاء الحساب" icon="person-add-outline" loading={busy} disabled={form.email.trim().length < 5 || form.fullName.trim().length < 5 || form.phone.trim().length < 8 || form.password.length < 10 || !form.universitySlug || !form.specialty} onPress={create} /></Card><SectionTitle title="الموظفون الحاليون" subtitle={`${staff.length} حساب إداري أو إشرافي`} />{staff.length ? staff.map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{roleLabels[row.role] || "صلاحية غير معروفة"}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.fullName}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.email} · {accountStatusLabels[row.status] || "حالة حساب غير معروفة"}</Text><View style={styles.actionRow}><AppButton full={false} title={row.status === "active" ? "تعليق" : "تنشيط"} variant={row.status === "active" ? "danger" : "soft"} onPress={() => void mutate({ action: "updateUser", id: row.id, role: row.role, status: row.status === "active" ? "suspended" : "active" })} /><AppButton full={false} title="تحويل لمشرف" variant="ghost" onPress={() => void mutate({ action: "updateUser", id: row.id, role: row.role === "admin" ? "supervisor" : "admin", status: row.status })} /><AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => onDelete("user", row.id, row.fullName, "سيُحذف حساب الموظف وتوابعه غير المالية، ولن يُحذف الحساب الحالي أو آخر مدير أو أي حساب له تاريخ مالي.")} /></View></Card>) : <EmptyState title="لا يوجد موظفون" text="أنشئ أول مشرف أو مدير من النموذج أعلاه." />}</>;
}

function Users({ data, colors, mutate, onDelete, onOpenProfile }: { data: AdminData; colors: Colors; mutate: Mutate; onDelete: DeleteEntity; onOpenProfile: (email: string) => void }) {
  const { locale } = useLanguage();
  const supervisors = data.users.filter((row) => row.role === "supervisor");
  const [query, setQuery] = useState("");
  const [deviceLimit, setDeviceLimit] = useState(String(data.settings.max_student_devices || data.deviceLimit || 2));
  const [supervisorId, setSupervisorId] = useState("");
  const [institutionSlug, setInstitutionSlug] = useState("");
  const [specialty, setSpecialty] = useState("");
  const normalized = query.trim().toLowerCase();
  const visibleUsers = data.users.filter((row) => !normalized || `${row.fullName} ${row.email} ${row.phone || ""} ${row.specialty || ""}`.toLowerCase().includes(normalized));
  const programs = useQuery({ queryKey: ["admin-programs", institutionSlug], queryFn: () => api<{ programs: { name: string; degree: string; area: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(institutionSlug)}`), enabled: Boolean(institutionSlug) });
  return <>
    <SectionTitle title="أجهزة الطلاب" subtitle={`الافتراضي ${data.deviceLimit || 2} جهاز لكل طالب عبر التطبيق والويب`} />
    <Card>
      <Field label="الحد الأقصى لأجهزة الطالب" value={deviceLimit} onChangeText={(value) => setDeviceLimit(value.replace(/[^0-9]/g, "").slice(0, 2))} keyboardType="number-pad" />
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>الجهاز نفسه يجدد جلسته ولا يُحسب مرتين. إذا وصل الطالب للحد المحدد يُرفض أي جهاز جديد حتى تسجيل خروج جهاز قائم.</Text>
      <AppButton title="حفظ حد الأجهزة" icon="phone-portrait-outline" disabled={Number(deviceLimit) < 1 || Number(deviceLimit) > 10} onPress={() => mutate({ action: "saveSettings", values: { max_student_devices: deviceLimit } }, "تم تحديث حد أجهزة الطلاب")} />
    </Card>
    <SectionTitle title="الحسابات والصلاحيات" subtitle={`${data.users.length} حسابًا · بحث سريع وإدارة الأجهزة`} />
    <SearchBox value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو البريد أو الجوال أو التخصص" />
    {visibleUsers.length ? visibleUsers.map((row) => <Card key={row.id} style={styles.dataCard}>
      <View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{roleLabels[row.role] || "صلاحية غير معروفة"}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.fullName}</Text></View>
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.email} · {row.phone || "بدون جوال"}</Text>
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.specialty || "بدون تخصص"} · {row.academicLevel || "المستوى غير محدد"} · {row.profileCompletedAt && row.academicLevel ? "ملف مكتمل" : "ملف ناقص"} · {accountStatusLabels[row.status] || "حالة حساب غير معروفة"}</Text>
      {row.role === "student" ? <View style={[styles.deviceBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={[styles.deviceTitle, { color: colors.text }]}>الأجهزة النشطة: {row.deviceCount || 0} / {data.deviceLimit || 2}</Text><AppButton full={false} title="ملف الطالب 360" icon="person-circle-outline" variant="ghost" onPress={() => onOpenProfile(row.email)} />
        {(row.sessions || []).length ? row.sessions!.map((session) => <View key={session.id} style={[styles.deviceRow, { borderColor: colors.border }]}>
          <View style={styles.deviceCopy}><Text style={[styles.deviceName, { color: colors.text }]}>{session.deviceLabel || (session.platform === "mobile" ? "تطبيق مراس" : "متصفح ويب")}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{session.platform === "mobile" ? "تطبيق" : "ويب"} · آخر نشاط {new Date(session.lastSeenAt || session.createdAt).toLocaleString(locale)}</Text></View>
          <AppButton full={false} title="تسجيل خروج" variant="danger" onPress={() => mutate({ action: "revokeUserSession", sessionId: session.id }, "تم تسجيل خروج الجهاز")} />
        </View>) : <Text style={[styles.dataMeta, { color: colors.textSoft }]}>لا توجد جلسات نشطة.</Text>}
      </View> : null}
      <View style={styles.actionRow}><AppButton full={false} title={row.status === "active" ? "تعليق" : "تنشيط"} variant={row.status === "active" ? "danger" : "soft"} onPress={() => mutate({ action: "updateUser", id: row.id, role: row.role, status: row.status === "active" ? "suspended" : "active" })} /><AppButton full={false} title={row.role === "student" ? "ترقية لمشرف" : "إعادة لطالب"} variant="soft" onPress={() => mutate({ action: "updateUser", id: row.id, status: row.status, role: row.role === "student" ? "supervisor" : "student" })} /><AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => onDelete("user", row.id, row.fullName, "سيُحذف الحساب وبياناته غير المالية وملفات الدعم، ويُمنع إذا وُجد طلب أو فاتورة أو حدث دفع.")} /></View>
    </Card>) : <EmptyState title="لا توجد نتائج" text="جرّب اسمًا أو بريدًا أو رقم جوال مختلفًا." />}
    <SectionTitle title="نطاقات المشرفين" subtitle="يربط المشرف بطلبات ومحتوى الجامعة والتخصص المحددين" />
    <Card>
      <SearchPicker label="المشرف" value={supervisorId} placeholder="اختر حساب مشرف" items={supervisors.map((row) => ({ key: String(row.id), label: row.fullName, detail: row.email }))} onSelect={(item) => setSupervisorId(item.key)} />
      <SearchPicker label="الجامعة أو الكلية" value={institutionSlug} placeholder="اختر الجهة" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => { setInstitutionSlug(item.key); setSpecialty(""); }} />
      <SearchPicker label="التخصص" value={specialty} placeholder={programs.isFetching ? "جارٍ تحميل التخصصات..." : "اختر تخصص الجهة"} disabled={!institutionSlug || programs.isFetching} items={(programs.data?.programs || []).map((row) => ({ key: row.name, label: row.name, detail: `${row.degree} · ${row.area}` }))} onSelect={(item) => setSpecialty(item.key)} />
      <AppButton title="حفظ نطاق الإشراف" icon="git-network-outline" disabled={!supervisorId || !institutionSlug || !specialty} onPress={() => mutate({ action: "saveSupervisorAssignment", supervisorId: Number(supervisorId), institutionSlug, specialty, active: true }, "تم ربط المشرف بالنطاق")} />
    </Card>
    {data.supervisorAssignments.map((assignment) => { const supervisor = data.users.find((row) => row.id === assignment.supervisorId); const institution = data.institutions.find((row) => row.slug === assignment.institutionSlug); return <Card key={assignment.id} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{supervisor?.fullName || `مشرف #${assignment.supervisorId}`}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{institution?.name || assignment.institutionSlug} · {assignment.specialty}</Text><View style={styles.actionRow}><AppButton full={false} title={assignment.active ? "تعطيل النطاق" : "تفعيل النطاق"} variant={assignment.active ? "danger" : "soft"} onPress={() => mutate({ action: "saveSupervisorAssignment", ...assignment, active: !assignment.active })} /><AppButton full={false} title="حذف التكليف" variant="danger" onPress={() => onDelete("supervisor_assignment", assignment.id, "تكليف المشرف", "سيُحذف نطاق التكليف فقط، ولن يُحذف حساب المشرف.")} /></View></Card>; })}
  </>;
}

function AdminRequestStatus({ status, colors }: { status: string; colors: Colors }) { const { language } = useLanguage(); return <Text style={{ color: status === "available" ? colors.success : colors.primary, fontSize: 9, fontWeight: "900" }}>{requestStatusLabels[language][status] || "حالة طلب غير معروفة"}</Text>; }

function Requests({ rows, courses, colors, mutate, onDelete }: { rows: AdminData["requests"]; courses: AdminData["courses"]; colors: Colors; mutate: Mutate; onDelete: DeleteEntity }) {
  const { language, direction, rowDirection } = useLanguage();
  const [selectedCourses, setSelectedCourses] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");
  const visibleRows = rows.filter((row) => !query.trim() || `${row.courseName} ${row.student?.fullName || ""} ${row.student?.email || ""} ${row.university} ${row.specialty}`.toLowerCase().includes(query.trim().toLowerCase()));
  const downloadProtected = async (path: string, name: string, mimeType?: string, saveToFiles = false) => {
    try {
      const result = await downloadProtectedFile({ path, fileName: name, mimeType, saveToFiles });
      if (result.action === "saved") Alert.alert(language === "ar" ? "اكتمل التنزيل" : "Download complete", language === "ar" ? "تم حفظ الملف في المجلد الذي اخترته." : "The file was saved in the folder you selected.");
      else if (result.action === "stored") Alert.alert(language === "ar" ? "اكتمل التنزيل" : "Download complete", language === "ar" ? "تم تنزيل الملف وحفظه داخل مساحة تطبيق مراس." : "The file was downloaded to Meras app storage.");
    } catch (reason) {
      Alert.alert(
        language === "ar" ? "تعذر التنزيل" : "Download failed",
        language === "ar" && reason instanceof ApiError ? reason.message : language === "ar" ? "تعذر تنزيل الملف. تحقق من الاتصال وحاول مرة أخرى." : "The file could not be downloaded. Check your connection and try again.",
      );
    }
  };
  const openFile = async (file: { id: number; originalName: string; contentType: string }) => downloadProtected(`/api/supervisor/request-files/${file.id}`, `request-file-${file.id}-${file.originalName}`, file.contentType);
  const downloadAll = async (row: AdminData["requests"][number]) => downloadProtected(`/api/admin/course-requests/${row.id}/download`, `request-${row.id}-files.zip`, "application/zip", true);
  return <><SectionTitle title="طلبات المواد" subtitle="ملفات السلايدات والرابط منفصلان بوضوح ويمكن تنزيل كل المرفقات دفعة واحدة" /><SearchBox value={query} onChangeText={setQuery} placeholder="ابحث باسم المادة أو الطالب أو الجامعة" />{visibleRows.length ? visibleRows.map((row) => { const selected = selectedCourses[row.id] || row.preparedCourseSlug || ""; const options = courses.filter((course) => course.university === row.university && course.specialty === row.specialty); return <Card key={row.id} style={styles.dataCard}>
    <View style={styles.dataHead}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.courseName}</Text><AdminRequestStatus status={row.status} colors={colors} /></View>
    <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.student?.fullName || (row.userId ? `طالب #${row.userId}` : "طالب غير مرتبط")} · {row.student?.email || "—"}</Text>
    <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.student?.phone || "بدون جوال"} · {row.university} · {row.specialty} · {row.student?.academicLevel || "المستوى غير محدد"}</Text>
    {row.courseUrl ? <Pressable onPress={() => void Linking.openURL(row.courseUrl!)} style={[styles.requestLink, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Ionicons name="link-outline" size={17} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.deviceName, { color: colors.text }]}>رابط المادة المرفوع من الطالب</Text><Text numberOfLines={2} style={[styles.dataMeta, { color: colors.primary }]}>{row.courseUrl}</Text></View></Pressable> : null}
    <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.attachmentsCount} مرفقات</Text>
    {row.files?.length ? <View style={styles.requestFiles}><AppButton title="تحميل كل المرفقات ZIP" icon="archive-outline" variant="soft" onPress={() => void downloadAll(row)} />{row.files.map((file) => <Pressable key={file.id} onPress={() => void openFile(file)} style={styles.requestFile}><Ionicons name="download-outline" size={15} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.primary, fontSize: 9, flex: 1 }}>{file.originalName} · {(file.sizeBytes / 1024 / 1024).toFixed(1)}MB</Text></Pressable>)}</View> : null}
    <SearchPicker label="المادة بعد التجهيز" value={selected} placeholder="اختر مادة منشورة مطابقة" items={options.map((course) => ({ key: course.slug, label: course.title, detail: course.specialty }))} onSelect={(item) => setSelectedCourses((current) => ({ ...current, [row.id]: item.key }))} />
    <AppButton title="تم تجهيز الطلب وإشعار الطالب" icon="checkmark-done-outline" disabled={!selected} onPress={() => void mutate({ action: "prepareRequest", id: row.id, courseSlug: selected }, "تم تجهيز الطلب وإرسال الإشعار")}/>
    <AppButton title="حذف الطلب وملفاته" icon="trash-outline" variant="danger" onPress={() => onDelete("course_request", row.id, row.courseName, "سيُحذف الطلب وجميع ملفاته من التخزين نهائيًا.")} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.statuses, { direction, flexDirection: rowDirection }]}>{requestStatuses.map((status) => <Pressable key={status} onPress={() => mutate({ action: "updateRequest", id: row.id, status, courseSlug: status === "available" ? selected : undefined })} style={[styles.status, { backgroundColor: row.status === status ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: row.status === status ? "#FFF" : colors.textSoft, fontSize: 8 }}>{requestStatusLabels[language][status] || "حالة طلب غير معروفة"}</Text></Pressable>)}</ScrollView>
  </Card>; }) : <EmptyState title="لا توجد نتائج" text="لا توجد طلبات مطابقة لبحثك." />}</>;
}

function Support({ rows, colors, mutate, refresh, onDelete }: { rows: AdminData["tickets"]; colors: Colors; mutate: Mutate; refresh: () => Promise<void>; onDelete: DeleteEntity }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const selected = rows.find((row) => row.id === selectedId) || null;
  const statusLabel: Record<string, string> = { new: "جديدة", open: "مفتوحة", waiting: "بانتظار الطالب", resolved: "محلولة", closed: "مغلقة" };
  const removeTicket = (row: AdminData["tickets"][number]) => onDelete("support_ticket", row.id, row.title, "سيُحذف عنوان التذكرة والمحادثة وجميع المرفقات من قاعدة البيانات والتخزين نهائيًا.");

  if (!selected) return <>
    <SectionTitle title="محادثات الدعم" subtitle="افتح بطاقة الطالب للدخول إلى الشات والرد بالرسائل والصور والملفات والصوت" />
    <View>{rows.map((row) => {
      const last = row.replies?.[row.replies.length - 1];
      return <Pressable key={row.id} onPress={() => { setFeedback(""); setSelectedId(row.id); }}>
        <Card style={styles.dataCard}>
          <View style={styles.dataHead}><Text style={[styles.role, { color: ["closed", "resolved"].includes(row.status) ? colors.success : colors.primary }]}>{statusLabel[row.status] || "حالة غير معروفة"}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.title}</Text></View>
          <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.ticketNumber} · {row.student?.fullName || row.userEmail || "—"}</Text>
          <Text numberOfLines={2} style={[styles.ticketBody, { color: colors.textSoft }]}>{last?.body || last?.files?.[0]?.originalName || row.message}</Text>
          <Text style={[styles.dataMeta, { color: colors.primary }]}>{row.replies?.length || 0} رسالة · اضغط لفتح المحادثة</Text>
        </Card>
      </Pressable>;
    })}</View>
  </>;

  const supportTicket: SupportTicket = {
    ...selected,
    category: (selected as { category?: string }).category || "support",
    replies: (selected.replies || []).map((reply) => ({ ...reply, files: reply.files || [] })),
  };

  return <>
    <View style={styles.actionRow}>
      <AppButton full={false} title="كل التذاكر" variant="ghost" icon="arrow-back-outline" onPress={() => setSelectedId(null)} />
      <AppButton full={false} title="حذف التذكرة" variant="danger" icon="trash-outline" onPress={() => removeTicket(selected)} />
    </View>
    <Card style={styles.dataCard}>
      <View style={styles.dataHead}><Text style={[styles.role, { color: ["closed", "resolved"].includes(selected.status) ? colors.success : colors.primary }]}>{statusLabel[selected.status] || "حالة غير معروفة"}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{selected.title}</Text></View>
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>{selected.ticketNumber} · {selected.student?.fullName || selected.userEmail || "—"} · {selected.student?.phone || "بدون جوال"}</Text>
      <ChoiceRow values={["open", "waiting", "resolved", "closed"]} selected={selected.status} onSelect={(status) => void mutate({ action: "updateTicket", id: selected.id, status, internal: false }, "تم تحديث حالة التذكرة").then(refresh)} colors={colors} labels={statusLabel} />
      <React.Suspense fallback={<LoadingState label="جارٍ تحميل محادثة الدعم..." />}>
        <LazySupportChat ticket={supportTicket} viewer="manager" onReload={refresh} onFeedback={setFeedback} />
      </React.Suspense>
      {!!feedback && <Text style={[styles.message, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text>}
    </Card>
  </>;
}

function CatalogAdmin({ data, colors, mutate, refresh, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; refresh: () => Promise<void>; onDelete: DeleteEntity }) {
  const { t } = useLanguage();
  const [institution, setInstitution] = useState({ slug: "", name: "", nameEn: "", region: "", type: "حكومية", domain: "", logoUrl: "" });
  const [logo, setLogo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [specialty, setSpecialty] = useState({ slug: "", name: "", description: "", institutionSlug: "" });
  const [cover, setCover] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [video, setVideo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [videoLessonId, setVideoLessonId] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [unitForm, setUnitForm] = useState({ courseSlug: "", title: "", description: "" });
  const [lessonForm, setLessonForm] = useState({ unitId: "", id: "", title: "", description: "", freePreview: false });
  const unitCourse = data.courses.find((course) => course.slug === unitForm.courseSlug);
  const lessonUnit = data.units.find((unit) => String(unit.id) === lessonForm.unitId);
  const saveUnit = async () => { const ok = await mutate({ action: "saveUnit", courseSlug: unitForm.courseSlug, title: unitForm.title.trim(), description: unitForm.description.trim(), position: data.units.filter((unit) => unit.courseSlug === unitForm.courseSlug).length, status: "published" }, "تمت إضافة الوحدة"); if (ok) setUnitForm({ ...unitForm, title: "", description: "" }); };
  const saveLesson = async () => { if (!lessonUnit) return; const ok = await mutate({ action: "saveLesson", id: lessonForm.id.trim() || undefined, courseSlug: lessonUnit.courseSlug, unitId: lessonUnit.id, title: lessonForm.title.trim(), description: lessonForm.description.trim(), durationSeconds: 0, freePreview: lessonForm.freePreview, position: data.lessons.filter((lesson) => lesson.unitId === lessonUnit.id).length, status: "published" }, "تمت إضافة الدرس"); if (ok) setLessonForm({ ...lessonForm, id: "", title: "", description: "", freePreview: false }); };
  const [course, setCourse] = useState({ slug: "", institutionSlug: "", specialtySlug: "", title: "", titleEn: "", code: "", description: "", coverImageUrl: "", price: "", oldPrice: "", accessLabel: "90 يومًا" });
  const saveInstitution = async () => {
    const institutionKey = institution.slug || makeInstitutionSlug(institution.name);
    const saved = await mutate({ action: "saveInstitution", ...institution, slug: institutionKey, status: "published", featured: false }, "تم حفظ الجهة التعليمية");
    if (!saved || !logo) return;
    const form = new FormData(); form.append("slug", institutionKey); form.append("file", { uri: logo.uri, name: logo.name, type: assetMimeType(logo, "image/png") } as unknown as Blob);
    try { await api("/api/admin/logos", { method: "POST", body: form, timeoutMs: 120_000 }); setLogo(null); await refresh(); }
    catch { /* The institution remains saved and a remote logo can be added later. */ }
  };
  const pickLogo = async () => { const result = await DocumentPicker.getDocumentAsync({ type: "image/*", multiple: false, copyToCacheDirectory: true }); if (!result.canceled) setLogo(result.assets[0] || null); };
  const pickCover = async () => { const result = await DocumentPicker.getDocumentAsync({ type: "image/*", multiple: false, copyToCacheDirectory: true }); if (!result.canceled) setCover(result.assets[0] || null); };
  const pickVideo = async () => { const result = await DocumentPicker.getDocumentAsync({ type: "video/*", multiple: false, copyToCacheDirectory: true }); if (!result.canceled) setVideo(result.assets[0] || null); };
  const saveCourse = async () => {
    const specialtyName = data.specialties.find((row) => row.slug === course.specialtySlug)?.name || course.specialtySlug;
    const courseKey = course.slug || makeCourseSlug(course.institutionSlug, specialtyName, course.title);
    const saved = await mutate({ action: "saveCourse", ...course, slug: courseKey, price: Number(course.price), oldPrice: Number(course.oldPrice), status: "draft", featured: false, coverTheme: "blue-violet" }, "تم حفظ المادة كمسودة");
    if (!saved || !cover) return;
    const form = new FormData(); form.append("courseSlug", courseKey); form.append("file", { uri: cover.uri, name: cover.name, type: assetMimeType(cover, "image/jpeg") } as unknown as Blob);
    try { await api("/api/admin/covers", { method: "POST", body: form, timeoutMs: 120_000 }); setCover(null); await refresh(); } catch { /* يبقى السجل محفوظًا ويمكن إعادة الرفع لاحقًا. */ }
  };
  const syncCatalog = async () => { const ok = await mutate({ action: "syncCatalogTemplates", templatePrice: 49 }, "تم تجهيز الجامعات والتخصصات والمواد والوحدات"); if (ok) await refresh(); };
  const uploadVideo = async () => {
    const lesson = data.lessons.find((item) => item.id === videoLessonId);
    if (!video || !lesson) return;
    setVideoBusy(true);
    try {
      const token = getApiToken();
      const durationSeconds = await readLocalVideoDuration(video.uri);
      const result = await FileSystem.uploadAsync(absoluteUrl("/api/admin/videos"), video.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Accept: "application/json",
          "Content-Type": assetMimeType(video, "video/mp4"),
          "x-meras-client": "mobile-v1",
          "x-meras-platform": Platform.OS,
          "x-meras-course": lesson.courseSlug,
          "x-meras-lesson": lesson.id,
          ...(durationSeconds ? { "x-meras-duration-seconds": String(durationSeconds) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const payload = JSON.parse(result.body || "{}") as { error?: string; asset?: { durationSeconds?: number | null }; processing?: { message?: string } };
      if (result.status < 200 || result.status >= 300) throw new Error(payload.error || "تعذر رفع الفيديو");
      setVideo(null); setVideoLessonId(""); await refresh();
      const durationMessage = payload.asset?.durationSeconds ? `حُسبت المدة تلقائيًا: ${Math.floor(payload.asset.durationSeconds / 60)}:${String(payload.asset.durationSeconds % 60).padStart(2, "0")}` : "تم ربط الفيديو بالدرس.";
      Alert.alert(t("تم رفع الفيديو"), t(`${durationMessage}\n${payload.processing?.message || "بدأ تجهيز الجودات المتعددة تلقائيًا."}`));
    } catch (reason) {
      Alert.alert(t("تعذر رفع الفيديو"), t(reason instanceof Error ? reason.message : "تحقق من الاتصال وحاول مرة أخرى"));
    } finally { setVideoBusy(false); }
  };
  return <>
    <SectionTitle title="طريقة مشاهدة المحتوى" subtitle="يُفرض الاختيار من خادم البث، بينما يبقى الدرس التجريبي متاحًا في الويب والتطبيق" />
    <Card><ChoiceRow values={["both", "app_only", "web_only"]} selected={data.settings.content_view_mode || "both"} onSelect={(value) => void mutate({ action: "saveSettings", values: { content_view_mode: value } }, "تم تحديث طريقة مشاهدة المحتوى")} colors={colors} labels={{ both: "الويب والتطبيق", app_only: "التطبيق فقط", web_only: "الويب فقط" }} /></Card>
    <SectionTitle title="رفع فيديو درس" subtitle="يحسب الخادم مدة MP4/MOV/WebM/MKV/AVI تلقائيًا ويحدّث مدة الدرس" />
    <Card><SearchPicker label="الدرس" value={videoLessonId} placeholder="اختر الدرس" items={data.lessons.map((item) => ({ key: item.id, label: item.title, detail: item.courseSlug }))} onSelect={(item) => setVideoLessonId(item.key)} /><AppButton title={video ? `الفيديو: ${video.name}` : "اختيار ملف الفيديو"} variant="soft" icon="videocam-outline" onPress={pickVideo} /><View style={styles.spacer} /><AppButton title="رفع وربط الفيديو" icon="cloud-upload-outline" loading={videoBusy} disabled={!video || !videoLessonId} onPress={() => void uploadVideo()} /></Card>
    <SectionTitle title="تجهيز الكتالوج الكامل" subtitle="ينشئ السجلات الإدارية والوحدات والدروس التجريبية تلقائيًا دون استبدال ما عدّلته يدويًا" />
    <Card><Text style={[styles.dataMeta, { color: colors.textSoft }]}>ستظهر المواد قابلة للاشتراك بسعر قالب 49 ر.س، ويمكنك تعديل السعر والمادة من الإدارة ورفع الفيديوهات لاحقًا لكل درس.</Text><AppButton title="تجهيز كل الجامعات والتخصصات والمواد" icon="sparkles-outline" onPress={() => void syncCatalog()} /></Card>
    <SectionTitle title="إضافة جامعة أو كلية" subtitle="يمكن رفع شعار شفاف أو استخدام رابط HTTPS رسمي" />
    <Card><Field label="المعرّف (اختياري — يُنشأ تلقائيًا)" value={institution.slug} onChangeText={(value) => setInstitution({ ...institution, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="university-slug" autoCapitalize="none" /><Field label="الاسم العربي" value={institution.name} onChangeText={(value) => setInstitution({ ...institution, name: value })} /><Field label="الاسم الإنجليزي" value={institution.nameEn} onChangeText={(value) => setInstitution({ ...institution, nameEn: value })} /><Field label="المنطقة" value={institution.region} onChangeText={(value) => setInstitution({ ...institution, region: value })} /><ChoiceRow values={["حكومية", "أهلية", "كلية", "تقنية"]} selected={institution.type} onSelect={(value) => setInstitution({ ...institution, type: value })} colors={colors} /><Field label="النطاق الرسمي" value={institution.domain} onChangeText={(value) => setInstitution({ ...institution, domain: value })} placeholder="university.edu.sa" autoCapitalize="none" /><Field label="رابط الشعار الرسمي — اختياري" value={institution.logoUrl} onChangeText={(value) => setInstitution({ ...institution, logoUrl: value })} placeholder="https://.../logo.svg" autoCapitalize="none" /><AppButton title={logo ? `الشعار: ${logo.name}` : "رفع ملف شعار"} variant="soft" icon="image-outline" onPress={pickLogo} /><View style={styles.spacer} /><AppButton title="حفظ الجهة" icon="save-outline" disabled={institution.name.length < 3 || !institution.region} onPress={saveInstitution} /></Card>
    <SectionTitle title="إضافة تخصص وربطه" />
    <Card><Field label="المعرّف (اختياري — يُنشأ تلقائيًا)" value={specialty.slug} onChangeText={(value) => setSpecialty({ ...specialty, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="computer-science" /><Field label="اسم التخصص" value={specialty.name} onChangeText={(value) => setSpecialty({ ...specialty, name: value })} /><Field label="وصف مختصر" value={specialty.description} onChangeText={(value) => setSpecialty({ ...specialty, description: value })} /><SearchPicker label="ربطه بجهة" value={specialty.institutionSlug} placeholder="اختر الجامعة أو الكلية" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => setSpecialty({ ...specialty, institutionSlug: item.key })} /><AppButton title="حفظ التخصص" disabled={specialty.name.length < 2 || !specialty.institutionSlug} onPress={() => mutate({ action: "saveSpecialty", ...specialty, status: "published" }, "تم حفظ التخصص وربطه")} /></Card>
    <SectionTitle title="إضافة مادة" subtitle="ترتبط بجهة وتخصص إداري فعليين" />
    <Card><Field label="المعرّف (اختياري — يُنشأ تلقائيًا)" value={course.slug} onChangeText={(value) => setCourse({ ...course, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="course-slug" /><Field label="اسم المادة" value={course.title} onChangeText={(value) => setCourse({ ...course, title: value })} /><Field label="الاسم الإنجليزي" value={course.titleEn} onChangeText={(value) => setCourse({ ...course, titleEn: value })} /><Field label="رمز المادة" value={course.code} onChangeText={(value) => setCourse({ ...course, code: value })} /><SearchPicker label="الجهة" value={course.institutionSlug} placeholder="اختر الجهة" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => setCourse({ ...course, institutionSlug: item.key })} /><SearchPicker label="التخصص" value={course.specialtySlug} placeholder="اختر التخصص" items={data.specialties.map((row) => ({ key: row.slug, label: row.name }))} onSelect={(item) => setCourse({ ...course, specialtySlug: item.key })} /><TextInput value={course.description} onChangeText={(value) => setCourse({ ...course, description: value })} placeholder="وصف المادة" placeholderTextColor={colors.textSoft} multiline style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /><Field label="رابط صورة الغلاف HTTPS — اختياري" value={course.coverImageUrl} onChangeText={(value) => setCourse({ ...course, coverImageUrl: value })} placeholder="https://..." autoCapitalize="none" /><AppButton title={cover ? `الغلاف: ${cover.name}` : "رفع ملف غلاف المادة"} variant="soft" icon="image-outline" onPress={pickCover} />{cover || course.coverImageUrl ? <Image source={{ uri: cover?.uri || absoluteUrl(course.coverImageUrl) }} style={styles.coverPreview} resizeMode="cover" /> : null}<Field label="السعر" value={course.price} onChangeText={(value) => setCourse({ ...course, price: value })} keyboardType="decimal-pad" /><Field label="السعر السابق — اختياري" value={course.oldPrice} onChangeText={(value) => setCourse({ ...course, oldPrice: value })} keyboardType="decimal-pad" /><Field label="مدة الوصول" value={course.accessLabel} onChangeText={(value) => setCourse({ ...course, accessLabel: value })} /><AppButton title="حفظ المادة" disabled={course.title.length < 3 || !course.institutionSlug || !course.specialtySlug || !course.price} onPress={() => void saveCourse()} /></Card>
    <SectionTitle title="الجهات الحالية" subtitle="نشر وإخفاء وتمييز الصفحات" />
    {data.institutions.slice(0, 25).map((row) => <Card key={row.slug} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.name}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.region} · {institutionTypeLabels[row.type] || "جهة تعليمية"} · {publicationStatusLabels[row.status] || "حالة نشر غير معروفة"}</Text><View style={styles.actionRow}><AppButton full={false} title={row.featured ? "إلغاء التمييز" : "تمييز"} variant="soft" onPress={() => mutate(institutionPayload(row, row.status, !row.featured))} /><AppButton full={false} title={row.status === "published" ? "إخفاء" : "نشر"} variant="ghost" onPress={() => mutate(institutionPayload(row, row.status === "published" ? "hidden" : "published", Boolean(row.featured)))} /><AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => onDelete("institution", row.slug, row.name, "سيُحذف الشعار والمواد والمحتوى التابع، ويُمنع إذا وُجد طلاب أو طلبات أو نشاط مالي مرتبط.")} /></View></Card>)}
    <SectionTitle title="التخصصات الحالية" />
    {data.specialties.slice(0, 50).map((row) => <Card key={row.slug} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.name}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>المعرّف: {row.slug} · {publicationStatusLabels[row.status] || "حالة نشر غير معروفة"}</Text><AppButton full={false} title="حذف التخصص" variant="danger" onPress={() => onDelete("specialty", row.slug, row.name, "سيُحذف ربط التخصص والمواد التابعة، ويُمنع إذا كان مرتبطًا بطلاب أو سجل مالي.")} /></Card>)}
    <SectionTitle title="المواد الحالية" />
    {data.courses.filter((row) => row.specialtySlug).slice(0, 25).map((row) => <Card key={row.slug} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.title}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.university} · {row.price} ر.س · {publicationStatusLabels[row.status] || "حالة نشر غير معروفة"}</Text><View style={styles.actionRow}><AppButton full={false} title={row.featured ? "إلغاء التمييز" : "تمييز"} variant="soft" onPress={() => mutate(coursePayload(row, row.status, !row.featured))} /><AppButton full={false} title={row.status === "published" ? "إخفاء" : "نشر"} variant="ghost" onPress={() => mutate(coursePayload(row, row.status === "published" ? "hidden" : "published", Boolean(row.featured)))} /><AppButton full={false} title="حذف نهائي" variant="danger" onPress={() => onDelete("course", row.slug, row.title, "سيُحذف الغلاف والوحدات والدروس والفيديوهات والتقدم والمفضلة والسلة. يُمنع عند وجود تاريخ مالي أو وصول فعال.")} /></View></Card>)}
    <SectionTitle title="إضافة وحدة" subtitle="اختر المادة ثم أضف الوحدة؛ تُنشر مباشرة وتظهر للطالب مع دروسها" />
    <Card><SearchPicker label="المادة" value={unitForm.courseSlug} placeholder="اختر المادة" items={data.courses.map((course) => ({ key: course.slug, label: course.title, detail: course.university }))} onSelect={(item) => setUnitForm({ ...unitForm, courseSlug: item.key })} /><Field label="اسم الوحدة" value={unitForm.title} onChangeText={(title) => setUnitForm({ ...unitForm, title })} /><Field label="وصف الوحدة — اختياري" value={unitForm.description} onChangeText={(description) => setUnitForm({ ...unitForm, description })} /><AppButton title={unitCourse ? `إضافة وحدة إلى ${unitCourse.title}` : "إضافة الوحدة"} icon="add-circle-outline" disabled={!unitForm.courseSlug || unitForm.title.trim().length < 2} onPress={() => void saveUnit()} /></Card>
    <SectionTitle title="إضافة درس" subtitle="تُحسب مدة الدرس تلقائيًا من ملف الفيديو عند رفعه" />
    <Card><SearchPicker label="الوحدة" value={lessonForm.unitId} placeholder="اختر الوحدة" items={data.units.map((unit) => ({ key: String(unit.id), label: unit.title, detail: data.courses.find((course) => course.slug === unit.courseSlug)?.title || unit.courseSlug }))} onSelect={(item) => setLessonForm({ ...lessonForm, unitId: item.key })} /><Field label="عنوان الدرس" value={lessonForm.title} onChangeText={(title) => setLessonForm({ ...lessonForm, title })} /><Field label="معرّف الدرس — اختياري" value={lessonForm.id} autoCapitalize="none" inputDirection="ltr" onChangeText={(id) => setLessonForm({ ...lessonForm, id: id.replace(/[^A-Za-z0-9._-]/g, "") })} /><Field label="وصف الدرس — اختياري" value={lessonForm.description} onChangeText={(description) => setLessonForm({ ...lessonForm, description })} /><ChoiceRow values={["paid", "free"]} selected={lessonForm.freePreview ? "free" : "paid"} onSelect={(value) => setLessonForm({ ...lessonForm, freePreview: value === "free" })} colors={colors} labels={{ paid: "درس مدفوع", free: "درس تجريبي مجاني" }} /><AppButton title="حفظ الدرس" icon="add-circle-outline" disabled={!lessonUnit || lessonForm.title.trim().length < 2} onPress={() => void saveLesson()} /></Card>
    <SectionTitle title="المحتوى الحالي" subtitle="يمكن حذف الوحدة أو الدرس أو الفيديو كلٌّ على حدة" />
    {data.units.map((unit) => <Card key={`unit-${unit.id}`} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{unit.title}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{unit.courseSlug} · الوحدة #{unit.id}</Text><AppButton full={false} title="حذف الوحدة" variant="danger" onPress={() => onDelete("unit", unit.id, unit.title, "سيُحذف الدروس والفيديوهات والتقدم والملاحظات التابعة.")} /></Card>)}
    {data.lessons.map((lesson) => <Card key={`lesson-${lesson.id}`} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{lesson.title}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{lesson.courseSlug} · {lesson.description || "بدون وصف"}</Text><View style={styles.actionRow}><AppButton full={false} title="حذف الدرس" variant="danger" onPress={() => onDelete("lesson", lesson.id, lesson.title, "سيُحذف الفيديو والتقدم والملاحظات المرتبطة.")} />{data.videos.filter((video) => video.lessonId === lesson.id).map((video) => <AppButton key={video.id} full={false} title="حذف الفيديو" variant="danger" onPress={() => onDelete("video", video.id, `فيديو ${lesson.title}`, "سيُحذف ملف الفيديو الخاص ويُفصل عن الدرس.")} />)}</View></Card>)}
  </>;
}

function institutionPayload(row: AdminData["institutions"][number], status: string, featured: boolean) { return { action: "saveInstitution", slug: row.slug, name: row.name, nameEn: row.nameEn, region: row.region, type: row.type, domain: row.domain || "", logoUrl: row.logo || "", status, featured }; }
function coursePayload(row: AdminData["courses"][number], status: string, featured: boolean) { return { action: "saveCourse", slug: row.slug, institutionSlug: row.universitySlug, specialtySlug: row.specialtySlug, title: row.title, titleEn: row.titleEn, code: row.code || "", description: row.description, price: row.price, oldPrice: row.oldPrice || 0, accessLabel: row.access, status, featured, coverTheme: row.coverTheme }; }

function SubscriptionAdmin({ data, colors, mutate }: { data: AdminData; colors: Colors; mutate: Mutate }) {
  const [editing, setEditing] = useState<{ id: number; operation: "pause" | "revoke" } | null>(null);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [now] = useState(() => Date.now());
  const state = (row: AdminData["access"][number]) => row.revokedAt ? "ملغي" : row.suspendedAt ? "متوقف مؤقتًا" : row.expiresAt && Date.parse(row.expiresAt) <= now ? "منتهي" : "نشط";
  const rows = (data.access || []).filter((row) => {
    const student = data.users.find((item) => item.email === row.userEmail);
    const course = data.courses.find((item) => item.slug === row.courseSlug);
    return !query.trim() || `${student?.fullName || ""} ${row.userEmail} ${course?.title || row.courseSlug} ${state(row)}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const complete = async () => {
    if (!editing || reason.trim().length < 3) return;
    if (await mutate({ action: "updateAccess", id: editing.id, operation: editing.operation, reason: reason.trim(), operationKey: accessOperationKey(editing.id, editing.operation) }, editing.operation === "pause" ? "تم إيقاف الاشتراك مؤقتًا وإشعار الطالب" : "تم إلغاء الوصول وإشعار الطالب")) {
      setEditing(null); setReason("");
    }
  };
  return <>
    <SectionTitle title="الاشتراكات والوصول" subtitle="حالة كل مادة لكل طالب مع الإيقاف والاستئناف والتمديد" />
    <SearchBox value={query} onChangeText={setQuery} placeholder="ابحث باسم الطالب أو المادة أو الحالة" />
    {editing && <Card style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{editing.operation === "pause" ? "سبب الإيقاف المؤقت" : "سبب إلغاء الوصول"}</Text><Field label="السبب" value={reason} onChangeText={setReason} /><View style={styles.actionRow}><AppButton full={false} title="حفظ وإشعار الطالب" variant={editing.operation === "revoke" ? "danger" : "primary"} disabled={reason.trim().length < 3} onPress={complete} /><AppButton full={false} title="إلغاء" variant="soft" onPress={() => { setEditing(null); setReason(""); }} /></View></Card>}
    {rows.map((row) => { const student = data.users.find((item) => item.email === row.userEmail); const course = data.courses.find((item) => item.slug === row.courseSlug); const status = state(row); return <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: status === "نشط" ? colors.success : status === "ملغي" ? colors.danger : colors.warning }]}>{status}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{course?.title || row.courseSlug}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{student?.fullName || "طالب"} · {row.userEmail}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>من {new Date(row.startsAt).toLocaleDateString("ar-SA")} · إلى {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString("ar-SA") : "غير محدد"}</Text><Text style={[styles.dataMeta, { color: colors.primary }]}>{row.source === "tap" ? "شراء عبر Tap" : row.source === "admin_payment" ? "دفعة يدوية" : "منحة إدارية"}</Text>{row.suspensionReason || row.revocationReason ? <Text style={[styles.ticketBody, { color: colors.warning }]}>{row.suspensionReason || row.revocationReason}</Text> : null}<View style={styles.actionRow}>{status === "نشط" && <AppButton full={false} title="إيقاف مؤقت" variant="soft" onPress={() => { setReason(""); setEditing({ id: row.id, operation: "pause" }); }} />}{status === "متوقف مؤقتًا" && <AppButton full={false} title="استئناف" onPress={() => void mutate({ action: "updateAccess", id: row.id, operation: "resume", operationKey: accessOperationKey(row.id, "resume") }, "تم استئناف الاشتراك وإشعار الطالب")} />}{!row.revokedAt && <AppButton full={false} title="+30 يومًا" variant="soft" onPress={() => void mutate({ action: "updateAccess", id: row.id, operation: "extend", days: 30, operationKey: accessOperationKey(row.id, "extend") }, "تم تمديد الاشتراك 30 يومًا")} />}{!row.revokedAt && <AppButton full={false} title="إلغاء الوصول" variant="danger" onPress={() => { setReason(""); setEditing({ id: row.id, operation: "revoke" }); }} />}</View></Card>; })}
    {!rows.length && <EmptyState icon="shield-outline" title="لا توجد اشتراكات مطابقة" text="ستظهر اشتراكات الطلاب هنا بعد الشراء أو المنح الإداري." />}
  </>;
}

function Commerce({ data, colors, mutate, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; onDelete: DeleteEntity }) {
  const { locale } = useLanguage();
  const students = data.users.filter((row) => row.role === "student");
  const [access, setAccess] = useState({ userEmail: "", courseSlug: "", grantType: "manual_payment", price: "", expiresAt: "" });
  const [coupon, setCoupon] = useState({ code: "", type: "percent", value: "", courseSlug: "", usageLimit: "" });
  const selectedCourse = data.courses.find((row) => row.slug === access.courseSlug);
  return <>
    <SectionTitle title="منح صلاحية مادة" subtitle="اختر هل الوصول ناتج عن دفعة يدوية مسجلة أو منحة مجانية" />
    <Card>
      <SearchPicker label="الطالب" value={access.userEmail} placeholder="اختر حساب الطالب" items={students.map((row) => ({ key: row.email, label: row.fullName, detail: `${row.email} · ${row.phone || "بدون جوال"}` }))} onSelect={(item) => setAccess({ ...access, userEmail: item.key })} />
      <SearchPicker label="المادة" value={access.courseSlug} placeholder="اختر المادة" items={data.courses.map((row) => ({ key: row.slug, label: row.title, detail: `${row.university} · ${row.price} ر.س` }))} onSelect={(item) => { const course = data.courses.find((row) => row.slug === item.key); setAccess({ ...access, courseSlug: item.key, price: access.grantType === "manual_payment" ? String(course?.price ?? "") : "0" }); }} />
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>نوع منح الوصول</Text>
      <ChoiceRow values={["manual_payment", "complimentary"]} selected={access.grantType} onSelect={(value) => setAccess({ ...access, grantType: value, price: value === "manual_payment" ? String(selectedCourse?.price ?? access.price) : "0" })} colors={colors} labels={grantTypeLabels} />
      {access.grantType === "manual_payment" ? <Field label="السعر المسجل في العملية" value={access.price} onChangeText={(value) => setAccess({ ...access, price: value.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholder={selectedCourse ? String(selectedCourse.price) : "0"} /> : <Text style={[styles.dataMeta, { color: colors.textSoft }]}>لن تُسجل المنحة المجانية ضمن الطلبات أو الإيرادات.</Text>}
      <Field label="انتهاء الصلاحية — اختياري" value={access.expiresAt} onChangeText={(value) => setAccess({ ...access, expiresAt: value })} placeholder="2027-01-31T23:59:00Z" autoCapitalize="none" />
      <AppButton title={access.grantType === "manual_payment" ? "منح المادة وتسجيل الدفعة" : "منح المادة مجانًا"} icon="key-outline" disabled={!access.userEmail || !access.courseSlug || (access.grantType === "manual_payment" && (access.price === "" || Number(access.price) < 0))} onPress={() => mutate({ action: "grantAccess", userEmail: access.userEmail, courseSlug: access.courseSlug, grantType: access.grantType, price: access.grantType === "manual_payment" ? Number(access.price) : 0, expiresAt: access.expiresAt }, access.grantType === "manual_payment" ? "تم منح المادة وتسجيل الدفعة في المدفوعات" : "تم منح المادة مجانًا دون تسجيل إيراد")} />
    </Card>
    <SectionTitle title="إنشاء كوبون" />
    <Card><Field label="كود الخصم" value={coupon.code} onChangeText={(value) => setCoupon({ ...coupon, code: value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} autoCapitalize="characters" /><ChoiceRow values={["percent", "fixed"]} selected={coupon.type} onSelect={(value) => setCoupon({ ...coupon, type: value })} colors={colors} labels={couponTypeLabels} /><Field label={coupon.type === "percent" ? "النسبة" : "المبلغ"} value={coupon.value} onChangeText={(value) => setCoupon({ ...coupon, value })} keyboardType="decimal-pad" /><SearchPicker label="مادة محددة — اختياري" value={coupon.courseSlug} placeholder="كل المواد" items={data.courses.map((row) => ({ key: row.slug, label: row.title, detail: row.university }))} onSelect={(item) => setCoupon({ ...coupon, courseSlug: item.key })} /><Field label="حد الاستخدام — اختياري" value={coupon.usageLimit} onChangeText={(value) => setCoupon({ ...coupon, usageLimit: value })} keyboardType="number-pad" /><AppButton title="حفظ الكوبون" disabled={coupon.code.length < 3 || !coupon.value} onPress={() => mutate({ action: "saveCoupon", ...coupon, value: Number(coupon.value), usageLimit: Number(coupon.usageLimit) }, "تم حفظ الكوبون")} /></Card>
    <SectionTitle title="الكوبونات الحالية" />
    {data.coupons.map((row) => <Card key={row.id} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.code}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.type === "percent" ? `${row.value}%` : row.type === "fixed" ? `${row.value} ر.س` : "نوع خصم غير معروف"} · استُخدم {row.usedCount}{row.usageLimit ? `/${row.usageLimit}` : ""} · {couponStatusLabels[row.status] || "حالة كوبون غير معروفة"}</Text><AppButton full={false} title="حذف الكوبون" variant="danger" onPress={() => onDelete("coupon", row.code, row.code, "سيُحذف الكوبون فقط، ولن تتغير الطلبات أو الفواتير السابقة.")} /></Card>)}
    <SectionTitle title="آخر الطلبات" subtitle={`${data.metrics.paidOrders} مدفوعة من ${data.metrics.orders}`} />
    {data.orders.slice(0, 50).map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: row.status === "paid" ? colors.success : colors.warning }]}>{orderStatusLabels[row.status] || "حالة غير معروفة"}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>#{row.orderNumber}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.customerEmail} · {data.courses.find((course) => course.slug === row.courseSlug)?.title || row.courseSlug}</Text><Text style={[styles.amount, { color: colors.text }]}>{row.total.toLocaleString(locale)} ر.س</Text></Card>)}
  </>;
}

function Reviews({ data, colors, mutate, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; onDelete: DeleteEntity }) {
  return <><SectionTitle title="التقييمات الموثقة" subtitle="تنشر فقط آراء أصحاب الشراء والتقدم الحقيقيين" />{data.reviews.map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={styles.stars}>{"★".repeat(row.rating)}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.userEmail}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{data.courses.find((course) => course.slug === row.courseSlug)?.title || row.courseSlug} · {reviewStatusLabels[row.status] || "حالة تقييم غير معروفة"}</Text><Text style={[styles.ticketBody, { color: colors.text }]}>{row.body}</Text><View style={styles.actionRow}><AppButton full={false} title="نشر" variant="soft" onPress={() => mutate({ action: "updateReview", id: row.id, status: "published" }, "تم نشر التقييم")} /><AppButton full={false} title="رفض" variant="danger" onPress={() => mutate({ action: "updateReview", id: row.id, status: "rejected" }, "تم رفض التقييم")} /><AppButton full={false} title="تعليق" variant="ghost" onPress={() => mutate({ action: "updateReview", id: row.id, status: "pending" })} /><AppButton full={false} title="حذف التقييم" variant="danger" onPress={() => onDelete("review", row.id, `تقييم ${row.courseSlug}`, "سيُحذف التقييم فقط، مع إبقاء المادة والحساب وسجل التدقيق.")} /></View></Card>)}</>;
}

type MobileBundleCatalogCourse = { slug:string;title:string;university:string;universitySlug:string;specialty:string;specialtySlug:string;price:number;availableForPurchase:boolean };
type MobileBundle = { id:number;slug:string;title:string;description:string;institutionSlug:string|null;specialtySlug:string|null;discountType:"percent"|"fixed";discountValue:number;status:"draft"|"published"|"archived";featured:boolean;startsAt:string|null;expiresAt:string|null;courseSlugs:string[];courses:{slug:string;title:string;price:number;status:string}[] };

function MobileBundleAdmin({ colors, institutions }:{ colors:Colors;institutions:AdminData["institutions"] }) {
  const bundles = useQuery({ queryKey:["admin-bundles"], queryFn:()=>api<{bundles:MobileBundle[];catalog:MobileBundleCatalogCourse[]}>("/api/admin/bundles"), staleTime:10_000, retry:1 });
  const [editingId,setEditingId] = useState<number|null>(null);
  const [courseQuery,setCourseQuery] = useState("");
  const [feedback,setFeedback] = useState("");
  const [busy,setBusy] = useState(false);
  const [form,setForm] = useState({ slug:"",title:"",description:"",institutionSlug:"",specialtySlug:"",discountType:"percent" as "percent"|"fixed",discountValue:"10",status:"draft" as "draft"|"published"|"archived",featured:false,startsAt:"",expiresAt:"",courseSlugs:[] as string[] });
  const catalog=bundles.data?.catalog || [];
  const reset=()=>{setEditingId(null);setCourseQuery("");setForm({slug:"",title:"",description:"",institutionSlug:"",specialtySlug:"",discountType:"percent",discountValue:"10",status:"draft",featured:false,startsAt:"",expiresAt:"",courseSlugs:[]});};
  const edit=(bundle:MobileBundle)=>{setEditingId(bundle.id);setForm({slug:bundle.slug,title:bundle.title,description:bundle.description,institutionSlug:bundle.institutionSlug||"",specialtySlug:bundle.specialtySlug||"",discountType:bundle.discountType,discountValue:String(bundle.discountValue),status:bundle.status,featured:bundle.featured,startsAt:bundle.startsAt||"",expiresAt:bundle.expiresAt||"",courseSlugs:bundle.courseSlugs});setFeedback("");};
  const toggle=(slug:string)=>setForm((current)=>({...current,courseSlugs:current.courseSlugs.includes(slug)?current.courseSlugs.filter((item)=>item!==slug):[...current.courseSlugs,slug]}));
  const selected=catalog.filter((course)=>form.courseSlugs.includes(course.slug));
  const subtotal=selected.reduce((sum,course)=>sum+course.price,0);
  const discountValue=Math.max(0,Number(form.discountValue)||0);
  const discount=form.discountType==="percent"?subtotal*discountValue/100:discountValue;
  const total=Math.max(0,subtotal-Math.min(subtotal,discount));
  const visibleCourses=catalog.filter((course)=>{
    if(form.institutionSlug&&course.universitySlug!==form.institutionSlug)return false;
    if(form.specialtySlug&&course.specialtySlug!==form.specialtySlug)return false;
    const normalized=courseQuery.trim().toLowerCase();
    return !normalized||`${course.title} ${course.university} ${course.specialty}`.toLowerCase().includes(normalized);
  });
  const specialtyOptions=[...new Map(catalog.filter((course)=>!form.institutionSlug||course.universitySlug===form.institutionSlug).map((course)=>[course.specialtySlug,course.specialty])).entries()].filter(([slug])=>Boolean(slug));
  const save=async()=>{
    if(form.title.trim().length<2||form.slug.trim().length<2||form.courseSlugs.length<2){setFeedback("أدخل الاسم والمعرّف واختر مادتين على الأقل.");return;}
    setBusy(true);setFeedback("");
    try{await api("/api/admin/bundles",{method:editingId?"PATCH":"POST",body:jsonBody({...form,id:editingId,discountValue:Number(form.discountValue),institutionSlug:form.institutionSlug||null,specialtySlug:form.specialtySlug||null,startsAt:form.startsAt||null,expiresAt:form.expiresAt||null})});setFeedback(editingId?"تم تحديث الباقة.":"تم إنشاء الباقة.");reset();await bundles.refetch();}
    catch(reason){setFeedback(reason instanceof ApiError?reason.message:"تعذر حفظ الباقة.");}finally{setBusy(false);}
  };
  const archive=async(bundle:MobileBundle)=>{setBusy(true);setFeedback("");try{await api("/api/admin/bundles",{method:"PATCH",body:jsonBody({...bundle,status:"archived",courseSlugs:bundle.courseSlugs})});setFeedback("تمت أرشفة الباقة وإيقاف ظهورها.");await bundles.refetch();}catch(reason){setFeedback(reason instanceof ApiError?reason.message:"تعذر أرشفة الباقة.");}finally{setBusy(false);}};
  if(bundles.isLoading)return <LoadingState label="جارٍ تحميل الباقات..."/>;
  if(!bundles.data)return <EmptyState icon="albums-outline" title="تعذر تحميل الباقات" text={bundles.error instanceof Error?bundles.error.message:"تحقق من الاتصال ثم أعد المحاولة."} action={<AppButton title="إعادة المحاولة" onPress={()=>void bundles.refetch()}/>}/>;
  return <>
    <SectionTitle title="الباقات والعروض" subtitle="إنشاء باقات مواد وتسعيرها وجدولتها من التطبيق"/>
    <Card style={styles.dataCard}>
      <View style={styles.dataHead}><Text style={[styles.role,{color:colors.primary}]}>{editingId?"تعديل":"جديد"}</Text><Text style={[styles.dataTitle,{color:colors.text}]}>{editingId?form.title||"تعديل الباقة":"إنشاء باقة"}</Text></View>
      <Field label="اسم الباقة" value={form.title} onChangeText={(value)=>setForm({...form,title:value,slug:form.slug||`${asciiSlug(value)}-${stableHash(value)}`})}/>
      <Field label="المعرّف الإنجليزي" value={form.slug} onChangeText={(value)=>setForm({...form,slug:value.toLowerCase().replace(/[^a-z0-9._-]/g,"-")})} autoCapitalize="none"/>
      <TextInput multiline value={form.description} onChangeText={(value)=>setForm({...form,description:value})} placeholder="وصف مختصر للعرض" placeholderTextColor={colors.textSoft} style={[styles.area,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
      <SearchPicker label="الجامعة — اختياري" value={form.institutionSlug} placeholder="كل الجامعات" items={institutions.map((row)=>({key:row.slug,label:row.name,detail:row.region||""}))} onSelect={(item)=>setForm({...form,institutionSlug:item.key,specialtySlug:""})}/>
      <SearchPicker label="التخصص — اختياري" value={form.specialtySlug} placeholder="كل التخصصات" items={specialtyOptions.map(([key,label])=>({key,label}))} onSelect={(item)=>setForm({...form,specialtySlug:item.key})}/>
      <Text style={[styles.dataMeta,{color:colors.textSoft}]}>نوع الخصم</Text><ChoiceRow values={["percent","fixed"]} selected={form.discountType} onSelect={(value)=>setForm({...form,discountType:value as "percent"|"fixed"})} colors={colors} labels={{percent:"نسبة مئوية",fixed:"مبلغ ثابت"}}/>
      <Field label="قيمة الخصم" value={form.discountValue} onChangeText={(value)=>setForm({...form,discountValue:value.replace(/[^0-9.]/g,"")})} keyboardType="decimal-pad"/>
      <Text style={[styles.dataMeta,{color:colors.textSoft}]}>حالة الباقة</Text><ChoiceRow values={["draft","published","archived"]} selected={form.status} onSelect={(value)=>setForm({...form,status:value as typeof form.status})} colors={colors} labels={{draft:"مسودة",published:"منشورة",archived:"مؤرشفة"}}/>
      <ChoiceRow values={["normal","featured"]} selected={form.featured?"featured":"normal"} onSelect={(value)=>setForm({...form,featured:value==="featured"})} colors={colors} labels={{normal:"عرض عادي",featured:"إبراز في الواجهة"}}/>
      <Field label="بداية العرض ISO — اختياري" value={form.startsAt} onChangeText={(value)=>setForm({...form,startsAt:value})} autoCapitalize="none"/><Field label="نهاية العرض ISO — اختياري" value={form.expiresAt} onChangeText={(value)=>setForm({...form,expiresAt:value})} autoCapitalize="none"/>
      <SearchBox value={courseQuery} onChangeText={setCourseQuery} placeholder="ابحث عن مادة لإضافتها"/>
      <View style={styles.bundleCourseGrid}>{visibleCourses.slice(0,50).map((course)=>{const active=form.courseSlugs.includes(course.slug);return <Pressable key={course.slug} onPress={()=>toggle(course.slug)} style={[styles.bundleCourse,{borderColor:active?colors.primary:colors.border,backgroundColor:active?`${colors.primary}12`:colors.surfaceAlt}]}><Ionicons name={active?"checkmark-circle":"add-circle-outline"} size={20} color={active?colors.primary:colors.textSoft}/><View style={{flex:1}}><Text style={[styles.dataTitle,{color:colors.text}]}>{course.title}</Text><Text style={[styles.dataMeta,{color:colors.textSoft}]}>{course.university} · {course.specialty}</Text></View><Text style={{color:course.availableForPurchase?colors.primary:colors.warning,fontSize:9,fontWeight:"900"}}>{course.availableForPurchase?`${course.price} ر.س`:"قيد التجهيز"}</Text></Pressable>;})}</View>
      {visibleCourses.length>50?<Text style={[styles.dataMeta,{color:colors.textSoft}]}>استخدم البحث للوصول إلى بقية المواد.</Text>:null}
      <View style={[styles.bundleQuote,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.dataMeta,{color:colors.textSoft}]}>{form.courseSlugs.length} مواد · قبل الخصم {subtotal.toFixed(2)} ر.س</Text><Text style={[styles.dataTitle,{color:colors.primary}]}>سعر الباقة {total.toFixed(2)} ر.س</Text></View>
      {feedback?<Text style={[styles.message,{color:feedback.startsWith("تم")?colors.success:colors.danger}]}>{feedback}</Text>:null}
      <View style={styles.actionRow}><AppButton full={false} title={editingId?"حفظ التعديلات":"إنشاء الباقة"} icon="save-outline" loading={busy} onPress={()=>void save()}/>{editingId?<AppButton full={false} title="إلغاء" variant="soft" onPress={reset}/>:null}</View>
    </Card>
    <SectionTitle title="الباقات الحالية" subtitle={`${bundles.data.bundles.length} باقة`}/>
    {bundles.data.bundles.length?bundles.data.bundles.map((bundle)=><Card key={bundle.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role,{color:bundle.status==="published"?colors.success:colors.warning}]}>{({draft:"مسودة",published:"منشورة",archived:"مؤرشفة"} as Record<string,string>)[bundle.status]}</Text><Text style={[styles.dataTitle,{color:colors.text}]}>{bundle.title}</Text></View><Text style={[styles.dataMeta,{color:colors.textSoft}]}>{bundle.courseSlugs.length} مواد · خصم {bundle.discountType==="percent"?`${bundle.discountValue}%`:`${bundle.discountValue} ر.س`}</Text><View style={styles.actionRow}><AppButton full={false} title="تعديل" variant="soft" icon="create-outline" onPress={()=>edit(bundle)}/>{bundle.status!=="archived"?<AppButton full={false} title="أرشفة" variant="danger" icon="archive-outline" loading={busy} onPress={()=>void archive(bundle)}/>:null}</View></Card>):<EmptyState icon="albums-outline" title="لا توجد باقات" text="أنشئ أول باقة من النموذج أعلاه."/>}
  </>;
}

type MobileMfaStatus = { enabled:boolean; pendingSetup:boolean; stepUpValid:boolean; stepUpExpiresAt:string|null; factor?:{label:string;verifiedAt:string}|null; error?:string };

function MobileAdminSecurity({ colors }:{ colors:Colors }) {
  const mfa = useQuery({ queryKey:["admin-mfa-status"], queryFn:()=>api<MobileMfaStatus>("/api/admin/security/mfa"), staleTime:10_000, retry:0 });
  const [code,setCode] = useState("");
  const [setup,setSetup] = useState<{secret:string;otpauthUri:string}|null>(null);
  const [feedback,setFeedback] = useState("");
  const [busy,setBusy] = useState(false);
  const submit = async (action:"setup"|"verify"|"stepUp"|"disable") => {
    setBusy(true); setFeedback("");
    try {
      if (action !== "setup" && !/^\d{6}$/.test(code)) throw new ApiError("أدخل رمزًا صحيحًا من 6 أرقام.", 400);
      const result = await api<MobileMfaStatus & { secret?:string;otpauthUri?:string;stepUpToken?:string }>("/api/admin/security/mfa", { method:"POST", body:jsonBody(action === "setup" ? { action, label:"تطبيق المصادقة — الجوال" } : { action, code }) });
      if (action === "setup" && result.secret && result.otpauthUri) {
        setSetup({ secret:result.secret, otpauthUri:result.otpauthUri });
        setFeedback("أضف المفتاح إلى تطبيق المصادقة، ثم أدخل أول رمز يظهر لك.");
      } else if (action === "verify") {
        setSetup(null); setCode(""); setFeedback("تم تفعيل المصادقة الإضافية بنجاح."); await mfa.refetch();
      } else if (action === "stepUp") {
        setAdminStepUpToken(result.stepUpToken || null); setCode(""); setFeedback("تم تأكيد هويتك للعمليات الحساسة لمدة 10 دقائق."); await mfa.refetch();
      } else {
        setAdminStepUpToken(null); setCode(""); setSetup(null); setFeedback("تم تعطيل المصادقة الإضافية لهذا الحساب."); await mfa.refetch();
      }
    } catch (reason) { setFeedback(reason instanceof ApiError ? reason.message : "تعذر إكمال إجراء الأمان."); }
    finally { setBusy(false); }
  };
  if (mfa.isLoading) return <LoadingState label="جارٍ تحميل إعدادات أمان الإدارة..."/>;
  if (!mfa.data) return <><SectionTitle title="أمان حساب الإدارة"/><EmptyState icon="shield-outline" title="تعذر تحميل حالة الأمان" text={mfa.error instanceof Error ? mfa.error.message : "أعد المحاولة بعد التحقق من الاتصال."} action={<AppButton title="إعادة المحاولة" onPress={()=>void mfa.refetch()}/>} /></>;
  const status=mfa.data;
  return <>
    <SectionTitle title="أمان حساب الإدارة" subtitle="مصادقة إضافية وتأكيد قصير المدة قبل الحذف والإشعارات والتغييرات الحساسة"/>
    <Card style={styles.dataCard}>
      <View style={styles.dataHead}><Text style={[styles.role,{color:status.enabled?colors.success:colors.warning}]}>{status.enabled?"مفعّلة":"تحتاج إعدادًا"}</Text><Text style={[styles.dataTitle,{color:colors.text}]}>رمز تحقق متغير TOTP</Text></View>
      <Text style={[styles.dataMeta,{color:colors.textSoft}]}>استخدم تطبيق مصادقة موثوقًا. المفتاح مشفّر على الخادم ولا يظهر مجددًا بعد التفعيل.</Text>
      {!status.enabled ? <AppButton title={status.pendingSetup?"إنشاء مفتاح إعداد جديد":"بدء إعداد المصادقة"} icon="key-outline" loading={busy} onPress={()=>void submit("setup")}/> : null}
      {setup ? <View style={[styles.securitySetup,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.dataMeta,{color:colors.textSoft}]}>مفتاح الإعداد — احفظه الآن</Text><Text selectable style={[styles.securitySecret,{color:colors.text}]}>{setup.secret}</Text><AppButton title="فتح تطبيق المصادقة" variant="soft" icon="open-outline" onPress={()=>void Linking.openURL(setup.otpauthUri).catch(()=>setFeedback("انسخ المفتاح يدويًا إلى تطبيق المصادقة."))}/></View> : null}
      {(setup || status.enabled) ? <Field label={status.enabled?"رمز المصادقة الحالي":"رمز التفعيل الأول"} value={code} onChangeText={(value)=>setCode(value.replace(/[^0-9]/g,"").slice(0,6))} keyboardType="number-pad"/> : null}
      {setup ? <AppButton title="تفعيل الحماية" icon="shield-checkmark-outline" loading={busy} disabled={code.length!==6} onPress={()=>void submit("verify")}/> : null}
      {status.enabled ? <View style={styles.actionRow}><AppButton full={false} title={status.stepUpValid?"الهوية مؤكدة الآن":"تأكيد عملية حساسة"} icon="checkmark-circle-outline" loading={busy} disabled={code.length!==6 || status.stepUpValid} onPress={()=>void submit("stepUp")}/><AppButton full={false} title="تعطيل المصادقة" variant="danger" loading={busy} disabled={code.length!==6} onPress={()=>void submit("disable")}/></View> : null}
      {status.stepUpValid && status.stepUpExpiresAt ? <Text style={[styles.dataMeta,{color:colors.success}]}>التأكيد صالح حتى {new Date(status.stepUpExpiresAt).toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit"})}</Text> : null}
      {feedback ? <Text style={[styles.message,{color:feedback.startsWith("تم")?colors.success:colors.warning}]}>{feedback}</Text> : null}
    </Card>
  </>;
}

function Communication({ data, colors, mutate, onDelete }: { data: AdminData; colors: Colors; mutate: Mutate; onDelete: DeleteEntity }) {
  const [settings, setSettings] = useState({ whatsapp_number: data.settings.whatsapp_number || "", whatsapp_message: data.settings.whatsapp_message || "", support_email: data.settings.support_email || "", support_hours: data.settings.support_hours || "", social_x: data.settings.social_x || "", social_instagram: data.settings.social_instagram || "", social_tiktok: data.settings.social_tiktok || "", social_youtube: data.settings.social_youtube || "", social_telegram: data.settings.social_telegram || "", social_linkedin: data.settings.social_linkedin || "", social_facebook: data.settings.social_facebook || "", social_snapchat: data.settings.social_snapchat || "", social_threads: data.settings.social_threads || "" });
  const [notice, setNotice] = useState({ title: "", body: "", audience: "student", userEmail: "", actionUrl: "/notifications", actionLabel: "فتح التفاصيل", presentation: "inbox", template: "general", pushEnabled: true, startsAt: "", expiresAt: "", dismissible: true, segmentUniversity: "", segmentSpecialty: "", segmentCourse: "", segmentAccessState: "", segmentInactiveDays: "" });
  const update = (key: keyof typeof settings, value: string) => setSettings((current) => ({ ...current, [key]: value }));
  const students = data.users.filter((row) => row.role === "student");
  const templateLabels: Record<string, string> = { general: "إعلان عام", discount: "تخفيض", "new-course": "مادة جديدة", "new-service": "خدمة جديدة", urgent: "تنبيه مهم", success: "خبر سار" };
  const templateIcons: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = { general: "megaphone-outline", discount: "pricetag-outline", "new-course": "book-outline", "new-service": "sparkles-outline", urgent: "alert-circle-outline", success: "checkmark-circle-outline" };
  return <>
    <SectionTitle title="قنوات التواصل" subtitle="تظهر القيم تلقائيًا في الويب والتطبيق والتذييل وصفحة الدعم" />
    <Card><Field label="رقم واتساب" value={settings.whatsapp_number} onChangeText={(value) => update("whatsapp_number", value)} keyboardType="phone-pad" /><Field label="رسالة واتساب الافتراضية" value={settings.whatsapp_message} onChangeText={(value) => update("whatsapp_message", value)} /><Field label="بريد الدعم" value={settings.support_email} onChangeText={(value) => update("support_email", value)} keyboardType="email-address" autoCapitalize="none" /><Field label="ساعات العمل" value={settings.support_hours} onChangeText={(value) => update("support_hours", value)} /><Text style={[styles.dataMeta, { color: colors.textSoft }]}>الشبكات الاجتماعية</Text>{[["social_x", "X"], ["social_instagram", "Instagram"], ["social_tiktok", "TikTok"], ["social_youtube", "YouTube"], ["social_telegram", "Telegram"], ["social_linkedin", "LinkedIn"], ["social_facebook", "Facebook"], ["social_snapchat", "Snapchat"], ["social_threads", "Threads"]].map(([key, label]) => <Field key={key} label={`رابط ${label}`} value={settings[key as keyof typeof settings]} onChangeText={(value) => update(key as keyof typeof settings, value)} autoCapitalize="none" />)}<AppButton title="حفظ قنوات التواصل" icon="save-outline" onPress={() => mutate({ action: "saveSettings", values: settings }, "تم تحديث القنوات في الويب والتطبيق")} /></Card>
    <SectionTitle title="الإعلانات والإشعارات" subtitle="قوالب جاهزة، نافذة منبثقة أو شريط إعلاني أو مركز إشعارات، ورابط داخلي أو خارجي" />
    <Card>
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>قالب الإعلان</Text>
      <ChoiceRow values={["general", "discount", "new-course", "new-service", "urgent", "success"]} selected={notice.template} onSelect={(value) => setNotice({ ...notice, template: value })} colors={colors} labels={templateLabels} />
      <View style={[styles.noticePreview, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Ionicons name={templateIcons[notice.template] || "megaphone-outline"} size={27} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.dataTitle, { color: colors.text }]}>{notice.title || templateLabels[notice.template]}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{notice.body || "ستظهر معاينة الإعلان هنا قبل الإرسال."}</Text></View></View>
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>طريقة الظهور</Text>
      <ChoiceRow values={["inbox", "banner", "modal", "all"]} selected={notice.presentation} onSelect={(value) => setNotice({ ...notice, presentation: value })} colors={colors} labels={{ inbox: "مركز الإشعارات", banner: "شريط إعلاني", modal: "نافذة منبثقة", all: "كل طرق العرض" }} />
      <Text style={[styles.dataMeta, { color: colors.textSoft }]}>الجمهور</Text>
      <ChoiceRow values={["student", "public", "supervisor", "admin", "user", "segment"]} selected={notice.audience} onSelect={(value) => setNotice({ ...notice, audience: value, userEmail: value === "user" ? notice.userEmail : "" })} colors={colors} labels={{ student: "كل الطلاب", public: "الزوار", supervisor: "المشرفون", admin: "الإدارة", user: "مستخدم محدد", segment: "شريحة مستهدفة" }} />
      {notice.audience === "user" ? <SearchPicker label="ابحث عن المستخدم" value={notice.userEmail} placeholder="ابحث بالاسم أو البريد" items={students.map((row) => ({ key: row.email, label: row.fullName, detail: `${row.email} · ${row.phone || ""}` }))} onSelect={(item) => setNotice({ ...notice, userEmail: item.key })} /> : null}
      {notice.audience === "segment" ? <View style={[styles.segmentBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={[styles.dataTitle, { color: colors.text }]}>تحديد شريحة الطلاب</Text>
        <Text style={[styles.dataMeta, { color: colors.textSoft }]}>يمكن جمع أكثر من معيار، ولن يصل الإعلان إلا للطلاب المطابقين لها جميعًا.</Text>
        <SearchPicker label="الجامعة — اختياري" value={notice.segmentUniversity} placeholder="اختر الجامعة" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region || "" }))} onSelect={(item) => setNotice({ ...notice, segmentUniversity: item.key })} />
        <SearchPicker label="التخصص — اختياري" value={notice.segmentSpecialty} placeholder="اختر التخصص" items={data.specialties.map((row) => ({ key: row.name, label: row.name, detail: row.slug }))} onSelect={(item) => setNotice({ ...notice, segmentSpecialty: item.key })} />
        <SearchPicker label="مشتركون في مادة — اختياري" value={notice.segmentCourse} placeholder="اختر المادة" items={data.courses.map((row) => ({ key: row.slug, label: row.title, detail: `${row.university} · ${row.specialty}` }))} onSelect={(item) => setNotice({ ...notice, segmentCourse: item.key })} />
        <Text style={[styles.dataMeta, { color: colors.textSoft }]}>حالة الوصول — اختياري</Text>
        <ChoiceRow values={["", "active", "expired", "none"]} selected={notice.segmentAccessState} onSelect={(value) => setNotice({ ...notice, segmentAccessState: value })} colors={colors} labels={{ "": "الكل", active: "وصول نشط", expired: "منتهي أو موقوف", none: "دون اشتراك" }} />
        <Field label="لم يدخل منذ عدد أيام — اختياري" value={notice.segmentInactiveDays} onChangeText={(value) => setNotice({ ...notice, segmentInactiveDays: value.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />
      </View> : null}
      <Field label="عنوان الإعلان" value={notice.title} onChangeText={(value) => setNotice({ ...notice, title: value })} />
      <TextInput value={notice.body} onChangeText={(value) => setNotice({ ...notice, body: value })} placeholder="نص الإعلان أو الإشعار" placeholderTextColor={colors.textSoft} multiline style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
      <SearchPicker label="ربط الزر بمادة — اختياري" value={notice.actionUrl.startsWith("/courses/") ? notice.actionUrl : ""} placeholder="اختر مادة من النظام" items={data.courses.map((row) => ({ key: `/courses/${row.slug}`, label: row.title, detail: `${row.university} · ${row.specialty}` }))} onSelect={(item) => setNotice({ ...notice, actionUrl: item.key, actionLabel: "فتح المادة" })} />
      <Field label="رابط الزر — داخلي أو HTTPS" value={notice.actionUrl} onChangeText={(value) => setNotice({ ...notice, actionUrl: value })} autoCapitalize="none" />
      <Field label="نص الزر" value={notice.actionLabel} onChangeText={(value) => setNotice({ ...notice, actionLabel: value })} />
      <Field label="بداية الظهور — اختياري" value={notice.startsAt} onChangeText={(value) => setNotice({ ...notice, startsAt: value })} autoCapitalize="none" />
      <Field label="نهاية الظهور — اختياري" value={notice.expiresAt} onChangeText={(value) => setNotice({ ...notice, expiresAt: value })} autoCapitalize="none" />
      <ChoiceRow values={["dismissible", "fixed"]} selected={notice.dismissible ? "dismissible" : "fixed"} onSelect={(value) => setNotice({ ...notice, dismissible: value === "dismissible" })} colors={colors} labels={{ dismissible: "يمكن إخفاؤه", fixed: "ثابت" }} />
      <ChoiceRow values={["push", "no-push"]} selected={notice.pushEnabled ? "push" : "no-push"} onSelect={(value) => setNotice({ ...notice, pushEnabled: value === "push" })} colors={colors} labels={{ push: "إرسال إشعار فوري", "no-push": "داخل المنصة فقط" }} />
      <AppButton title="نشر الإعلان" icon="send-outline" disabled={notice.title.length < 3 || notice.body.length < 3 || (notice.audience === "user" && !notice.userEmail) || (notice.audience === "segment" && !notice.segmentUniversity && !notice.segmentSpecialty && !notice.segmentCourse && !notice.segmentAccessState && !notice.segmentInactiveDays)} onPress={() => mutate({ action: "createNotification", ...notice, userEmail: notice.userEmail || null, segmentInactiveDays: Number(notice.segmentInactiveDays) || 0 }, "تم نشر الإعلان والإشعار للشريحة المحددة")} />
    </Card>
    <SectionTitle title="الإعلانات الحالية" />
    <View>{data.notifications.slice(0, 30).map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{templateLabels[row.template || "general"] || "إعلان مخصص"}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.title}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{notificationAudienceLabels[row.audience] || "جمهور مخصص"} · {row.userEmail || "عام"} · {notificationPresentationLabels[row.presentation || "inbox"] || "عرض مخصص"}</Text>{row.actionUrl ? <Text numberOfLines={1} style={[styles.dataMeta, { color: colors.primary }]}>{row.actionUrl}</Text> : null}<AppButton full={false} title="حذف الإشعار" variant="danger" onPress={() => onDelete("notification", row.id, row.title, "سيُحذف الإشعار فقط، مع إبقاء سجل التدقيق محفوظًا.")} /></Card>)}</View>
  </>;
}

function ChoiceRow({ values, selected, onSelect, colors, labels }: { values: string[]; selected: string; onSelect: (value: string) => void; colors: Colors; labels?: Record<string, string> }) {
  const { direction, rowDirection } = useLanguage();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.choices, { direction, flexDirection: rowDirection }]}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.choice, { backgroundColor: selected === value ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: selected === value ? "#FFF" : colors.text, fontSize: 9, fontWeight: "800" }}>{labels?.[value] || value}</Text></Pressable>)}</ScrollView>;
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingBottom: 14 }, tab: { width: 100, height: 62, flexShrink: 0, overflow: "hidden", borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 4 }, tabIcon: { width: 24, height: 24, flexShrink: 0, alignItems: "center", justifyContent: "center" }, tabLabel: { width: "100%", paddingHorizontal: 5, textAlign: "center", fontSize: 9, fontWeight: "900" }, message: { fontSize: 10, textAlign: "center", marginBottom: 8, fontWeight: "800" }, segmentBox: { gap: 10, padding: 12, borderWidth: 1, borderRadius: 15 }, securitySetup: { gap: 9, padding: 12, borderWidth: 1, borderRadius: 14 }, securitySecret: { fontSize: 14, fontWeight: "900", letterSpacing: 2, textAlign: "center" }, bundleCourseGrid: { maxHeight: 420, gap: 7 }, bundleCourse: { minHeight: 58, flexDirection: "row-reverse", alignItems: "center", gap: 9, padding: 10, borderWidth: 1, borderRadius: 13 }, bundleQuote: { gap: 5, padding: 12, borderWidth: 1, borderRadius: 13 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }, metric: { width: "48%", minHeight: 130, alignItems: "flex-start" }, metricValue: { fontSize: 20, fontWeight: "900", marginTop: 12 }, metricLabel: { fontSize: 9, marginTop: 4 },
  queue: { minHeight: 54, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, queueValue: { fontSize: 18, fontWeight: "900" }, queueLabel: { fontSize: 11, fontWeight: "800" }, service: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 9 }, serviceText: { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "right" },
  dataCard: { marginBottom: 9 }, coverPreview: { width: "100%", height: 150, borderRadius: 16, marginTop: 10, backgroundColor: "#CBD5E1" }, requestFiles: { marginTop: 6, gap: 5 }, requestFile: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 }, requestLink: { marginTop: 9, borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 }, deviceBox: { marginTop: 10, borderWidth: 1, borderRadius: 14, padding: 10, gap: 7 }, deviceTitle: { fontSize: 10, fontWeight: "900" }, deviceRow: { minHeight: 52, borderTopWidth: 1, paddingTop: 7, flexDirection: "row", alignItems: "center", gap: 8 }, deviceCopy: { flex: 1 }, deviceName: { fontSize: 10, fontWeight: "900" }, noticePreview: { minHeight: 86, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }, dataHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, dataTitle: { flex: 1, fontSize: 13, fontWeight: "900", textAlign: "right" }, role: { fontSize: 9, fontWeight: "900" }, dataMeta: { fontSize: 8, textAlign: "right", marginTop: 5 }, actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }, statuses: { gap: 6, marginTop: 11 }, status: { minHeight: 34, borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  ticketBody: { fontSize: 10, lineHeight: 18, textAlign: "right", marginTop: 9 }, adminThread: { gap: 7, padding: 10, borderRadius: 13, marginTop: 10 }, adminBubble: { padding: 10, borderRadius: 12 }, adminBubbleLabel: { color: "#FFF", fontSize: 9, fontWeight: "900", textAlign: "right" }, adminBubbleText: { color: "#FFF", fontSize: 10, lineHeight: 18, textAlign: "right", marginTop: 4 }, adminAttachment: { flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 6 }, area: { minHeight: 90, borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 11, marginBottom: 12, textAlignVertical: "top", writingDirection: "rtl" }, choices: { flexDirection: "row", gap: 7, paddingBottom: 12 }, choice: { minHeight: 36, borderRadius: 11, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, spacer: { height: 10 }, amount: { fontSize: 15, fontWeight: "900", textAlign: "right", marginTop: 10 }, stars: { color: "#F7A810", letterSpacing: 2 },
});
