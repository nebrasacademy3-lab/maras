import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { AppButton, Card, EmptyState, Field, LoadingState, SearchBox, SectionTitle } from "@/src/components/ui";
import { ADMIN_STEP_UP_MESSAGE, api, ApiError, isAdminStepUpError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import { SearchChoice, SearchPicker, type PickerItem } from "@/src/components/SearchPicker";

type ServiceName = "chat" | "summary" | "translation" | "quiz";
type ServiceSetting = { service: ServiceName; enabled: boolean; model: string; freeMonthlyLimit: number; subscriberMonthlyLimit: number; maxOutputTokens: number; maxFileBytes: number; temperature: number; instructions: string };
type AiKey = { id: number; label: string; projectLabel: string | null; maskedKey: string; fingerprint: string; priority: number; status: "active" | "disabled" | "error"; cooldownUntil: string | null; consecutiveFailures: number; lastUsedAt: string | null; lastSuccessAt: string | null; lastErrorCode: string | null; createdAt: string; updatedAt: string };
type Entitlement = { id: number; userId: number; email: string; fullName: string; source: "admin" | "paid" | "gift" | "referral" | "course"; status: string; startsAt: string; expiresAt: string | null; createdBy: string | null; createdAt: string; updatedAt: string };
type AdminAiResponse = { ok: true; monthlyPrice: number; currency: "SAR"; settings: ServiceSetting[]; keys: AiKey[]; environmentKeyCount: number; entitlements: Entitlement[]; usage: { service: ServiceName; status: "processing" | "succeeded" | "failed" | "billable_failed"; total: number }[] };
type Mutate = (payload: Record<string, unknown>, success: string, key: string) => Promise<boolean>;

const serviceLabels: Record<ServiceName, string> = { chat: "المحادثة", summary: "تلخيص الملفات", translation: "الترجمة العلمية", quiz: "اختبارات الملفات" };
const serviceIcons: Record<ServiceName, React.ComponentProps<typeof Ionicons>["name"]> = { chat: "chatbubble-ellipses-outline", summary: "sparkles-outline", translation: "language-outline", quiz: "options-outline" };
const sourceLabels: Record<string, string> = { admin: "منحة إدارة", paid: "اشتراك مدفوع", gift: "هدية", referral: "إحالة", course: "اشتراك مادة" };

export function AdminAi({ onStepUpRequired, users = [] }: { onStepUpRequired?: (message: string) => void; users?: PickerItem[] } = {}) {
  const { colors } = useTheme();
  const query = useQuery({ queryKey: ["admin-ai"], queryFn: () => api<AdminAiResponse>("/api/admin/ai") });
  const [section, setSection] = useState<"services" | "keys" | "plans" | "usage">("services");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [priceDraft, setPriceDraft] = useState<string | null>(null);
  const [keyForm, setKeyForm] = useState({ label: "", projectLabel: "", apiKey: "", priority: "100" });
  const [grant, setGrant] = useState({ email: "", source: "admin" as "admin" | "paid" | "gift" | "referral", months: "1" });
  const [search, setSearch] = useState("");
  const entitlements = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return query.data?.entitlements || [];
    return (query.data?.entitlements || []).filter((row) => `${row.fullName} ${row.email} ${row.source}`.toLowerCase().includes(term));
  }, [query.data?.entitlements, search]);

  const mutate: Mutate = async (payload, success, key) => {
    setBusy(key); setFeedback("");
    try { await api("/api/admin/ai", { method: "POST", body: jsonBody(payload), timeoutMs: 60_000 }); setFeedback(success); await query.refetch(); return true; }
    catch (reason) {
      if (isAdminStepUpError(reason)) { setFeedback(ADMIN_STEP_UP_MESSAGE); onStepUpRequired?.(reason.message); return false; }
      setFeedback(reason instanceof ApiError ? reason.message : "تعذر حفظ التغيير");
      return false;
    }
    finally { setBusy(""); }
  };

  if (query.isLoading) return <LoadingState label="تحميل مركز تحكم أدوات مراس…" />;
  if (query.isError || !query.data) return <EmptyState icon="cloud-offline-outline" title="تعذر تحميل إدارة الأدوات" text={query.error instanceof Error ? query.error.message : "حاول مرة أخرى."} action={<AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} />} />;
  const data = query.data;
  const priceValue = priceDraft ?? String(data.monthlyPrice);

  const usageTotal = (status?: string) => data.usage.filter((row) => !status || row.status === status).reduce((sum, row) => sum + row.total, 0);
  const addKey = async () => {
    const ok = await mutate({ action: "addKey", label: keyForm.label, projectLabel: keyForm.projectLabel || undefined, apiKey: keyForm.apiKey, priority: Number(keyForm.priority) }, "أضيف المفتاح مشفرًا ولن يظهر كاملًا مرة أخرى.", "add-key");
    if (ok) setKeyForm({ label: "", projectLabel: "", apiKey: "", priority: "100" });
  };
  const grantEntitlement = async () => {
    const ok = await mutate({ action: "grantEntitlement", email: grant.email.trim().toLowerCase(), source: grant.source, months: Number(grant.months) }, "تم منح اشتراك الأدوات وإرسال إشعار للمستخدم.", "grant");
    if (ok) setGrant((current) => ({ ...current, email: "" }));
  };

  return <>
    <View style={styles.hero}><View style={[styles.heroIcon, { backgroundColor: `${colors.primary}16` }]}><Ionicons name="sparkles" size={27} color={colors.primary} /></View><View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.text }]}>أدوات مراس</Text><Text style={[styles.heroText, { color: colors.textSoft }]}>الخدمات والمفاتيح والحدود والاشتراكات والاستخدام في مركز واحد.</Text></View><View style={[styles.health, { backgroundColor: `${colors.success}14` }]}><View style={[styles.healthDot, { backgroundColor: colors.success }]} /><Text style={{ color: colors.success }}>{data.keys.filter((item) => item.status === "active").length + data.environmentKeyCount} مفتاح</Text></View></View>
    <SearchPicker label="أقسام أدوات مراس" value={section} placeholder="اختر القسم" items={[{ key: "services", label: "الخدمات" }, { key: "keys", label: "المفاتيح" }, { key: "plans", label: "الاشتراكات" }, { key: "usage", label: "الاستخدام" }]} onSelect={(item) => setSection(item.key as typeof section)} />
    {feedback ? <Text style={[styles.feedback, { color: feedback.startsWith("تم") || feedback.startsWith("أضيف") ? colors.success : colors.danger }]}>{feedback}</Text> : null}

    {section === "services" ? <>
      <SectionTitle title="الخدمات والحدود" subtitle="يمكن إيقاف كل خدمة أو تغيير نموذجها وحدود المجاني والمشترك" />
      <View style={styles.list}>{data.settings.map((setting) => <ServiceCard key={setting.service} setting={setting} busy={busy} mutate={mutate} />)}</View>
    </> : null}

    {section === "keys" ? <>
      <SectionTitle title="مفاتيح مزود الخدمة المتعددة" subtitle="يبدّل النظام تلقائيًا عند الحد أو 429/5xx، ولا يعيد المفتاح الكامل" />
      <Card><Field label="اسم المفتاح" value={keyForm.label} onChangeText={(label) => setKeyForm({ ...keyForm, label })} placeholder="مثال: مشروع الإنتاج 1" /><Field label="اسم المشروع — اختياري" value={keyForm.projectLabel} onChangeText={(projectLabel) => setKeyForm({ ...keyForm, projectLabel })} /><Field label="مفتاح مزود الخدمة" value={keyForm.apiKey} onChangeText={(apiKey) => setKeyForm({ ...keyForm, apiKey })} autoCapitalize="none" autoCorrect={false} secureTextEntry inputDirection="ltr" /><Field label="الأولوية — الأصغر أولًا" value={keyForm.priority} onChangeText={(priority) => setKeyForm({ ...keyForm, priority: priority.replace(/\D/g, "") })} keyboardType="number-pad" /><View style={[styles.securityNote, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="shield-checkmark-outline" size={19} color={colors.success} /><Text style={[styles.securityText, { color: colors.textSoft }]}>المفتاح يُرسل للخادم فقط ويُخزن مشفرًا. لا يظهر في التطبيق أو استجابات API.</Text></View><AppButton title="إضافة مفتاح آمن" icon="key-outline" loading={busy === "add-key"} disabled={keyForm.label.trim().length < 2 || keyForm.apiKey.trim().length < 20} onPress={() => void addKey()} /></Card>
      <SectionTitle title="المفاتيح الحالية" subtitle={`${data.keys.length} محفوظة في الإدارة · ${data.environmentKeyCount} من بيئة الخادم`} />
      <View style={styles.list}>{data.keys.length ? data.keys.map((row) => <KeyCard key={row.id} item={row} busy={busy} mutate={mutate} />) : <EmptyState icon="key-outline" title="لا توجد مفاتيح محفوظة" text={data.environmentKeyCount ? "توجد مفاتيح من بيئة الخادم وتعمل دون كشفها هنا." : "أضف مفتاحين أو أكثر لتفعيل التبديل التلقائي."} />}</View>
    </> : null}

    {section === "plans" ? <>
      <SectionTitle title="سعر الاشتراك" subtitle="اشتراك المادة يفعّل الأدوات تلقائيًا دون رسوم شهرية إضافية" />
      <Card><Field label="السعر الشهري بالريال" value={priceValue} onChangeText={(value) => setPriceDraft(value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" /><AppButton title="حفظ السعر" icon="save-outline" loading={busy === "price"} disabled={Number(priceValue) <= 0} onPress={() => void mutate({ action: "setSubscription", monthlyPrice: Number(priceValue) }, "تم تحديث سعر اشتراك أدوات مراس.", "price").then((ok) => { if (ok) setPriceDraft(null); })} /></Card>
      <SectionTitle title="منح اشتراك" subtitle="هدية أو إحالة أو منحة إدارة مع إشعار مباشر" />
      <Card><SearchPicker label="المستخدم" value={grant.email} placeholder="ابحث بالاسم أو البريد" items={users} onSelect={(item) => setGrant({ ...grant, email: item.key })} /><Text style={[styles.caption, { color: colors.textSoft }]}>مصدر الاشتراك</Text><ChoiceChips values={["admin", "gift", "referral", "paid"]} selected={grant.source} labels={sourceLabels} onChange={(source) => setGrant({ ...grant, source: source as typeof grant.source })} /><Field label="عدد الأشهر (1–36)" value={grant.months} onChangeText={(months) => setGrant({ ...grant, months: months.replace(/\D/g, "") })} keyboardType="number-pad" /><AppButton title="منح الاشتراك وإرسال الإشعار" icon="gift-outline" loading={busy === "grant"} disabled={!grant.email.includes("@") || Number(grant.months) < 1 || Number(grant.months) > 36} onPress={() => void grantEntitlement()} /></Card>
      <SectionTitle title="الاستحقاقات الحالية" subtitle="ابحث وفعّل أو ألغِ وصول الأدوات دون حذف سجل المنحة" />
      <SearchBox value={search} onChangeText={setSearch} placeholder="ابحث باسم المستخدم أو بريده" />
      <View style={[styles.list, { marginTop: 10 }]}>{entitlements.length ? entitlements.slice(0, 80).map((row) => <Card key={row.id} style={styles.rowCard}><View style={styles.rowHead}><View style={[styles.avatar, { backgroundColor: colors.primary }]}><Text>{row.fullName[0]}</Text></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.fullName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.email} · {sourceLabels[row.source] || row.source}</Text></View><StateBadge state={row.status} /></View><Text style={[styles.expiry, { color: colors.textSoft }]}>{row.expiresAt ? `ينتهي ${new Date(row.expiresAt).toLocaleDateString("ar-SA")}` : "بلا تاريخ انتهاء"}</Text><AppButton title={row.status === "active" ? "إلغاء الاستحقاق" : "إعادة التفعيل"} variant={row.status === "active" ? "danger" : "soft"} loading={busy === `ent-${row.id}`} onPress={() => void mutate({ action: "updateEntitlement", id: row.id, status: row.status === "active" ? "revoked" : "active" }, "تم تحديث استحقاق المستخدم.", `ent-${row.id}`)} /></Card>) : <EmptyState title="لا توجد نتيجة" text="غيّر عبارة البحث أو امنح أول اشتراك." />}</View>
    </> : null}

    {section === "usage" ? <>
      <SectionTitle title="الاستخدام والصحة" subtitle="مؤشرات فورية تساعدك على ضبط المفاتيح والحدود" />
      <View style={styles.metrics}><Metric icon="checkmark-circle-outline" label="طلبات ناجحة" value={usageTotal("succeeded")} color={colors.success} /><Metric icon="close-circle-outline" label="طلبات فاشلة" value={usageTotal("failed")} color={colors.danger} /><Metric icon="sync-outline" label="قيد المعالجة" value={usageTotal("processing")} color={colors.warning} /><Metric icon="layers-outline" label="إجمالي العمليات" value={usageTotal()} color={colors.primary} /></View>
      <SectionTitle title="حسب الخدمة" />
      <View style={styles.list}>{(["chat", "summary", "translation", "quiz"] as ServiceName[]).map((service) => { const rows = data.usage.filter((item) => item.service === service); const success = rows.find((item) => item.status === "succeeded")?.total || 0; const failed = rows.find((item) => item.status === "failed")?.total || 0; const total = rows.reduce((sum, item) => sum + item.total, 0); return <Card key={service} style={styles.usageCard}><View style={[styles.usageIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={serviceIcons[service]} size={21} color={colors.primary} /></View><View style={styles.usageCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{serviceLabels[service]}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{success} ناجحة · {failed} فاشلة</Text></View><Text style={[styles.usageTotal, { color: colors.primary }]}>{total}</Text></Card>; })}</View>
    </> : null}
  </>;
}

function ServiceCard({ setting, busy, mutate }: { setting: ServiceSetting; busy: string; mutate: Mutate }) {
  const { colors } = useTheme(); const [form, setForm] = useState({ ...setting, freeMonthlyLimit: String(setting.freeMonthlyLimit), subscriberMonthlyLimit: String(setting.subscriberMonthlyLimit), maxOutputTokens: String(setting.maxOutputTokens), maxFileMb: String(Math.max(1, Math.round(setting.maxFileBytes / 1024 / 1024))), temperature: String(setting.temperature) });
  return <Card style={styles.serviceCard}><View style={styles.serviceHead}><View style={[styles.serviceIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={serviceIcons[setting.service]} size={22} color={colors.primary} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{serviceLabels[setting.service]}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{form.model}</Text></View><Pressable onPress={() => setForm({ ...form, enabled: !form.enabled })} style={[styles.toggle, { backgroundColor: form.enabled ? colors.success : colors.textSoft }]}><View style={[styles.toggleKnob, { transform: [{ translateX: form.enabled ? -17 : 0 }] }]} /></Pressable></View><Field label="النموذج" value={form.model} onChangeText={(model) => setForm({ ...form, model })} autoCapitalize="none" inputDirection="ltr" /><View style={styles.twoFields}><View style={styles.fieldHalf}><Field label="حد المجاني" value={form.freeMonthlyLimit} onChangeText={(freeMonthlyLimit) => setForm({ ...form, freeMonthlyLimit: freeMonthlyLimit.replace(/\D/g, "") })} keyboardType="number-pad" /></View><View style={styles.fieldHalf}><Field label="حد المشترك" value={form.subscriberMonthlyLimit} onChangeText={(subscriberMonthlyLimit) => setForm({ ...form, subscriberMonthlyLimit: subscriberMonthlyLimit.replace(/\D/g, "") })} keyboardType="number-pad" /></View></View><View style={styles.twoFields}><View style={styles.fieldHalf}><Field label="أقصى مخرجات" value={form.maxOutputTokens} onChangeText={(maxOutputTokens) => setForm({ ...form, maxOutputTokens: maxOutputTokens.replace(/\D/g, "") })} keyboardType="number-pad" /></View><View style={styles.fieldHalf}><Field label="حجم الملف م.ب" value={form.maxFileMb} onChangeText={(maxFileMb) => setForm({ ...form, maxFileMb: maxFileMb.replace(/\D/g, "") })} keyboardType="number-pad" /></View></View><Field label="درجة الإبداع (0–1)" value={form.temperature} onChangeText={(temperature) => setForm({ ...form, temperature: temperature.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" /><TextInput multiline value={form.instructions} onChangeText={(instructions) => setForm({ ...form, instructions })} placeholder="تعليمات النظام للخدمة" placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /><AppButton title="حفظ إعدادات الخدمة" icon="save-outline" loading={busy === `service-${setting.service}`} onPress={() => void mutate({ action: "saveService", service: setting.service, enabled: form.enabled, model: form.model, freeMonthlyLimit: Number(form.freeMonthlyLimit), subscriberMonthlyLimit: Number(form.subscriberMonthlyLimit), maxOutputTokens: Number(form.maxOutputTokens), maxFileBytes: Number(form.maxFileMb) * 1024 * 1024, temperature: Number(form.temperature), instructions: form.instructions }, `تم حفظ إعدادات ${serviceLabels[setting.service]}.`, `service-${setting.service}`)} /></Card>;
}

function KeyCard({ item, busy, mutate }: { item: AiKey; busy: string; mutate: Mutate }) {
  const { colors } = useTheme(); const [form, setForm] = useState({ label: item.label, projectLabel: item.projectLabel || "", priority: String(item.priority) });
  return <Card style={styles.rowCard}><View style={styles.rowHead}><View style={[styles.keyIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="key-outline" size={21} color={colors.primary} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{item.label}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{item.maskedKey} · {item.fingerprint}</Text></View><StateBadge state={item.status} /></View>{item.cooldownUntil ? <Text style={[styles.cooldown, { color: colors.warning }]}>تبريد حتى {new Date(item.cooldownUntil).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })} · أخطاء متتالية {item.consecutiveFailures}</Text> : null}<Field label="الاسم" value={form.label} onChangeText={(label) => setForm({ ...form, label })} /><Field label="المشروع" value={form.projectLabel} onChangeText={(projectLabel) => setForm({ ...form, projectLabel })} /><Field label="الأولوية" value={form.priority} onChangeText={(priority) => setForm({ ...form, priority: priority.replace(/\D/g, "") })} keyboardType="number-pad" /><View style={styles.actions}><AppButton full={false} title="حفظ" variant="soft" loading={busy === `key-${item.id}`} onPress={() => void mutate({ action: "updateKey", id: item.id, ...form, priority: Number(form.priority), status: item.status === "disabled" ? "disabled" : "active" }, "تم تحديث المفتاح.", `key-${item.id}`)} /><AppButton full={false} title={item.status === "active" ? "تعطيل" : "تفعيل واختبار"} variant={item.status === "active" ? "danger" : "ghost"} onPress={() => void mutate({ action: "updateKey", id: item.id, ...form, priority: Number(form.priority), status: item.status === "active" ? "disabled" : "active" }, "تم تحديث حالة المفتاح وتصفير التبريد عند التفعيل.", `key-${item.id}`)} /></View></Card>;
}

function ChoiceChips({ values, selected, labels, onChange }: { values: string[]; selected: string; labels: Record<string, string>; onChange: (value: string) => void }) { return <SearchChoice values={values} selected={selected} labels={labels} onChange={onChange} />; }
function StateBadge({ state }: { state: string }) { const { colors } = useTheme(); const active = state === "active" || state === "succeeded"; const color = active ? colors.success : state === "error" || state === "failed" || state === "revoked" ? colors.danger : colors.textSoft; return <View style={[styles.state, { backgroundColor: `${color}14` }]}><View style={[styles.stateDot, { backgroundColor: color }]} /><Text style={{ color }}>{state === "active" ? "نشط" : state === "disabled" ? "معطل" : state === "error" ? "خطأ" : state === "revoked" ? "ملغي" : state}</Text></View>; }
function Metric({ icon, label, value, color }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: number; color: string }) { return <Card style={styles.metric}><Ionicons name={icon} size={22} color={color} /><Text style={{ color, fontSize: 20, fontWeight: "900", marginTop: 9 }}>{value}</Text><Text style={{ color, fontSize: 8, marginTop: 3 }}>{label}</Text></Card>; }

const styles = StyleSheet.create({
  hero: { minHeight: 90, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }, heroIcon: { width: 55, height: 55, borderRadius: 18, alignItems: "center", justifyContent: "center" }, heroCopy: { flex: 1, alignItems: "flex-start" }, heroTitle: { fontSize: 18, fontWeight: "900" }, heroText: { fontSize: 9, lineHeight: 16, textAlign: "right", marginTop: 4 }, health: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }, healthDot: { width: 6, height: 6, borderRadius: 3 }, sections: { gap: 7, paddingBottom: 12 }, section: { minWidth: 94, height: 45, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 14 }, feedback: { fontSize: 9, lineHeight: 17, textAlign: "center", marginBottom: 8 }, list: { gap: 9 },
  serviceCard: { padding: 14 }, serviceHead: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12 }, serviceIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }, rowCard: { padding: 13 }, rowHead: { flexDirection: "row", alignItems: "center", gap: 9 }, rowCopy: { flex: 1, alignItems: "flex-start" }, rowTitle: { fontSize: 12, fontWeight: "900", textAlign: "right" }, rowMeta: { fontSize: 8, lineHeight: 14, textAlign: "right", marginTop: 3 }, toggle: { width: 43, height: 25, borderRadius: 99, padding: 3, alignItems: "flex-end", justifyContent: "center" }, toggleKnob: { width: 19, height: 19, borderRadius: 10, backgroundColor: "#FFF" }, twoFields: { flexDirection: "row", gap: 8 }, fieldHalf: { flex: 1 }, area: { minHeight: 95, borderWidth: 1, borderRadius: 14, padding: 11, textAlign: "right", writingDirection: "rtl", textAlignVertical: "top", fontSize: 10, marginBottom: 12 }, securityNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, borderRadius: 13, marginBottom: 12 }, securityText: { flex: 1, fontSize: 8, lineHeight: 15, textAlign: "right" }, keyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, state: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }, stateDot: { width: 6, height: 6, borderRadius: 3 }, cooldown: { fontSize: 8, lineHeight: 15, textAlign: "right", marginVertical: 8 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 }, caption: { fontSize: 9, fontWeight: "800", textAlign: "right", marginBottom: 7 }, chips: { gap: 7, paddingBottom: 12 }, chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 11, alignItems: "center", justifyContent: "center" }, avatar: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" }, expiry: { fontSize: 8, textAlign: "right", marginVertical: 9 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { width: "48%", minHeight: 108, alignItems: "flex-start" }, usageCard: { flexDirection: "row", alignItems: "center", gap: 10 }, usageIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }, usageCopy: { flex: 1, alignItems: "flex-start" }, usageTotal: { fontSize: 19, fontWeight: "900" },
});
