import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { AppButton, Card, EmptyState, Field, LoadingState, SectionTitle } from "@/src/components/ui";
import { ADMIN_STEP_UP_MESSAGE, api, ApiError, isAdminStepUpError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

type StepUp = (message: string) => void;

const money = (value: number, currency = "SAR") => `${Number(value || 0).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ${currency === "SAR" ? "ر.س" : currency}`;
const dateLabel = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("ar-SA") : "—";

function useAdminMutation(onStepUpRequired?: StepUp) {
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setFeedback("");
    try { await action(); setFeedback(success); return true; }
    catch (reason) {
      if (isAdminStepUpError(reason)) { setFeedback(ADMIN_STEP_UP_MESSAGE); onStepUpRequired?.(reason.message); return false; }
      setFeedback(reason instanceof ApiError ? reason.message : "تعذر تنفيذ الإجراء");
      return false;
    } finally { setBusy(""); }
  };
  return { busy, feedback, run };
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: React.ComponentProps<typeof Ionicons>["name"] }) {
  const { colors } = useTheme();
  return <Card style={styles.metric}><Ionicons name={icon} size={20} color={colors.primary} /><Text style={[styles.metricValue, { color: colors.text }]}>{typeof value === "number" ? value.toLocaleString("ar-SA") : value}</Text><Text style={[styles.metricLabel, { color: colors.textSoft }]}>{label}</Text></Card>;
}

function Feedback({ text }: { text: string }) {
  const { colors } = useTheme();
  if (!text) return null;
  return <Text style={[styles.feedback, { color: text.startsWith("تم") || text.startsWith("أُ") ? colors.success : colors.danger }]}>{text}</Text>;
}

// ---------------------------------------------------------------- Finance

type FinanceQueueItem = { orderNumber: string; customerName: string; customerEmail: string; total: number; paymentLabel: string; createdAt: string; ageHours: number };
type FinanceOrder = { orderNumber: string; date: string; customerName: string; customerEmail: string; status: string; statusLabel: string; paymentLabel: string; courses: string; gross: number; refund: number; net: number; currency: string };
type FinanceData = {
  metrics: { gross: number; refunds: number; net: number; discounts: number; tax: number; capturedOrders: number; averageOrderValue: number; unresolvedRefundOrders: number; aiNet?: number; aiPaidOrders?: number };
  queue: { verificationPending: FinanceQueueItem[]; paymentReview: FinanceQueueItem[] };
  orders: FinanceOrder[];
  aiSubscriptions?: { paidOrders: number; net: number; orders: number };
};
type RefundRow = { id: number; requestNumber: string; orderNumber: string; requestedByEmail: string; amountMinor: number; currency: string; reason: string; status: string; createdAt: string; approvals: { approverEmail: string; decision: string }[] };
const refundStatusLabels: Record<string, string> = { pending: "بانتظار المراجعة", first_approved: "موافقة أولى", approved_pending_provider: "مكتمل الموافقات", provider_processing: "جارٍ الإرسال إلى Tap", provider_pending: "قيد المعالجة لدى Tap", provider_failed: "تعذر الإرسال", completed: "مكتمل", rejected: "مرفوض" };

export function AdminFinance({ onStepUpRequired }: { onStepUpRequired?: StepUp }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const finance = useQuery({ queryKey: ["admin-finance", search], queryFn: () => api<FinanceData>(`/api/admin/finance${search ? `?search=${encodeURIComponent(search)}` : ""}`) });
  const refunds = useQuery({ queryKey: ["admin-finance", "refunds"], queryFn: () => api<{ requests: RefundRow[] }>("/api/admin/refunds") });
  const { busy, feedback, run } = useAdminMutation(onStepUpRequired);
  const [refundForm, setRefundForm] = useState({ orderNumber: "", amount: "", reason: "" });
  const refreshAll = () => { void client.invalidateQueries({ queryKey: ["admin-finance"] }); };
  const approveReview = (item: FinanceQueueItem) => Alert.prompt?.("سبب اعتماد الدفعة", "سيُفعّل المحتوى وتصدر الفاتورة ويُشعر الطالب.", async (reason) => { if (!reason?.trim()) return; const ok = await run(`approve-${item.orderNumber}`, () => api("/api/admin/finance", { method: "POST", body: jsonBody({ action: "resolvePaymentReview", orderNumber: item.orderNumber, decision: "approve", reason: reason.trim() }) }), "تم اعتماد الدفعة وتفعيل المواد."); if (ok) refreshAll(); }, "plain-text", "تم التحقق من التحصيل في لوحة Tap") ?? void run(`approve-${item.orderNumber}`, () => api("/api/admin/finance", { method: "POST", body: jsonBody({ action: "resolvePaymentReview", orderNumber: item.orderNumber, decision: "approve", reason: "تم التحقق من التحصيل في لوحة Tap" }) }), "تم اعتماد الدفعة وتفعيل المواد.").then((ok) => { if (ok) refreshAll(); });
  if (finance.isLoading) return <LoadingState label="جارٍ تحميل المركز المالي..." />;
  if (finance.isError || !finance.data) return <EmptyState icon="cloud-offline-outline" title="تعذر تحميل المركز المالي" text={finance.error instanceof ApiError ? finance.error.message : "حاول مرة أخرى."} action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void finance.refetch()} />} />;
  const data = finance.data;
  const queue = [...data.queue.paymentReview.map((item) => ({ ...item, kind: "review" as const })), ...data.queue.verificationPending.map((item) => ({ ...item, kind: "verification" as const }))];
  return <>
    <View style={styles.metrics}><Metric label="إجمالي المحصل" value={money(data.metrics.gross)} icon="trending-up-outline" /><Metric label="الاستردادات" value={money(data.metrics.refunds)} icon="trending-down-outline" /><Metric label="صافي المبيعات" value={money(data.metrics.net)} icon="cash-outline" /><Metric label="طلبات محصلة" value={data.metrics.capturedOrders} icon="receipt-outline" /><Metric label="اشتراكات أدوات مراس" value={money(data.metrics.aiNet || 0)} icon="sparkles-outline" /><Metric label="متوسط الطلب" value={money(data.metrics.averageOrderValue)} icon="stats-chart-outline" /></View>
    <Feedback text={feedback} />
    <SectionTitle title="طابور المراجعة المالية" subtitle="دفعات محصلة أو بانتظار تأكيد البوابة تحتاج قرارًا" />
    {queue.length ? <View style={styles.list}>{queue.map((item) => <Card key={item.orderNumber} style={styles.rowCard}><View style={styles.rowHead}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{item.customerName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{item.orderNumber} · {item.paymentLabel} · منذ {item.ageHours} ساعة</Text></View><Text style={[styles.amount, { color: colors.primary }]}>{money(item.total)}</Text></View><Text style={[styles.rowMeta, { color: item.kind === "review" ? colors.warning : colors.textSoft }]}>{item.kind === "review" ? "استُلمت الدفعة وتوقف التفعيل (كوبون أو اشتراك قائم)" : "لم تؤكد بوابة الدفع النتيجة بعد"}</Text><View style={styles.actions}><AppButton full={false} title="اعتماد الدفعة وتفعيل المواد" icon="checkmark-circle-outline" loading={busy === `approve-${item.orderNumber}`} onPress={() => approveReview(item)} /><AppButton full={false} title="طلب استرداد" variant="soft" onPress={() => setRefundForm({ orderNumber: item.orderNumber, amount: String(item.total), reason: `قرار المراجعة المالية للطلب ${item.orderNumber}: ` })} /></View></Card>)}</View> : <EmptyState icon="checkmark-done-outline" title="لا توجد طلبات تحتاج قرارًا" text="كل الدفعات المحصلة مفعّلة." />}
    <SectionTitle title="طلب استرداد جديد" subtitle="يمر بموافقتين مستقلتين ثم يُنفذ عبر Tap" />
    <Card><Field label="رقم الطلب" value={refundForm.orderNumber} onChangeText={(orderNumber) => setRefundForm({ ...refundForm, orderNumber })} autoCapitalize="characters" inputDirection="ltr" /><Field label="المبلغ بالريال" keyboardType="decimal-pad" value={refundForm.amount} onChangeText={(amount) => setRefundForm({ ...refundForm, amount: amount.replace(/[^0-9.]/g, "") })} /><TextInput multiline value={refundForm.reason} onChangeText={(reason) => setRefundForm({ ...refundForm, reason })} placeholder="سبب الاسترداد (8 أحرف على الأقل)" placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /><AppButton title="إنشاء طلب الاسترداد" icon="shield-checkmark-outline" loading={busy === "refund-create"} disabled={!refundForm.orderNumber.trim() || !Number(refundForm.amount) || refundForm.reason.trim().length < 8} onPress={() => void run("refund-create", () => api("/api/admin/refunds", { method: "POST", body: jsonBody({ action: "create", orderNumber: refundForm.orderNumber.trim(), amount: Number(refundForm.amount), reason: refundForm.reason.trim() }) }), "أُنشئ طلب الاسترداد وينتظر الموافقات.").then((ok) => { if (ok) { setRefundForm({ orderNumber: "", amount: "", reason: "" }); refreshAll(); } })} /></Card>
    <SectionTitle title="طلبات الاسترداد" subtitle={`${refunds.data?.requests.length || 0} طلب`} />
    <View style={styles.list}>{(refunds.data?.requests || []).slice(0, 40).map((row) => { const approved = row.approvals.filter((item) => item.decision === "approved").length; const reviewable = ["pending", "first_approved", "provider_failed", "approved_pending_provider"].includes(row.status); return <Card key={row.id} style={styles.rowCard}><View style={styles.rowHead}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.requestNumber}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.orderNumber} · {refundStatusLabels[row.status] || row.status} · {approved}/2 موافقات</Text></View><Text style={[styles.amount, { color: colors.primary }]}>{money(row.amountMinor / 100, row.currency)}</Text></View><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.reason}</Text>{reviewable ? <View style={styles.actions}><AppButton full={false} title="اعتماد" variant="soft" loading={busy === `refund-approve-${row.id}`} onPress={() => void run(`refund-approve-${row.id}`, () => api("/api/admin/refunds", { method: "POST", body: jsonBody({ action: "approve", id: row.id }) }), "تم اعتماد طلب الاسترداد.").then((ok) => { if (ok) refreshAll(); })} /><AppButton full={false} title="رفض" variant="danger" onPress={() => Alert.prompt?.("سبب الرفض", undefined, (note) => { if (note?.trim()) void run(`refund-reject-${row.id}`, () => api("/api/admin/refunds", { method: "POST", body: jsonBody({ action: "reject", id: row.id, note: note.trim() }) }), "تم رفض طلب الاسترداد.").then((ok) => { if (ok) refreshAll(); }); }) ?? void run(`refund-reject-${row.id}`, () => api("/api/admin/refunds", { method: "POST", body: jsonBody({ action: "reject", id: row.id, note: "مرفوض من التطبيق" }) }), "تم رفض طلب الاسترداد.").then((ok) => { if (ok) refreshAll(); })} /></View> : null}</Card>; })}{!refunds.data?.requests.length ? <EmptyState icon="receipt-outline" title="لا توجد طلبات استرداد" text="تظهر هنا الطلبات وحالة موافقاتها." /> : null}</View>
    <SectionTitle title="آخر الطلبات المالية" subtitle="ابحث برقم الطلب أو الطالب" />
    <Field label="بحث" value={search} onChangeText={setSearch} placeholder="رقم الطلب أو البريد" autoCapitalize="none" />
    <View style={styles.list}>{data.orders.slice(0, 30).map((order) => <Card key={order.orderNumber} style={styles.rowCard}><View style={styles.rowHead}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{order.customerName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{order.orderNumber} · {order.statusLabel} · {dateLabel(order.date)}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{order.courses}</Text></View><View><Text style={[styles.amount, { color: colors.primary }]}>{money(order.net, order.currency)}</Text>{order.refund > 0 ? <Text style={[styles.rowMeta, { color: colors.danger }]}>مسترد {money(order.refund, order.currency)}</Text> : null}</View></View></Card>)}</View>
  </>;
}

// ---------------------------------------------------------------- Operations

type OperationsData = { waitlist: Record<string, number>; bundles: Record<string, number>; queues: { filesPendingScan: number; abandonedCheckout: number; expiringAccess: number; pushPending: number; refundPending: number; settlementUnmatched: number } };
type SupportMetrics = { summary: { total: number; open: number; responseBreached: number; resolutionBreached: number; averageFirstResponseMinutes: number | null; resolved: number }; queues: { category: string; count: number; overdue: number }[] };
type AnalyticsData = { totals: Record<string, number>; funnel: { event: string; label: string; actors: number; conversionFromPrevious: number | null }[]; topCourses: { courseSlug: string | null; events: number; actors: number }[] };
const categoryLabels: Record<string, string> = { technical: "تقني", payment: "الدفع", course: "المحتوى", account: "الحساب", other: "أخرى", suggestion: "اقتراح" };

export function AdminOperations({ onStepUpRequired }: { onStepUpRequired?: StepUp }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const summary = useQuery({ queryKey: ["admin-operations", "summary"], queryFn: () => api<OperationsData>("/api/admin/operations/summary") });
  const support = useQuery({ queryKey: ["admin-operations", "support"], queryFn: () => api<SupportMetrics>("/api/admin/support/metrics") });
  const analytics = useQuery({ queryKey: ["admin-operations", "analytics"], queryFn: () => api<AnalyticsData>("/api/admin/analytics?days=30") });
  const { busy, feedback, run } = useAdminMutation(onStepUpRequired);
  const runTask = (key: string, path: string, label: string) => void run(key, () => api(path, { method: "POST" }), label).then((ok) => { if (ok) void client.invalidateQueries({ queryKey: ["admin-operations"] }); });
  if (summary.isLoading) return <LoadingState label="جارٍ تحميل مركز التشغيل..." />;
  if (summary.isError || !summary.data) return <EmptyState icon="cloud-offline-outline" title="تعذر تحميل مركز التشغيل" text={summary.error instanceof ApiError ? summary.error.message : "حاول مرة أخرى."} action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void summary.refetch()} />} />;
  const queues = summary.data.queues;
  return <>
    <View style={styles.metrics}><Metric label="سلال متروكة" value={queues.abandonedCheckout} icon="cart-outline" /><Metric label="وصول ينتهي قريبًا" value={queues.expiringAccess} icon="hourglass-outline" /><Metric label="مرفقات تنتظر الفحص" value={queues.filesPendingScan} icon="shield-half-outline" /><Metric label="إشعارات معلقة" value={queues.pushPending} icon="notifications-outline" /><Metric label="استردادات معلقة" value={queues.refundPending} icon="cash-outline" /><Metric label="تسويات غير مطابقة" value={queues.settlementUnmatched} icon="git-compare-outline" /><Metric label="قائمة انتظار نشطة" value={summary.data.waitlist.active || 0} icon="people-outline" /><Metric label="باقات منشورة" value={summary.data.bundles.published || 0} icon="cube-outline" /></View>
    <Feedback text={feedback} />
    <SectionTitle title="تشغيل المهام الآمنة" subtitle="تعمل أيضًا تلقائيًا عبر المجدول الداخلي كل بضع دقائق" />
    <View style={styles.actions}><AppButton full={false} title="تنبيهات السلة والتجديد والإطلاق" icon="alarm-outline" loading={busy === "lifecycle"} onPress={() => runTask("lifecycle", "/api/admin/lifecycle/dispatch", "تم تشغيل تنبيهات دورة الحياة.")} /><AppButton full={false} title="فحص المرفقات" icon="scan-outline" variant="soft" loading={busy === "scan"} onPress={() => runTask("scan", "/api/admin/files/scan", "تم فحص دفعة المرفقات المعلقة.")} /><AppButton full={false} title="إرسال Push المستحق" icon="send-outline" variant="soft" loading={busy === "push"} onPress={() => runTask("push", "/api/admin/notifications/dispatch", "تم إرسال الإشعارات الفورية المستحقة.")} /></View>
    <SectionTitle title="تشغيل الدعم وSLA" subtitle={support.data ? `${support.data.summary.open} مفتوحة · ${support.data.summary.resolved} محلولة` : "…"} />
    {support.data ? <><View style={styles.metrics}><Metric label="تجاوز الرد" value={support.data.summary.responseBreached} icon="alert-circle-outline" /><Metric label="تجاوز الحل" value={support.data.summary.resolutionBreached} icon="time-outline" /><Metric label="متوسط أول رد" value={support.data.summary.averageFirstResponseMinutes === null ? "—" : `${support.data.summary.averageFirstResponseMinutes} د`} icon="chatbubble-ellipses-outline" /></View><View style={styles.list}>{support.data.queues.map((row) => <Card key={row.category} style={styles.rowCard}><View style={styles.rowHead}><Text style={[styles.rowTitle, { color: colors.text }]}>{categoryLabels[row.category] || row.category}</Text><Text style={[styles.amount, { color: row.overdue ? colors.danger : colors.success }]}>{row.count} · {row.overdue ? `${row.overdue} متأخرة` : "ضمن SLA"}</Text></View></Card>)}</View></> : null}
    <SectionTitle title="قمع التحويل · 30 يومًا" subtitle="من زيارة المادة حتى الدفع" />
    {analytics.data ? <View style={styles.list}>{analytics.data.funnel.map((row) => <Card key={row.event} style={styles.rowCard}><View style={styles.rowHead}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.label}</Text><Text style={[styles.amount, { color: colors.primary }]}>{row.actors.toLocaleString("ar-SA")}{row.conversionFromPrevious === null ? "" : ` · ${row.conversionFromPrevious}%`}</Text></View></Card>)}{analytics.data.topCourses.length ? <Card><Text style={[styles.rowTitle, { color: colors.text }]}>المواد الأعلى نشاطًا</Text>{analytics.data.topCourses.slice(0, 6).map((row) => <Text key={row.courseSlug || "none"} style={[styles.rowMeta, { color: colors.textSoft }]}>{row.courseSlug || "غير محدد"} · {row.actors} مستخدم · {row.events} حدث</Text>)}</Card> : null}</View> : null}
  </>;
}

// ---------------------------------------------------------------- Learning tracks

type Track = { id: number; slug: string; title: string; subtitle: string; description: string; category: string; iconKey: string; accent: string; status: string; ctaLabel: string; destination: string | null; position: number; featured: boolean; showInterestCount: boolean; releaseVersion: number; launchAt: string | null; interests: { active: number; total: number } };
const trackStatusLabels: Record<string, string> = { draft: "مسودة", coming_soon: "قريبًا", enrollment_open: "التسجيل مفتوح", available: "متاح", archived: "مؤرشف" };
const trackStatuses = ["draft", "coming_soon", "enrollment_open", "available", "archived"];
const trackCategories = ["language", "foundation", "university", "career", "exam", "skills"];
const trackCategoryLabels: Record<string, string> = { language: "اللغات", foundation: "التأسيس", university: "الجامعة", career: "المهنة", exam: "الاختبارات", skills: "المهارات" };
type TrackDraft = { slug: string; title: string; subtitle: string; description: string; category: string; status: string; ctaLabel: string; destination: string; position: string; featured: boolean; showInterestCount: boolean };
const emptyTrack: TrackDraft = { slug: "", title: "", subtitle: "", description: "", category: "language", status: "coming_soon", ctaLabel: "أبلغني عند الإطلاق", destination: "", position: "100", featured: false, showInterestCount: false };

function Chips({ values, selected, labels, onChange }: { values: string[]; selected: string; labels: Record<string, string>; onChange: (value: string) => void }) {
  const { colors } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{values.map((value) => <Pressable key={value} onPress={() => onChange(value)} style={[styles.chip, { backgroundColor: selected === value ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: selected === value ? "#FFF" : colors.text, fontSize: 9, fontWeight: "900" }}>{labels[value] || value}</Text></Pressable>)}</ScrollView>;
}

export function AdminLearningTracks({ onStepUpRequired }: { onStepUpRequired?: StepUp }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const tracks = useQuery({ queryKey: ["admin-learning-tracks"], queryFn: () => api<{ tracks: Track[] }>("/api/admin/learning-tracks") });
  const { busy, feedback, run } = useAdminMutation(onStepUpRequired);
  const [draft, setDraft] = useState<TrackDraft>(emptyTrack);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [interestTrack, setInterestTrack] = useState<Track | null>(null);
  const interests = useQuery({ queryKey: ["admin-learning-tracks", "interests", interestTrack?.id], queryFn: () => api<{ interests: { id: number; email: string; fullName: string; status: string; createdAt: string; lastNotifiedVersion: number }[] }>(`/api/admin/learning-tracks?track=${interestTrack!.id}`), enabled: Boolean(interestTrack) });
  const refresh = () => { void client.invalidateQueries({ queryKey: ["admin-learning-tracks"] }); };
  const payload = (row?: Track) => ({ ...(row ? { iconKey: row.iconKey, accent: row.accent, showInterestCount: row.showInterestCount, launchAt: row.launchAt } : { iconKey: "sparkles", accent: "blue", showInterestCount: draft.showInterestCount, launchAt: null }), slug: draft.slug.trim().toLowerCase(), title: draft.title.trim(), subtitle: draft.subtitle.trim(), description: draft.description.trim(), category: draft.category, status: draft.status, ctaLabel: draft.ctaLabel.trim() || "أبلغني عند الإطلاق", destination: draft.destination.trim() || null, position: Number(draft.position) || 100, featured: draft.featured, showInterestCount: draft.showInterestCount });
  const save = async () => {
    const row = tracks.data?.tracks.find((item) => item.id === editingId);
    const ok = await run("save", () => api("/api/admin/learning-tracks", { method: editingId ? "PATCH" : "POST", body: jsonBody({ ...payload(row), id: editingId ?? undefined }) }), editingId ? "تم تحديث المسار." : "تم إنشاء المسار.");
    if (ok) { setDraft(emptyTrack); setEditingId(null); refresh(); }
  };
  const edit = (row: Track) => { setEditingId(row.id); setDraft({ slug: row.slug, title: row.title, subtitle: row.subtitle, description: row.description, category: row.category, status: row.status, ctaLabel: row.ctaLabel, destination: row.destination || "", position: String(row.position), featured: row.featured, showInterestCount: row.showInterestCount }); };
  if (tracks.isLoading) return <LoadingState label="جارٍ تحميل المسارات..." />;
  if (tracks.isError || !tracks.data) return <EmptyState icon="cloud-offline-outline" title="تعذر تحميل المسارات" text={tracks.error instanceof ApiError ? tracks.error.message : "حاول مرة أخرى."} action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void tracks.refetch()} />} />;
  return <>
    <Feedback text={feedback} />
    <SectionTitle title={editingId ? "تعديل المسار" : "مسار جديد"} subtitle="يظهر للطلاب في الرئيسية وتبويب الحساب، ويُشعر المهتمون عند فتح التسجيل" />
    <Card>
      <Field label="اسم المسار" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} />
      <Field label="المعرّف الإنجليزي" value={draft.slug} autoCapitalize="none" inputDirection="ltr" onChangeText={(slug) => setDraft({ ...draft, slug: slug.toLowerCase().replace(/[^a-z0-9._-]/g, "-") })} />
      <Field label="العنوان المختصر" value={draft.subtitle} onChangeText={(subtitle) => setDraft({ ...draft, subtitle })} />
      <TextInput multiline value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} placeholder="وصف المسار" placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
      <Text style={[styles.caption, { color: colors.textSoft }]}>التصنيف</Text><Chips values={trackCategories} selected={draft.category} labels={trackCategoryLabels} onChange={(category) => setDraft({ ...draft, category })} />
      <Text style={[styles.caption, { color: colors.textSoft }]}>الحالة</Text><Chips values={trackStatuses} selected={draft.status} labels={trackStatusLabels} onChange={(status) => setDraft({ ...draft, status })} />
      <Field label="نص الزر" value={draft.ctaLabel} onChangeText={(ctaLabel) => setDraft({ ...draft, ctaLabel })} />
      <Field label="رابط الوجهة — اختياري" value={draft.destination} autoCapitalize="none" inputDirection="ltr" onChangeText={(destination) => setDraft({ ...draft, destination })} />
      <Field label="الترتيب" keyboardType="number-pad" value={draft.position} onChangeText={(position) => setDraft({ ...draft, position: position.replace(/\D/g, "") })} />
      <Chips values={["featured", "normal"]} selected={draft.featured ? "featured" : "normal"} labels={{ featured: "مسار مميز", normal: "عادي" }} onChange={(value) => setDraft({ ...draft, featured: value === "featured" })} />
      <Chips values={["show", "hide"]} selected={draft.showInterestCount ? "show" : "hide"} labels={{ show: "إظهار عدد المهتمين", hide: "إخفاء العدد" }} onChange={(value) => setDraft({ ...draft, showInterestCount: value === "show" })} />
      <View style={styles.actions}><AppButton full={false} title={editingId ? "حفظ التعديلات" : "إنشاء المسار"} icon={editingId ? "save-outline" : "add-circle-outline"} loading={busy === "save"} disabled={!draft.title.trim() || !draft.slug.trim()} onPress={() => void save()} />{editingId ? <AppButton full={false} title="إلغاء" variant="ghost" onPress={() => { setEditingId(null); setDraft(emptyTrack); }} /> : null}</View>
    </Card>
    <SectionTitle title="كل المسارات" subtitle={`${tracks.data.tracks.length} مسار`} />
    <View style={styles.list}>{tracks.data.tracks.map((row) => <Card key={row.id} style={styles.rowCard}><View style={styles.rowHead}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{trackCategoryLabels[row.category] || row.category} · {trackStatusLabels[row.status] || row.status} · {row.interests.active} مهتم · ترتيب {row.position}{row.featured ? " · مميز" : ""}</Text></View></View>{row.subtitle ? <Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.subtitle}</Text> : null}<View style={styles.actions}><AppButton full={false} title="تعديل" icon="create-outline" variant="soft" onPress={() => edit(row)} /><AppButton full={false} title={`المهتمون (${row.interests.total})`} icon="people-outline" variant="ghost" onPress={() => setInterestTrack(interestTrack?.id === row.id ? null : row)} />{row.status !== "archived" ? <AppButton full={false} title="أرشفة" variant="danger" loading={busy === `archive-${row.id}`} onPress={() => void run(`archive-${row.id}`, () => api("/api/admin/learning-tracks", { method: "PATCH", body: jsonBody({ ...row, status: "archived" }) }), "تمت أرشفة المسار.").then((ok) => { if (ok) refresh(); })} /> : null}</View>{interestTrack?.id === row.id ? <View style={[styles.interestBox, { borderColor: colors.border }]}>{interests.isLoading ? <Text style={[styles.rowMeta, { color: colors.textSoft }]}>جارٍ تحميل المهتمين...</Text> : (interests.data?.interests || []).length ? interests.data!.interests.slice(0, 50).map((item) => <Text key={item.id} style={[styles.rowMeta, { color: colors.textSoft }]}>{item.fullName} · {item.email} · {item.status === "active" ? "مهتم" : "ألغى"} · {dateLabel(item.createdAt)}</Text>) : <Text style={[styles.rowMeta, { color: colors.textSoft }]}>لا يوجد مهتمون بعد.</Text>}</View> : null}</Card>)}</View>
  </>;
}

// ---------------------------------------------------------------- Student 360

type StudentProfile = {
  student: { id: number; email: string; phone: string | null; fullName: string; status: string; universitySlug: string | null; specialty: string | null; academicLevel: string | null; lastLoginAt: string | null; createdAt: string };
  summary: { activeSubscriptions: number; completedLessons: number; watchedSeconds: number; paidOrders: number; paidValue: number; openTickets: number; unreadNotifications: number; qualifiedReferrals?: number; activeRewards?: number; aiActive?: boolean };
  catalog: { courses: { slug: string; title: string }[] };
  subscriptions: { id: number; courseSlug: string; source: string; startsAt: string; expiresAt: string | null; suspendedAt: string | null; revokedAt: string | null }[];
  orders: { orderNumber: string; total: number; currency: string; status: string; createdAt: string }[];
  requests: { id: number; courseName: string; status: string; createdAt: string }[];
  support: { id: number; ticketNumber: string; title: string; status: string }[];
  sessions: { id: number; deviceLabel: string; platform: string; lastSeenAt: string; revokedAt: string | null; expiresAt: string }[];
  referrals?: { code: { code: string; shareCount: number } | null; referred: { id: number; status: string; referred: { fullName: string; email: string } }[]; rewards: { id: number; rewardLabel: string; status: string; coupon: { code: string } | null }[] };
  ai?: { entitlements: { id: number; source: string; status: string; expiresAt: string | null }[] };
  waitlist?: { id: number; courseSlug: string; status: string }[];
  trackInterests?: { id: number; trackTitle: string; status: string }[];
};
const orderStatusLabels: Record<string, string> = { paid: "مدفوع", pending: "معلّق", initiated: "بدأ الدفع", verification_pending: "قيد التحقق", payment_review: "قيد المراجعة", failed: "فشل", refunded: "مسترد", partially_refunded: "مسترد جزئيًا", cancelled: "ملغي" };

export function AdminStudentProfile({ email, onClose, onStepUpRequired }: { email: string; onClose: () => void; onStepUpRequired?: StepUp }) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ["admin-student", email], queryFn: () => api<StudentProfile>(`/api/admin/students/${encodeURIComponent(email)}`) });
  const { busy, feedback, run } = useAdminMutation(onStepUpRequired);
  const act = (key: string, payload: Record<string, unknown>, success: string) => void run(key, () => api("/api/admin/console", { method: "POST", body: jsonBody(payload) }), success).then((ok) => { if (ok) { void client.invalidateQueries({ queryKey: ["admin-student", email] }); void client.invalidateQueries({ queryKey: ["admin-console"] }); } });
  const courseName = useMemo(() => new Map((profile.data?.catalog.courses || []).map((course) => [course.slug, course.title])), [profile.data]);
  const loadedAt = profile.dataUpdatedAt || 0;
  if (profile.isLoading) return <LoadingState label="جارٍ جمع ملف الطالب..." />;
  if (profile.isError || !profile.data) return <EmptyState icon="cloud-offline-outline" title="تعذر تحميل ملف الطالب" text={profile.error instanceof ApiError ? profile.error.message : "حاول مرة أخرى."} action={<AppButton title="رجوع" icon="arrow-back-outline" onPress={onClose} />} />;
  const data = profile.data;
  const state = (row: StudentProfile["subscriptions"][number]) => row.revokedAt ? "ملغي" : row.suspendedAt ? "موقوف" : row.expiresAt && Date.parse(row.expiresAt) <= loadedAt ? "منتهي" : "نشط";
  return <>
    <View style={styles.actions}><AppButton full={false} title="قائمة الطلاب" icon="arrow-back-outline" variant="ghost" onPress={onClose} /><AppButton full={false} title={data.student.status === "active" ? "إيقاف الحساب" : "تفعيل الحساب"} variant={data.student.status === "active" ? "danger" : "soft"} loading={busy === "status"} onPress={() => act("status", { action: "updateUser", id: data.student.id, role: "student", status: data.student.status === "active" ? "suspended" : "active" }, data.student.status === "active" ? "تم إيقاف الحساب." : "تم تفعيل الحساب.")} /></View>
    <Card><Text style={[styles.profileName, { color: colors.text }]}>{data.student.fullName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{data.student.email} · {data.student.phone || "بدون جوال"}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{data.student.universitySlug || "بدون جامعة"} · {data.student.specialty || "بدون تخصص"} · {data.student.academicLevel || "المستوى غير محدد"}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>آخر دخول {dateLabel(data.student.lastLoginAt)} · انضم {dateLabel(data.student.createdAt)}</Text></Card>
    <Feedback text={feedback} />
    <View style={styles.metrics}><Metric label="اشتراكات نشطة" value={data.summary.activeSubscriptions} icon="shield-checkmark-outline" /><Metric label="دروس مكتملة" value={data.summary.completedLessons} icon="checkmark-done-outline" /><Metric label="قيمة المدفوعات" value={money(data.summary.paidValue)} icon="cash-outline" /><Metric label="إحالات مؤهلة" value={data.summary.qualifiedReferrals || 0} icon="gift-outline" /><Metric label="أدوات مراس" value={data.summary.aiActive ? "اشتراك نشط" : "خطة مجانية"} icon="sparkles-outline" /><Metric label="دعم مفتوح" value={data.summary.openTickets} icon="headset-outline" /></View>
    <SectionTitle title="الاشتراكات والوصول" subtitle={`${data.subscriptions.length} سجل`} />
    <View style={styles.list}>{data.subscriptions.map((row) => { const current = state(row); return <Card key={row.id} style={styles.rowCard}><View style={styles.rowHead}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{courseName.get(row.courseSlug) || row.courseSlug}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{current} · من {dateLabel(row.startsAt)} إلى {row.expiresAt ? dateLabel(row.expiresAt) : "دون انتهاء"} · {row.source === "tap" ? "شراء" : "منحة"}</Text></View></View>{!row.revokedAt ? <View style={styles.actions}>{current === "نشط" ? <AppButton full={false} title="إيقاف مؤقت" variant="soft" loading={busy === `pause-${row.id}`} onPress={() => act(`pause-${row.id}`, { action: "updateAccess", id: row.id, operation: "pause", reason: "إيقاف من التطبيق", operationKey: `${row.id}-${Date.now()}` }, "تم إيقاف الاشتراك مؤقتًا.")} /> : null}{current === "موقوف" ? <AppButton full={false} title="استئناف" variant="soft" loading={busy === `resume-${row.id}`} onPress={() => act(`resume-${row.id}`, { action: "updateAccess", id: row.id, operation: "resume", reason: "", operationKey: `${row.id}-${Date.now()}` }, "تم استئناف الاشتراك.")} /> : null}<AppButton full={false} title="+ 30 يومًا" variant="ghost" loading={busy === `extend-${row.id}`} onPress={() => act(`extend-${row.id}`, { action: "updateAccess", id: row.id, operation: "extend", reason: "", days: 30, operationKey: `${row.id}-${Date.now()}` }, "تم تمديد الاشتراك 30 يومًا.")} /></View> : null}</Card>; })}{!data.subscriptions.length ? <EmptyState icon="school-outline" title="لا توجد اشتراكات" text="يمكن منح مادة من تبويب المستخدمين." /> : null}</View>
    <SectionTitle title="الطلبات" subtitle={`${data.orders.length} طلب`} />
    <View style={styles.list}>{data.orders.slice(0, 20).map((row) => <Card key={row.orderNumber} style={styles.rowCard}><View style={styles.rowHead}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.orderNumber}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{orderStatusLabels[row.status] || row.status} · {dateLabel(row.createdAt)}</Text></View><Text style={[styles.amount, { color: colors.primary }]}>{money(row.total, row.currency)}</Text></View></Card>)}</View>
    {data.referrals ? <><SectionTitle title="الإحالات والهدايا" subtitle={`رمز ${data.referrals.code?.code || "—"} · ${data.referrals.referred.length} إحالة · ${data.referrals.rewards.length} هدية`} /><View style={styles.list}>{data.referrals.rewards.map((row) => <Card key={row.id} style={styles.rowCard}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.rewardLabel}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.coupon?.code || "اشتراك رقمي"} · {row.status}</Text></Card>)}{data.referrals.referred.map((row) => <Card key={`ref-${row.id}`} style={styles.rowCard}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.referred.fullName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.referred.email} · {row.status === "qualified" ? "مؤهلة" : row.status === "rejected" ? "مرفوضة" : "قيد المراجعة"}</Text></Card>)}</View></> : null}
    {(data.ai?.entitlements.length || data.waitlist?.length || data.trackInterests?.length) ? <><SectionTitle title="الأدوات والاهتمامات" /><View style={styles.list}>{data.ai?.entitlements.map((row) => <Card key={`ai-${row.id}`} style={styles.rowCard}><Text style={[styles.rowTitle, { color: colors.text }]}>أدوات مراس · {row.source}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.status} · {row.expiresAt ? `حتى ${dateLabel(row.expiresAt)}` : "مفتوح"}</Text></Card>)}{data.waitlist?.map((row) => <Card key={`wait-${row.id}`} style={styles.rowCard}><Text style={[styles.rowTitle, { color: colors.text }]}>قائمة انتظار: {courseName.get(row.courseSlug) || row.courseSlug}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.status}</Text></Card>)}{data.trackInterests?.map((row) => <Card key={`track-${row.id}`} style={styles.rowCard}><Text style={[styles.rowTitle, { color: colors.text }]}>مسار: {row.trackTitle}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.status === "active" ? "مهتم" : "ألغى"}</Text></Card>)}</View></> : null}
    <SectionTitle title="الأجهزة والجلسات" subtitle={`${data.sessions.filter((row) => !row.revokedAt).length} نشطة`} />
    <View style={styles.list}>{data.sessions.slice(0, 12).map((row) => <Card key={row.id} style={styles.rowCard}><View style={styles.rowHead}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.deviceLabel}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.platform === "mobile" ? "تطبيق" : "ويب"} · آخر نشاط {dateLabel(row.lastSeenAt)}{row.revokedAt ? " · مُلغاة" : ""}</Text></View>{!row.revokedAt && Date.parse(row.expiresAt) > loadedAt ? <AppButton full={false} title="تسجيل خروج" variant="danger" loading={busy === `session-${row.id}`} onPress={() => act(`session-${row.id}`, { action: "revokeUserSession", sessionId: row.id }, "تم تسجيل خروج الجهاز.")} /> : null}</View></Card>)}</View>
    {data.support.length ? <><SectionTitle title="الدعم" subtitle={`${data.support.length} تذكرة`} /><View style={styles.list}>{data.support.slice(0, 10).map((row) => <Card key={row.id} style={styles.rowCard}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.ticketNumber} · {row.status}</Text></Card>)}</View></> : null}
    {data.requests.length ? <><SectionTitle title="طلبات المواد" subtitle={`${data.requests.length} طلب`} /><View style={styles.list}>{data.requests.slice(0, 10).map((row) => <Card key={row.id} style={styles.rowCard}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.courseName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.status} · {dateLabel(row.createdAt)}</Text></Card>)}</View></> : null}
  </>;
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  metric: { width: "48%", flexGrow: 1, gap: 4, alignItems: "flex-end" },
  metricValue: { fontSize: 16, fontWeight: "900" },
  metricLabel: { fontSize: 9, fontWeight: "700" },
  feedback: { fontSize: 10, fontWeight: "800", textAlign: "right", marginBottom: 8, lineHeight: 17 },
  list: { gap: 10, marginBottom: 12 },
  rowCard: { gap: 8 },
  rowHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 12, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  rowMeta: { fontSize: 9, lineHeight: 15, textAlign: "right", writingDirection: "rtl" },
  amount: { fontSize: 12, fontWeight: "900" },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  area: { minHeight: 80, borderWidth: 1, borderRadius: 12, padding: 10, textAlign: "right", writingDirection: "rtl", fontSize: 11, marginBottom: 8 },
  caption: { fontSize: 9, fontWeight: "800", textAlign: "right", marginBottom: 4, marginTop: 4 },
  chips: { gap: 6, paddingBottom: 8, flexDirection: "row-reverse" },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  interestBox: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  profileName: { fontSize: 15, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
});
