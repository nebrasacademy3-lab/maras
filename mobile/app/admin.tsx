import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, EmptyState, Field, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Course, Institution } from "@/src/types";

type Colors = ReturnType<typeof useTheme>["colors"];
type AdminData = {
  metrics: { students: number; activeStudents: number; institutions: number; publishedCourses: number; orders: number; paidOrders: number; revenue: number; openRequests: number; openTickets: number; pendingReviews: number };
  services: Record<string, boolean>;
  users: { id: number; fullName: string; email: string; phone: string | null; role: string; status: string; universitySlug: string | null; specialty: string | null; profileCompletedAt: string | null }[];
  requests: { id: number; courseName: string; university: string; specialty: string; status: string; attachmentsCount: number; createdAt: string }[];
  tickets: { id: number; ticketNumber: string; title: string; message: string; userEmail: string | null; status: string }[];
  institutions: (Institution & { status: string })[];
  courses: (Course & { status: string; specialtySlug: string; coverTheme: string })[];
  specialties: { slug: string; name: string; description: string; status: string }[];
  orders: { id: number; orderNumber: string; customerEmail: string; courseSlug: string; total: number; status: string; createdAt: string }[];
  reviews: { id: number; userEmail: string; courseSlug: string; rating: number; body: string; status: string }[];
  coupons: { id: number; code: string; type: string; value: number; courseSlug: string | null; usageLimit: number | null; usedCount: number; status: string }[];
  supervisorAssignments: { id: number; supervisorId: number; institutionSlug: string | null; specialty: string | null; active: boolean }[];
  settings: Record<string, string>;
};

type Tab = "overview" | "users" | "staff" | "requests" | "support" | "catalog" | "commerce" | "reviews" | "communication";
type Mutate = (payload: Record<string, unknown>, success?: string) => Promise<boolean>;

const requestStatuses = ["new", "assigned", "reviewing", "planned", "producing", "available", "declined"];
const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "overview", label: "الرئيسية", icon: "grid-outline" },
  { key: "users", label: "الحسابات", icon: "people-outline" },
  { key: "staff", label: "الموظفون", icon: "person-add-outline" },
  { key: "requests", label: "الطلبات", icon: "cloud-upload-outline" },
  { key: "support", label: "الدعم", icon: "headset-outline" },
  { key: "catalog", label: "الكتالوج", icon: "library-outline" },
  { key: "commerce", label: "المبيعات", icon: "card-outline" },
  { key: "reviews", label: "التقييمات", icon: "star-outline" },
  { key: "communication", label: "التواصل", icon: "megaphone-outline" },
];

export default function Admin() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["admin-console"], queryFn: () => api<AdminData>("/api/admin/console"), enabled: user?.role === "admin" });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ["admin-console"] }); };
  const mutate: Mutate = async (payload, success = "تم حفظ التغيير") => {
    setMessage("");
    try { await api("/api/admin/console", { method: "POST", body: jsonBody(payload) }); setMessage(success); await refresh(); return true; }
    catch (reason) { setMessage(reason instanceof ApiError ? reason.message : "تعذر تنفيذ الإجراء"); return false; }
  };

  if (user?.role !== "admin") return <Screen><AppHeader title="لوحة الإدارة" back /><EmptyState icon="lock-closed-outline" title="غير مصرح" text="هذه الصفحة متاحة للحسابات الإدارية فقط، ولا توجد حسابات تجريبية عامة." /></Screen>;
  if (query.isLoading) return <Screen><LoadingState label="جارٍ تحميل مركز التحكم..." /></Screen>;
  if (!query.data) return <Screen><AppHeader title="لوحة الإدارة" back /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل البيانات" text="تحقق من الاتصال ثم أعد المحاولة." action={<AppButton title="إعادة المحاولة" onPress={() => query.refetch()} />} /></Screen>;
  const data = query.data;

  return <Screen keyboard>
    <AppHeader title="لوحة الإدارة" subtitle="تحكم مباشر وآمن في منصة مراس" back />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{tabs.map((item) => <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, { backgroundColor: tab === item.key ? colors.primary : colors.surface, borderColor: tab === item.key ? colors.primary : colors.border }]}><Ionicons name={item.icon} size={18} color={tab === item.key ? "#FFF" : colors.primary} /><Text style={{ color: tab === item.key ? "#FFF" : colors.text, fontSize: 9, fontWeight: "900" }}>{item.label}</Text></Pressable>)}</ScrollView>
    {message ? <Text style={[styles.message, { color: message.startsWith("تم") ? colors.success : colors.danger }]}>{message}</Text> : null}
    {tab === "overview" && <Overview data={data} colors={colors} />}
    {tab === "users" && <Users data={data} colors={colors} mutate={mutate} />}
    {tab === "staff" && <StaffAdmin data={data} colors={colors} refresh={refresh} mutate={mutate} />}
    {tab === "requests" && <Requests rows={data.requests} colors={colors} mutate={mutate} />}
    {tab === "support" && <Support rows={data.tickets} colors={colors} mutate={mutate} />}
    {tab === "catalog" && <CatalogAdmin data={data} colors={colors} mutate={mutate} refresh={refresh} />}
    {tab === "commerce" && <Commerce data={data} colors={colors} mutate={mutate} />}
    {tab === "reviews" && <Reviews data={data} colors={colors} mutate={mutate} />}
    {tab === "communication" && <Communication data={data} colors={colors} mutate={mutate} />}
  </Screen>;
}

function Overview({ data, colors }: { data: AdminData; colors: Colors }) {
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
    <Card>{Object.entries(data.services).map(([key, ready]) => <View key={key} style={styles.service}><Ionicons name={ready ? "checkmark-circle" : "alert-circle"} size={21} color={ready ? colors.success : colors.warning} /><Text style={[styles.serviceText, { color: colors.text }]}>{({ assistant: "المساعد الذكي", payments: "Tap Payments", email: "استعادة الحساب", videoSigning: "الفيديو الخاص" } as Record<string, string>)[key] || key}</Text><Text style={{ color: ready ? colors.success : colors.warning, fontSize: 9, fontWeight: "900" }}>{ready ? "جاهز" : "يحتاج إعداد"}</Text></View>)}</Card>
  </>;
}

function Queue({ label, value, colors }: { label: string; value: number; colors: Colors }) {
  return <View style={[styles.queue, { borderBottomColor: colors.border }]}><Text style={[styles.queueValue, { color: colors.primary }]}>{value}</Text><Text style={[styles.queueLabel, { color: colors.text }]}>{label}</Text></View>;
}

function StaffAdmin({ data, colors, mutate, refresh }: { data: AdminData; colors: Colors; mutate: Mutate; refresh: () => Promise<void> }) {
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
  return <><SectionTitle title="إنشاء موظف وصلاحياته" subtitle="الحساب الجديد يبدأ بصلاحيات محددة ولا يصل إلى الإدارة إلا بدور مصرح" /><Card><Field label="البريد الإلكتروني" value={form.email} onChangeText={(value) => setForm({ ...form, email: value })} keyboardType="email-address" autoCapitalize="none" /><Field label="الاسم الكامل" value={form.fullName} onChangeText={(value) => setForm({ ...form, fullName: value })} /><Field label="الجوال السعودي" value={form.phone} onChangeText={(value) => setForm({ ...form, phone: value })} keyboardType="phone-pad" /><Field label="كلمة المرور المؤقتة" value={form.password} onChangeText={(value) => setForm({ ...form, password: value })} secureTextEntry autoCapitalize="none" /><ChoiceRow values={["supervisor", "admin"]} selected={form.role} onSelect={(value) => setForm({ ...form, role: value })} colors={colors} /><SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر الجهة" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key })} /><SearchPicker label="التخصص" value={form.specialty} placeholder="اختر التخصص" items={data.specialties.map((row) => ({ key: row.name, label: row.name }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />{feedback ? <Text style={[styles.message, { color: feedback.startsWith("تم") ? colors.success : colors.danger }]}>{feedback}</Text> : null}<AppButton title="إنشاء الحساب" icon="person-add-outline" loading={busy} disabled={form.email.trim().length < 5 || form.fullName.trim().length < 5 || form.phone.trim().length < 8 || form.password.length < 10 || !form.universitySlug || !form.specialty} onPress={create} /></Card><SectionTitle title="الموظفون الحاليون" subtitle={`${staff.length} حساب إداري أو إشرافي`} />{staff.length ? staff.map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{row.role}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.fullName}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.email} · {row.status}</Text><View style={styles.actionRow}><AppButton full={false} title={row.status === "active" ? "تعليق" : "تنشيط"} variant={row.status === "active" ? "danger" : "soft"} onPress={() => void mutate({ action: "updateUser", id: row.id, role: row.role, status: row.status === "active" ? "suspended" : "active" })} /><AppButton full={false} title="تحويل لمشرف" variant="ghost" onPress={() => void mutate({ action: "updateUser", id: row.id, role: row.role === "admin" ? "supervisor" : "admin", status: row.status })} /></View></Card>) : <EmptyState title="لا يوجد موظفون" text="أنشئ أول مشرف أو مدير من النموذج أعلاه." />}</>;
}

function Users({ data, colors, mutate }: { data: AdminData; colors: Colors; mutate: Mutate }) {
  const supervisors = data.users.filter((row) => row.role === "supervisor");
  const [supervisorId, setSupervisorId] = useState("");
  const [institutionSlug, setInstitutionSlug] = useState("");
  const [specialty, setSpecialty] = useState("");
  const programs = useQuery({ queryKey: ["admin-programs", institutionSlug], queryFn: () => api<{ programs: { name: string; degree: string; area: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(institutionSlug)}`), enabled: Boolean(institutionSlug) });
  return <>
    <SectionTitle title="الحسابات والصلاحيات" subtitle={`${data.users.length} حسابًا في أحدث النتائج`} />
    {data.users.map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: colors.primary }]}>{row.role}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.fullName}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.email} · {row.phone || "بدون جوال"}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.specialty || "بدون تخصص"} · {row.profileCompletedAt ? "ملف مكتمل" : "ملف ناقص"} · {row.status}</Text><View style={styles.actionRow}><AppButton full={false} title={row.status === "active" ? "تعليق" : "تنشيط"} variant={row.status === "active" ? "danger" : "soft"} onPress={() => mutate({ action: "updateUser", id: row.id, role: row.role, status: row.status === "active" ? "suspended" : "active" })} /><AppButton full={false} title={row.role === "student" ? "ترقية لمشرف" : "إعادة لطالب"} variant="soft" onPress={() => mutate({ action: "updateUser", id: row.id, status: row.status, role: row.role === "student" ? "supervisor" : "student" })} /></View></Card>)}
    <SectionTitle title="نطاقات المشرفين" subtitle="يربط المشرف بطلبات ومحتوى الجامعة والتخصص المحددين" />
    <Card>
      <SearchPicker label="المشرف" value={supervisorId} placeholder="اختر حساب مشرف" items={supervisors.map((row) => ({ key: String(row.id), label: row.fullName, detail: row.email }))} onSelect={(item) => setSupervisorId(item.key)} />
      <SearchPicker label="الجامعة أو الكلية" value={institutionSlug} placeholder="اختر الجهة" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => { setInstitutionSlug(item.key); setSpecialty(""); }} />
      <SearchPicker label="التخصص" value={specialty} placeholder={programs.isFetching ? "جارٍ تحميل التخصصات..." : "اختر تخصص الجهة"} disabled={!institutionSlug || programs.isFetching} items={(programs.data?.programs || []).map((row) => ({ key: row.name, label: row.name, detail: `${row.degree} · ${row.area}` }))} onSelect={(item) => setSpecialty(item.key)} />
      <AppButton title="حفظ نطاق الإشراف" icon="git-network-outline" disabled={!supervisorId || !institutionSlug || !specialty} onPress={() => mutate({ action: "saveSupervisorAssignment", supervisorId: Number(supervisorId), institutionSlug, specialty, active: true }, "تم ربط المشرف بالنطاق")} />
    </Card>
    {data.supervisorAssignments.map((assignment) => { const supervisor = data.users.find((row) => row.id === assignment.supervisorId); const institution = data.institutions.find((row) => row.slug === assignment.institutionSlug); return <Card key={assignment.id} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{supervisor?.fullName || `مشرف #${assignment.supervisorId}`}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{institution?.name || assignment.institutionSlug} · {assignment.specialty}</Text><AppButton full={false} title={assignment.active ? "تعطيل النطاق" : "تفعيل النطاق"} variant={assignment.active ? "danger" : "soft"} onPress={() => mutate({ action: "saveSupervisorAssignment", ...assignment, active: !assignment.active })} /></Card>; })}
  </>;
}

function Requests({ rows, colors, mutate }: { rows: AdminData["requests"]; colors: Colors; mutate: Mutate }) {
  return <><SectionTitle title="طلبات المواد" subtitle="تغيير الحالة يظهر فورًا للطالب ويرسل Push لجهازه" />{rows.map((row) => <Card key={row.id} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.courseName}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.university} · {row.specialty} · {row.attachmentsCount} ملفات</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statuses}>{requestStatuses.map((status) => <Pressable key={status} onPress={() => mutate({ action: "updateRequest", id: row.id, status })} style={[styles.status, { backgroundColor: row.status === status ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: row.status === status ? "#FFF" : colors.textSoft, fontSize: 8 }}>{status}</Text></Pressable>)}</ScrollView></Card>)}</>;
}

function Support({ rows, colors, mutate }: { rows: AdminData["tickets"]; colors: Colors; mutate: Mutate }) {
  const [replies, setReplies] = useState<Record<number, string>>({});
  return <><SectionTitle title="تذاكر الدعم" subtitle="الرد يظهر لصاحب الحساب ويرسل له إشعارًا" />{rows.map((row) => <Card key={row.id} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.title}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>#{row.ticketNumber} · {row.userEmail || "زائر"} · {row.status}</Text><Text style={[styles.ticketBody, { color: colors.text }]}>{row.message}</Text><TextInput value={replies[row.id] || ""} onChangeText={(value) => setReplies({ ...replies, [row.id]: value })} placeholder="اكتب رد الدعم..." placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} textAlign="right" multiline /><View style={styles.actionRow}><AppButton full={false} title="رد وحل" variant="soft" onPress={() => mutate({ action: "updateTicket", id: row.id, status: "resolved", reply: replies[row.id] || "", internal: false }, "تم إرسال الرد وحل التذكرة")} /><AppButton full={false} title="إعادة الفتح" variant="ghost" onPress={() => mutate({ action: "updateTicket", id: row.id, status: "open", reply: "", internal: false })} /></View></Card>)}</>;
}

function CatalogAdmin({ data, colors, mutate, refresh }: { data: AdminData; colors: Colors; mutate: Mutate; refresh: () => Promise<void> }) {
  const [institution, setInstitution] = useState({ slug: "", name: "", nameEn: "", region: "", type: "حكومية", domain: "", logoUrl: "" });
  const [logo, setLogo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [specialty, setSpecialty] = useState({ slug: "", name: "", description: "", institutionSlug: "" });
  const [course, setCourse] = useState({ slug: "", institutionSlug: "", specialtySlug: "", title: "", titleEn: "", code: "", description: "", price: "", oldPrice: "", accessLabel: "90 يومًا" });
  const saveInstitution = async () => {
    const saved = await mutate({ action: "saveInstitution", ...institution, status: "published", featured: false }, "تم حفظ الجهة التعليمية");
    if (!saved || !logo) return;
    const form = new FormData(); form.append("slug", institution.slug); form.append("file", { uri: logo.uri, name: logo.name, type: logo.mimeType || "image/png" } as unknown as Blob);
    try { await api("/api/admin/logos", { method: "POST", body: form }); setLogo(null); await refresh(); }
    catch { /* The institution remains saved and a remote logo can be added later. */ }
  };
  const pickLogo = async () => { const result = await DocumentPicker.getDocumentAsync({ type: "image/*", multiple: false, copyToCacheDirectory: true }); if (!result.canceled) setLogo(result.assets[0] || null); };
  return <>
    <SectionTitle title="إضافة جامعة أو كلية" subtitle="يمكن رفع شعار شفاف أو استخدام رابط HTTPS رسمي" />
    <Card><Field label="المعرّف الإنجليزي" value={institution.slug} onChangeText={(value) => setInstitution({ ...institution, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="university-slug" autoCapitalize="none" /><Field label="الاسم العربي" value={institution.name} onChangeText={(value) => setInstitution({ ...institution, name: value })} /><Field label="الاسم الإنجليزي" value={institution.nameEn} onChangeText={(value) => setInstitution({ ...institution, nameEn: value })} /><Field label="المنطقة" value={institution.region} onChangeText={(value) => setInstitution({ ...institution, region: value })} /><ChoiceRow values={["حكومية", "أهلية", "كلية", "تقنية"]} selected={institution.type} onSelect={(value) => setInstitution({ ...institution, type: value })} colors={colors} /><Field label="النطاق الرسمي" value={institution.domain} onChangeText={(value) => setInstitution({ ...institution, domain: value })} placeholder="university.edu.sa" autoCapitalize="none" /><Field label="رابط الشعار الرسمي — اختياري" value={institution.logoUrl} onChangeText={(value) => setInstitution({ ...institution, logoUrl: value })} placeholder="https://.../logo.svg" autoCapitalize="none" /><AppButton title={logo ? `الشعار: ${logo.name}` : "رفع ملف شعار"} variant="soft" icon="image-outline" onPress={pickLogo} /><View style={styles.spacer} /><AppButton title="حفظ الجهة" icon="save-outline" disabled={institution.slug.length < 2 || institution.name.length < 3 || !institution.region} onPress={saveInstitution} /></Card>
    <SectionTitle title="إضافة تخصص وربطه" />
    <Card><Field label="معرّف التخصص" value={specialty.slug} onChangeText={(value) => setSpecialty({ ...specialty, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="computer-science" /><Field label="اسم التخصص" value={specialty.name} onChangeText={(value) => setSpecialty({ ...specialty, name: value })} /><Field label="وصف مختصر" value={specialty.description} onChangeText={(value) => setSpecialty({ ...specialty, description: value })} /><SearchPicker label="ربطه بجهة" value={specialty.institutionSlug} placeholder="اختر الجامعة أو الكلية" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => setSpecialty({ ...specialty, institutionSlug: item.key })} /><AppButton title="حفظ التخصص" disabled={specialty.slug.length < 2 || specialty.name.length < 2 || !specialty.institutionSlug} onPress={() => mutate({ action: "saveSpecialty", ...specialty, status: "published" }, "تم حفظ التخصص وربطه")} /></Card>
    <SectionTitle title="إضافة مادة" subtitle="ترتبط بجهة وتخصص إداري فعليين" />
    <Card><Field label="معرّف المادة" value={course.slug} onChangeText={(value) => setCourse({ ...course, slug: value.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() })} placeholder="course-slug" /><Field label="اسم المادة" value={course.title} onChangeText={(value) => setCourse({ ...course, title: value })} /><Field label="الاسم الإنجليزي" value={course.titleEn} onChangeText={(value) => setCourse({ ...course, titleEn: value })} /><Field label="رمز المادة" value={course.code} onChangeText={(value) => setCourse({ ...course, code: value })} /><SearchPicker label="الجهة" value={course.institutionSlug} placeholder="اختر الجهة" items={data.institutions.map((row) => ({ key: row.slug, label: row.name, detail: row.region }))} onSelect={(item) => setCourse({ ...course, institutionSlug: item.key })} /><SearchPicker label="التخصص" value={course.specialtySlug} placeholder="اختر التخصص" items={data.specialties.map((row) => ({ key: row.slug, label: row.name }))} onSelect={(item) => setCourse({ ...course, specialtySlug: item.key })} /><TextInput value={course.description} onChangeText={(value) => setCourse({ ...course, description: value })} placeholder="وصف المادة" placeholderTextColor={colors.textSoft} multiline textAlign="right" style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /><Field label="السعر" value={course.price} onChangeText={(value) => setCourse({ ...course, price: value })} keyboardType="decimal-pad" /><Field label="السعر السابق — اختياري" value={course.oldPrice} onChangeText={(value) => setCourse({ ...course, oldPrice: value })} keyboardType="decimal-pad" /><Field label="مدة الوصول" value={course.accessLabel} onChangeText={(value) => setCourse({ ...course, accessLabel: value })} /><AppButton title="حفظ المادة" disabled={course.slug.length < 2 || course.title.length < 3 || !course.institutionSlug || !course.specialtySlug || !course.price} onPress={() => mutate({ action: "saveCourse", ...course, price: Number(course.price), oldPrice: Number(course.oldPrice), status: "draft", featured: false, coverTheme: "blue-violet" }, "تم حفظ المادة كمسودة")} /></Card>
    <SectionTitle title="الجهات الحالية" subtitle="نشر وإخفاء وتمييز الصفحات" />
    {data.institutions.slice(0, 25).map((row) => <Card key={row.slug} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.name}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.region} · {row.type} · {row.status}</Text><View style={styles.actionRow}><AppButton full={false} title={row.featured ? "إلغاء التمييز" : "تمييز"} variant="soft" onPress={() => mutate(institutionPayload(row, row.status, !row.featured))} /><AppButton full={false} title={row.status === "published" ? "إخفاء" : "نشر"} variant="ghost" onPress={() => mutate(institutionPayload(row, row.status === "published" ? "hidden" : "published", Boolean(row.featured)))} /></View></Card>)}
    <SectionTitle title="المواد الحالية" />
    {data.courses.filter((row) => row.specialtySlug).slice(0, 25).map((row) => <Card key={row.slug} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.title}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.university} · {row.price} ر.س · {row.status}</Text><View style={styles.actionRow}><AppButton full={false} title={row.featured ? "إلغاء التمييز" : "تمييز"} variant="soft" onPress={() => mutate(coursePayload(row, row.status, !row.featured))} /><AppButton full={false} title={row.status === "published" ? "إخفاء" : "نشر"} variant="ghost" onPress={() => mutate(coursePayload(row, row.status === "published" ? "hidden" : "published", Boolean(row.featured)))} /></View></Card>)}
  </>;
}

function institutionPayload(row: AdminData["institutions"][number], status: string, featured: boolean) { return { action: "saveInstitution", slug: row.slug, name: row.name, nameEn: row.nameEn, region: row.region, type: row.type, domain: row.domain || "", logoUrl: row.logo || "", status, featured }; }
function coursePayload(row: AdminData["courses"][number], status: string, featured: boolean) { return { action: "saveCourse", slug: row.slug, institutionSlug: row.universitySlug, specialtySlug: row.specialtySlug, title: row.title, titleEn: row.titleEn, code: row.code || "", description: row.description, price: row.price, oldPrice: row.oldPrice || 0, accessLabel: row.access, status, featured, coverTheme: row.coverTheme }; }

function Commerce({ data, colors, mutate }: { data: AdminData; colors: Colors; mutate: Mutate }) {
  const students = data.users.filter((row) => row.role === "student");
  const [access, setAccess] = useState({ userEmail: "", courseSlug: "", expiresAt: "" });
  const [coupon, setCoupon] = useState({ code: "", type: "percent", value: "", courseSlug: "", usageLimit: "" });
  return <>
    <SectionTitle title="منح صلاحية مادة" subtitle="تُسجل العملية وتصل للطالب بإشعار فوري" />
    <Card><SearchPicker label="الطالب" value={access.userEmail} placeholder="اختر حساب الطالب" items={students.map((row) => ({ key: row.email, label: row.fullName, detail: row.email }))} onSelect={(item) => setAccess({ ...access, userEmail: item.key })} /><SearchPicker label="المادة" value={access.courseSlug} placeholder="اختر المادة" items={data.courses.map((row) => ({ key: row.slug, label: row.title, detail: row.university }))} onSelect={(item) => setAccess({ ...access, courseSlug: item.key })} /><Field label="انتهاء الصلاحية — اختياري" value={access.expiresAt} onChangeText={(value) => setAccess({ ...access, expiresAt: value })} placeholder="2027-01-31T23:59:00Z" autoCapitalize="none" /><AppButton title="منح المادة" icon="key-outline" disabled={!access.userEmail || !access.courseSlug} onPress={() => mutate({ action: "grantAccess", ...access }, "تم منح المادة وإشعار الطالب")} /></Card>
    <SectionTitle title="إنشاء كوبون" />
    <Card><Field label="كود الخصم" value={coupon.code} onChangeText={(value) => setCoupon({ ...coupon, code: value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} autoCapitalize="characters" /><ChoiceRow values={["percent", "fixed"]} selected={coupon.type} onSelect={(value) => setCoupon({ ...coupon, type: value })} colors={colors} /><Field label={coupon.type === "percent" ? "النسبة" : "المبلغ"} value={coupon.value} onChangeText={(value) => setCoupon({ ...coupon, value })} keyboardType="decimal-pad" /><SearchPicker label="مادة محددة — اختياري" value={coupon.courseSlug} placeholder="كل المواد" items={data.courses.map((row) => ({ key: row.slug, label: row.title, detail: row.university }))} onSelect={(item) => setCoupon({ ...coupon, courseSlug: item.key })} /><Field label="حد الاستخدام — اختياري" value={coupon.usageLimit} onChangeText={(value) => setCoupon({ ...coupon, usageLimit: value })} keyboardType="number-pad" /><AppButton title="حفظ الكوبون" disabled={coupon.code.length < 3 || !coupon.value} onPress={() => mutate({ action: "saveCoupon", ...coupon, value: Number(coupon.value), usageLimit: Number(coupon.usageLimit) }, "تم حفظ الكوبون")} /></Card>
    <SectionTitle title="الكوبونات الحالية" />
    {data.coupons.map((row) => <Card key={row.id} style={styles.dataCard}><Text style={[styles.dataTitle, { color: colors.text }]}>{row.code}</Text><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.type === "percent" ? `${row.value}%` : `${row.value} ر.س`} · استُخدم {row.usedCount}{row.usageLimit ? `/${row.usageLimit}` : ""} · {row.status}</Text></Card>)}
    <SectionTitle title="آخر الطلبات" subtitle={`${data.metrics.paidOrders} مدفوعة من ${data.metrics.orders}`} />
    {data.orders.slice(0, 50).map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={[styles.role, { color: row.status === "paid" ? colors.success : colors.warning }]}>{row.status}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>#{row.orderNumber}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{row.customerEmail} · {data.courses.find((course) => course.slug === row.courseSlug)?.title || row.courseSlug}</Text><Text style={[styles.amount, { color: colors.text }]}>{row.total.toLocaleString("ar-SA")} ر.س</Text></Card>)}
  </>;
}

function Reviews({ data, colors, mutate }: { data: AdminData; colors: Colors; mutate: Mutate }) {
  return <><SectionTitle title="التقييمات الموثقة" subtitle="تنشر فقط آراء أصحاب الشراء والتقدم الحقيقيين" />{data.reviews.map((row) => <Card key={row.id} style={styles.dataCard}><View style={styles.dataHead}><Text style={styles.stars}>{"★".repeat(row.rating)}</Text><Text style={[styles.dataTitle, { color: colors.text }]}>{row.userEmail}</Text></View><Text style={[styles.dataMeta, { color: colors.textSoft }]}>{data.courses.find((course) => course.slug === row.courseSlug)?.title || row.courseSlug} · {row.status}</Text><Text style={[styles.ticketBody, { color: colors.text }]}>{row.body}</Text><View style={styles.actionRow}><AppButton full={false} title="نشر" variant="soft" onPress={() => mutate({ action: "updateReview", id: row.id, status: "published" }, "تم نشر التقييم")} /><AppButton full={false} title="رفض" variant="danger" onPress={() => mutate({ action: "updateReview", id: row.id, status: "rejected" }, "تم رفض التقييم")} /><AppButton full={false} title="تعليق" variant="ghost" onPress={() => mutate({ action: "updateReview", id: row.id, status: "pending" })} /></View></Card>)}</>;
}

function Communication({ data, colors, mutate }: { data: AdminData; colors: Colors; mutate: Mutate }) {
  const [settings, setSettings] = useState({ whatsapp_number: data.settings.whatsapp_number || "", support_email: data.settings.support_email || "", support_hours: data.settings.support_hours || "", social_x: data.settings.social_x || "", social_instagram: data.settings.social_instagram || "", social_tiktok: data.settings.social_tiktok || "", social_telegram: data.settings.social_telegram || "" });
  const [notice, setNotice] = useState({ title: "", body: "", audience: "student", userEmail: "", actionUrl: "/notifications" });
  return <><SectionTitle title="الدعم والتواصل" /><Card><Field label="رقم واتساب" value={settings.whatsapp_number} onChangeText={(value) => setSettings({ ...settings, whatsapp_number: value })} /><Field label="بريد الدعم" value={settings.support_email} onChangeText={(value) => setSettings({ ...settings, support_email: value })} /><Field label="ساعات العمل" value={settings.support_hours} onChangeText={(value) => setSettings({ ...settings, support_hours: value })} /><Field label="رابط X" value={settings.social_x} onChangeText={(value) => setSettings({ ...settings, social_x: value })} /><Field label="رابط Instagram" value={settings.social_instagram} onChangeText={(value) => setSettings({ ...settings, social_instagram: value })} /><Field label="رابط TikTok" value={settings.social_tiktok} onChangeText={(value) => setSettings({ ...settings, social_tiktok: value })} /><Field label="رابط Telegram" value={settings.social_telegram} onChangeText={(value) => setSettings({ ...settings, social_telegram: value })} /><AppButton title="حفظ روابط التواصل" onPress={() => mutate({ action: "saveSettings", values: settings })} /></Card><SectionTitle title="إشعار فوري" subtitle="يظهر داخل التطبيق ويصل Push للأجهزة المسجلة" /><Card><ChoiceRow values={["student", "supervisor", "admin"]} selected={notice.audience} onSelect={(value) => setNotice({ ...notice, audience: value })} colors={colors} /><Field label="بريد محدد — اختياري" value={notice.userEmail} onChangeText={(value) => setNotice({ ...notice, userEmail: value })} keyboardType="email-address" autoCapitalize="none" /><Field label="عنوان الإشعار" value={notice.title} onChangeText={(value) => setNotice({ ...notice, title: value })} /><TextInput value={notice.body} onChangeText={(value) => setNotice({ ...notice, body: value })} placeholder="نص الإشعار" placeholderTextColor={colors.textSoft} multiline textAlign="right" style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /><Field label="الرابط الداخلي" value={notice.actionUrl} onChangeText={(value) => setNotice({ ...notice, actionUrl: value })} /><AppButton title="إرسال الإشعار" icon="send-outline" disabled={notice.title.length < 3 || notice.body.length < 3} onPress={() => mutate({ action: "createNotification", ...notice, userEmail: notice.userEmail || null }, "تم إرسال الإشعار")} /></Card></>;
}

function ChoiceRow({ values, selected, onSelect, colors }: { values: string[]; selected: string; onSelect: (value: string) => void; colors: Colors }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.choice, { backgroundColor: selected === value ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: selected === value ? "#FFF" : colors.text, fontSize: 9, fontWeight: "800" }}>{value}</Text></Pressable>)}</ScrollView>;
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingBottom: 14 }, tab: { minWidth: 88, minHeight: 56, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 5 }, message: { fontSize: 10, textAlign: "center", marginBottom: 8, fontWeight: "800" },
  metricGrid: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }, metric: { width: "48%", minHeight: 130, alignItems: "flex-end" }, metricValue: { fontSize: 20, fontWeight: "900", marginTop: 12 }, metricLabel: { fontSize: 9, marginTop: 4 },
  queue: { minHeight: 54, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, queueValue: { fontSize: 18, fontWeight: "900" }, queueLabel: { fontSize: 11, fontWeight: "800" }, service: { minHeight: 50, flexDirection: "row-reverse", alignItems: "center", gap: 9 }, serviceText: { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "right" },
  dataCard: { marginBottom: 9 }, dataHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, dataTitle: { flex: 1, fontSize: 13, fontWeight: "900", textAlign: "right" }, role: { fontSize: 9, fontWeight: "900" }, dataMeta: { fontSize: 8, textAlign: "right", marginTop: 5 }, actionRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginTop: 12 }, statuses: { gap: 6, marginTop: 11 }, status: { minHeight: 34, borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  ticketBody: { fontSize: 10, lineHeight: 18, textAlign: "right", marginTop: 9 }, area: { minHeight: 90, borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 11, marginBottom: 12, textAlignVertical: "top", writingDirection: "rtl" }, choices: { flexDirection: "row-reverse", gap: 7, paddingBottom: 12 }, choice: { minHeight: 36, borderRadius: 11, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, spacer: { height: 10 }, amount: { fontSize: 15, fontWeight: "900", textAlign: "right", marginTop: 10 }, stars: { color: "#F7A810", letterSpacing: 2 },
});
