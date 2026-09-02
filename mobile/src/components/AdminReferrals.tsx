import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { ScaledTextInput as TextInput } from "@/src/components/ScaledTextInput";
import { AppButton, Card, EmptyState, Field, LoadingState, SearchBox, SectionTitle } from "@/src/components/ui";
import { ADMIN_STEP_UP_MESSAGE, api, ApiError, isAdminStepUpError, jsonBody } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

type RewardType = "coupon_percent" | "coupon_fixed" | "ai_subscription";
type Tier = { id: number; name: string; description: string; requiredReferrals: number; rewardType: RewardType; rewardValue: number; rewardDurationDays: number | null; couponValidityDays: number | null; courseSlug: string | null; enabled: boolean; sortOrder: number; rewardLabel?: string };
type StudentNextTier = { id: number; name: string; requiredReferrals: number; remaining: number };
type AdminReferralResponse = {
  ok: true;
  settings: { enabled: boolean; qualificationEvent: "registration" | "first_paid_order"; title: string; description: string; terms: string; maxQualifiedPerIpPerDay: number; defaultCouponValidityDays: number };
  stats: { students: number; qualified: number; pending: number; rejected: number; rewards: number; activeCoupons: number; usedCoupons: number };
  tiers: Tier[];
  students: { userId: number; email: string; fullName: string; status?: string; code: string | null; shareCount: number; counts: { total: number; qualified: number; pending: number; rejected: number }; nextTier: StudentNextTier | null }[];
  attributions: { id: number; referrer: { id: number; email: string; fullName: string }; referred: { id: number; email: string; fullName: string }; status: "qualified" | "pending" | "rejected"; qualificationEvent: string; reviewReason: string | null; createdAt: string; qualifiedAt: string | null }[];
  rewards: { id: number; user: { id: number; email: string; fullName: string }; rewardType: RewardType; rewardValue: number; rewardLabel?: string; sourceType: string; status: string; coupon: { id: number; code: string; status: string; usedCount: number; courseSlug: string | null } | null; issuedAt: string; expiresAt: string | null; note: string | null }[];
};
type ReferralSettingsDraft = { enabled: boolean; qualificationEvent: "registration" | "first_paid_order"; title: string; description: string; termsText: string; maxQualifiedPerIpPerDay: string; defaultCouponValidityDays: string };
type TierDraft = { name: string; description: string; requiredReferrals: string; rewardType: RewardType; rewardValue: string; rewardDurationDays: string; couponValidityDays: string; courseSlug: string; enabled: boolean; sortOrder: string };

const rewardLabels: Record<RewardType, string> = { coupon_percent: "كوبون نسبة %", coupon_fixed: "كوبون مبلغ ر.س", ai_subscription: "اشتراك مراس AI" };
const attributionLabels = { qualified: "مؤهلة", pending: "قيد المراجعة", rejected: "مرفوضة" };
const emptyTierDraft: TierDraft = { name: "", description: "", requiredReferrals: "5", rewardType: "coupon_percent", rewardValue: "25", rewardDurationDays: "30", couponValidityDays: "90", courseSlug: "", enabled: true, sortOrder: "10" };

function tierPayload(row: Tier, overrides: Partial<Tier> = {}) {
  const next = { ...row, ...overrides };
  return { name: next.name, description: next.description, requiredReferrals: next.requiredReferrals, rewardType: next.rewardType, rewardValue: next.rewardValue, rewardDurationDays: next.rewardDurationDays, couponValidityDays: next.couponValidityDays, courseSlug: next.courseSlug, sortOrder: next.sortOrder, enabled: next.enabled };
}

function tierDraftPayload(draft: TierDraft) {
  return { name: draft.name.trim(), description: draft.description.trim(), requiredReferrals: Number(draft.requiredReferrals), rewardType: draft.rewardType, rewardValue: Number(draft.rewardValue), rewardDurationDays: Number(draft.rewardDurationDays) || null, couponValidityDays: Number(draft.couponValidityDays) || null, courseSlug: draft.courseSlug.trim().toLowerCase() || null, sortOrder: Number(draft.sortOrder) || 0, enabled: draft.enabled };
}

function tierToDraft(row: Tier): TierDraft {
  return { name: row.name, description: row.description || "", requiredReferrals: String(row.requiredReferrals), rewardType: row.rewardType, rewardValue: String(row.rewardValue), rewardDurationDays: row.rewardDurationDays == null ? "" : String(row.rewardDurationDays), couponValidityDays: row.couponValidityDays == null ? "" : String(row.couponValidityDays), courseSlug: row.courseSlug || "", enabled: row.enabled, sortOrder: String(row.sortOrder ?? 0) };
}

function couponUsed(row: { status: string; coupon: { usedCount: number } | null }) {
  return row.status === "redeemed" || (row.coupon?.usedCount ?? 0) > 0;
}

export function AdminReferrals({ onStepUpRequired }: { onStepUpRequired?: (message: string) => void } = {}) {
  const { colors } = useTheme();
  const query = useQuery({ queryKey: ["admin-referrals"], queryFn: () => api<AdminReferralResponse>("/api/admin/referrals") });
  const [section, setSection] = useState<"overview" | "tiers" | "students" | "gifts">("overview");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const [settingsDraft, setSettings] = useState<ReferralSettingsDraft | null>(null);
  const [tier, setTier] = useState<TierDraft>(emptyTierDraft);
  const [editingTierId, setEditingTierId] = useState<number | null>(null);
  const [gift, setGift] = useState({ email: "", rewardType: "coupon_percent" as RewardType, rewardValue: "25", courseSlug: "", validityDays: "90", title: "هدية من مراس", note: "" });

  const students = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return query.data?.students || [];
    return (query.data?.students || []).filter((row) => `${row.fullName} ${row.email} ${row.code || ""}`.toLocaleLowerCase("ar").includes(term));
  }, [query.data?.students, search]);

  const mutate = async (method: "POST" | "PATCH", payload: Record<string, unknown>, success: string, key: string) => {
    setBusy(key); setFeedback("");
    try { await api("/api/admin/referrals", { method, body: jsonBody(payload) }); setFeedback(success); await query.refetch(); return true; }
    catch (reason) {
      if (isAdminStepUpError(reason)) { setFeedback(ADMIN_STEP_UP_MESSAGE); onStepUpRequired?.(reason.message); return false; }
      setFeedback(reason instanceof ApiError ? reason.message : "تعذر حفظ التغيير");
      return false;
    }
    finally { setBusy(""); }
  };

  if (query.isLoading) return <LoadingState label="تحميل مركز الإحالات والهدايا…" />;
  if (query.isError || !query.data) return <EmptyState icon="cloud-offline-outline" title="تعذر تحميل نظام الإحالات" text={query.error instanceof Error ? query.error.message : "حاول مرة أخرى."} action={<AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} />} />;
  const data = query.data;
  const settings = settingsDraft ?? { enabled: data.settings.enabled, qualificationEvent: data.settings.qualificationEvent, title: data.settings.title, description: data.settings.description, termsText: data.settings.terms, maxQualifiedPerIpPerDay: String(data.settings.maxQualifiedPerIpPerDay), defaultCouponValidityDays: String(data.settings.defaultCouponValidityDays) };

  const saveSettings = () => void mutate("PATCH", { action: "settings", enabled: settings.enabled, qualificationEvent: settings.qualificationEvent, title: settings.title, description: settings.description, terms: settings.termsText, maxQualifiedPerIpPerDay: Number(settings.maxQualifiedPerIpPerDay), defaultCouponValidityDays: Number(settings.defaultCouponValidityDays) }, "تم حفظ سياسة الإحالات وتطبيقها على الويب والتطبيق.", "settings").then((ok) => { if (ok) setSettings(null); });
  const createTier = async () => {
    const ok = await mutate("POST", { action: "create_tier", tier: tierDraftPayload(tier) }, "تم إنشاء مستوى المكافأة.", "tier-create");
    if (ok) setTier((current) => ({ ...current, name: "", description: "", requiredReferrals: String(Number(current.requiredReferrals) + 5), rewardValue: current.rewardType === "coupon_percent" ? "25" : "1" }));
  };
  const saveTierEdits = async () => {
    if (editingTierId == null) return;
    const ok = await mutate("PATCH", { action: "tier", id: editingTierId, ...tierDraftPayload(tier) }, "تم تحديث مستوى المكافأة.", "tier-edit");
    if (ok) { setEditingTierId(null); setTier(emptyTierDraft); }
  };
  const startEditingTier = (row: Tier) => { setEditingTierId(row.id); setTier(tierToDraft(row)); setFeedback(""); };
  const cancelEditingTier = () => { setEditingTierId(null); setTier(emptyTierDraft); };
  const toggleTier = (row: Tier) => void mutate("PATCH", { action: "tier", id: row.id, ...tierPayload(row, { enabled: !row.enabled }) }, row.enabled ? "تم إيقاف المستوى دون حذف السجل." : "تم تفعيل المستوى.", `tier-${row.id}`);
  const grantGift = async () => {
    const ok = await mutate("POST", { action: "grant_reward", email: gift.email.trim().toLowerCase(), rewardType: gift.rewardType, rewardValue: Number(gift.rewardValue), courseSlug: gift.courseSlug.trim() || null, validityDays: Number(gift.validityDays), title: gift.title, note: gift.note }, "أُرسلت الهدية للمستخدم مع إشعار خاص.", "gift");
    if (ok) setGift((current) => ({ ...current, email: "", note: "" }));
  };

  return <>
    <View style={styles.hero}>
      <View style={[styles.heroIcon, { backgroundColor: `${colors.primary}18` }]}><Ionicons name="gift-outline" size={27} color={colors.primary} /></View>
      <View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.text }]}>الإحالات والهدايا</Text><Text style={[styles.heroText, { color: colors.textSoft }]}>المستويات والتأهيل والكوبونات الفردية والمنح في مركز واحد.</Text></View>
      <View style={[styles.liveBadge, { backgroundColor: data.settings.enabled ? `${colors.success}16` : `${colors.danger}14` }]}><View style={[styles.liveDot, { backgroundColor: data.settings.enabled ? colors.success : colors.danger }]} /><Text style={{ color: data.settings.enabled ? colors.success : colors.danger }}>{data.settings.enabled ? "يعمل" : "موقوف"}</Text></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sections}>{([{ key: "overview", label: "السياسة", icon: "options-outline" }, { key: "tiers", label: "المستويات", icon: "trophy-outline" }, { key: "students", label: "الطلاب", icon: "people-outline" }, { key: "gifts", label: "الهدايا", icon: "ticket-outline" }] as const).map((item) => <Pressable key={item.key} onPress={() => setSection(item.key)} style={[styles.sectionTab, { backgroundColor: section === item.key ? colors.primary : colors.surface, borderColor: section === item.key ? colors.primary : colors.border }]}><Ionicons name={item.icon} size={17} color={section === item.key ? "#FFF" : colors.primary} /><Text style={{ color: section === item.key ? "#FFF" : colors.text }}>{item.label}</Text></Pressable>)}</ScrollView>
    {feedback ? <Text style={[styles.feedback, { color: feedback.startsWith("تم") || feedback.startsWith("أُ") ? colors.success : colors.danger }]}>{feedback}</Text> : null}

    {section === "overview" ? <>
      <View style={styles.metrics}>{[{ label: "إحالات مؤهلة", value: data.stats.qualified, icon: "checkmark-circle-outline" as const }, { label: "قيد المراجعة", value: data.stats.pending, icon: "time-outline" as const }, { label: "مكافآت صادرة", value: data.stats.rewards, icon: "gift-outline" as const }, { label: "كوبونات مستخدمة", value: data.stats.usedCoupons, icon: "ticket-outline" as const }].map((item) => <Card key={item.label} style={styles.metric}><Ionicons name={item.icon} size={21} color={colors.primary} /><Text style={[styles.metricValue, { color: colors.text }]}>{item.value}</Text><Text style={[styles.metricLabel, { color: colors.textSoft }]}>{item.label}</Text></Card>)}</View>
      <View style={{ marginTop: 10 }}><AppButton title="إعادة مطابقة جميع المكافآت" icon="sync-outline" variant="soft" loading={busy === "reconcile-all"} onPress={() => void mutate("POST", { action: "reconcile" }, "تمت مطابقة المستويات لجميع الطلاب وإصدار أي مكافأة مستحقة.", "reconcile-all")} /></View>
      <SectionTitle title="سياسة التأهيل" subtitle="تُطبّق فور الحفظ مع بقاء السجل السابق محفوظًا" />
      <Card>
        <ChoiceChips values={["enabled", "disabled"]} selected={settings.enabled ? "enabled" : "disabled"} labels={{ enabled: "تشغيل البرنامج", disabled: "إيقاف مؤقت" }} onChange={(value) => setSettings({ ...settings, enabled: value === "enabled" })} />
        <Text style={[styles.fieldCaption, { color: colors.textSoft }]}>متى تُحتسب الإحالة؟</Text>
        <ChoiceChips values={["first_paid_order", "registration"]} selected={settings.qualificationEvent} labels={{ registration: "عند التسجيل — يحتاج مراجعة", first_paid_order: "بعد أول شراء — موصى به" }} onChange={(value) => setSettings({ ...settings, qualificationEvent: value as typeof settings.qualificationEvent })} />
        {settings.qualificationEvent === "registration" ? <Text style={[styles.riskNote, { color: colors.warning, backgroundColor: `${colors.warning}12` }]}>هذا الخيار أعلى مخاطرة؛ تُعلّق الحسابات ذات إشارات الجهاز أو الشبكة المتكررة للمراجعة قبل منح الهدية.</Text> : null}
        <Field label="عنوان صفحة الطالب" value={settings.title} onChangeText={(title) => setSettings({ ...settings, title })} />
        <TextInput multiline value={settings.description} onChangeText={(description) => setSettings({ ...settings, description })} placeholder="شرح مختصر للبرنامج" placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
        <TextInput multiline value={settings.termsText} onChangeText={(termsText) => setSettings({ ...settings, termsText })} placeholder="كل شرط في سطر مستقل" placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
        <Field label="أقصى إحالات مؤهلة من IP خلال اليوم" keyboardType="number-pad" value={settings.maxQualifiedPerIpPerDay} onChangeText={(maxQualifiedPerIpPerDay) => setSettings({ ...settings, maxQualifiedPerIpPerDay: maxQualifiedPerIpPerDay.replace(/\D/g, "") })} />
        <Field label="صلاحية الكوبون الافتراضية بالأيام" keyboardType="number-pad" value={settings.defaultCouponValidityDays} onChangeText={(defaultCouponValidityDays) => setSettings({ ...settings, defaultCouponValidityDays: defaultCouponValidityDays.replace(/\D/g, "") })} />
        <AppButton title="حفظ سياسة الإحالات" icon="save-outline" loading={busy === "settings"} disabled={!settings.title.trim() || !settings.description.trim()} onPress={saveSettings} />
      </Card>
    </> : null}

    {section === "tiers" ? <>
      <SectionTitle title={editingTierId == null ? "إنشاء مستوى مكافأة" : "تعديل مستوى المكافأة"} subtitle={editingTierId == null ? "الإصدار تلقائي ولا يحتاج مطالبة من الطالب" : "التعديل يُطبّق على المستوى دون المساس بالمكافآت الصادرة"} />
      <Card>
        <Field label="اسم المستوى" value={tier.name} onChangeText={(name) => setTier({ ...tier, name })} placeholder="مثال: مكافأة الأصدقاء الخمسة" />
        <TextInput multiline value={tier.description} onChangeText={(description) => setTier({ ...tier, description })} placeholder="اشرح للطالب ما سيحصل عليه" placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
        <Field label="عدد الإحالات المطلوبة" keyboardType="number-pad" value={tier.requiredReferrals} onChangeText={(requiredReferrals) => setTier({ ...tier, requiredReferrals: requiredReferrals.replace(/\D/g, "") })} />
        <Text style={[styles.fieldCaption, { color: colors.textSoft }]}>نوع المكافأة</Text><ChoiceChips values={["coupon_percent", "coupon_fixed", "ai_subscription"]} selected={tier.rewardType} labels={rewardLabels} onChange={(rewardType) => setTier({ ...tier, rewardType: rewardType as RewardType, rewardValue: rewardType === "ai_subscription" ? "1" : tier.rewardValue })} />
        <Field label={tier.rewardType === "coupon_percent" ? "نسبة الخصم" : tier.rewardType === "coupon_fixed" ? "مبلغ الخصم" : "عدد أشهر AI"} keyboardType="decimal-pad" value={tier.rewardValue} onChangeText={(rewardValue) => setTier({ ...tier, rewardValue: rewardValue.replace(/[^0-9.]/g, "") })} />
        {tier.rewardType !== "ai_subscription" ? <><Field label="صلاحية الكوبون بالأيام" keyboardType="number-pad" value={tier.couponValidityDays} onChangeText={(couponValidityDays) => setTier({ ...tier, couponValidityDays: couponValidityDays.replace(/\D/g, "") })} /><Field label="رمز المادة — اختياري" value={tier.courseSlug} onChangeText={(courseSlug) => setTier({ ...tier, courseSlug })} autoCapitalize="none" /></> : <Field label="مدة الاستحقاق بالأيام — اختياري" keyboardType="number-pad" value={tier.rewardDurationDays} onChangeText={(rewardDurationDays) => setTier({ ...tier, rewardDurationDays: rewardDurationDays.replace(/\D/g, "") })} />}
        <Field label="ترتيب العرض" keyboardType="number-pad" value={tier.sortOrder} onChangeText={(sortOrder) => setTier({ ...tier, sortOrder: sortOrder.replace(/\D/g, "") })} />
        {editingTierId != null ? <ChoiceChips values={["enabled", "disabled"]} selected={tier.enabled ? "enabled" : "disabled"} labels={{ enabled: "المستوى نشط", disabled: "المستوى موقوف" }} onChange={(value) => setTier({ ...tier, enabled: value === "enabled" })} /> : null}
        {editingTierId == null
          ? <AppButton title="إضافة المستوى" icon="add-circle-outline" loading={busy === "tier-create"} disabled={!tier.name.trim() || Number(tier.requiredReferrals) < 1 || Number(tier.rewardValue) <= 0} onPress={() => void createTier()} />
          : <View style={styles.actions}><AppButton full={false} title="حفظ التعديلات" icon="save-outline" loading={busy === "tier-edit"} disabled={!tier.name.trim() || Number(tier.requiredReferrals) < 1 || Number(tier.rewardValue) <= 0} onPress={() => void saveTierEdits()} /><AppButton full={false} title="إلغاء التعديل" variant="ghost" onPress={cancelEditingTier} /></View>}
      </Card>
      <SectionTitle title="المستويات الحالية" subtitle={`${data.tiers.length} مستوى مرتبة حسب العدد`} />
      <View style={styles.list}>{[...data.tiers].sort((a, b) => a.requiredReferrals - b.requiredReferrals).map((row) => <Card key={row.id} style={styles.rowCard}><View style={styles.rowHead}><View style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="trophy-outline" size={21} color={colors.primary} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.name}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.requiredReferrals} إحالات · {row.rewardLabel || `${rewardLabels[row.rewardType]} · ${row.rewardValue}`}</Text></View><Status active={row.enabled} /></View>{row.description ? <Text style={[styles.rowDescription, { color: colors.textSoft }]}>{row.description}</Text> : null}<View style={styles.actions}><AppButton full={false} title="تعديل" icon="create-outline" variant="soft" onPress={() => startEditingTier(row)} /><AppButton full={false} title={row.enabled ? "إيقاف المستوى" : "تفعيل المستوى"} variant={row.enabled ? "danger" : "soft"} loading={busy === `tier-${row.id}`} onPress={() => toggleTier(row)} /></View></Card>)}</View>
    </> : null}

    {section === "students" ? <>
      <SectionTitle title="حالة كل طالب" subtitle="الإحالات المكتملة والمعلقة والمرفوضة والمستوى التالي" />
      <SearchBox value={search} onChangeText={setSearch} placeholder="ابحث بالاسم أو البريد أو رمز الإحالة" />
      <View style={[styles.list, { marginTop: 10 }]}>{students.length ? students.map((row) => <Card key={row.userId} style={styles.rowCard}><View style={styles.rowHead}><View style={[styles.avatar, { backgroundColor: colors.primary }]}><Text style={{ color: "#FFF" }}>{(row.fullName || "؟").trim().charAt(0) || "؟"}</Text></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.fullName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.email} · {row.code || "—"}</Text></View><Text style={[styles.qualifiedCount, { color: colors.primary }]}>{row.counts.qualified}</Text></View><View style={styles.counts}><Count label="مؤهلة" value={row.counts.qualified} color={colors.success} /><Count label="معلقة" value={row.counts.pending} color={colors.warning} /><Count label="مرفوضة" value={row.counts.rejected} color={colors.danger} /><Count label="مشاركة" value={row.shareCount} color={colors.primary} /></View><Text style={[styles.nextTier, { color: colors.textSoft }]}>{row.nextTier ? `التالي: ${row.nextTier.name} عند ${row.nextTier.requiredReferrals} إحالات · متبقٍ ${row.nextTier.remaining}` : "أكمل جميع المستويات الحالية"}</Text><AppButton title="إعادة مطابقة المكافآت" variant="ghost" loading={busy === `reconcile-${row.userId}`} onPress={() => void mutate("POST", { action: "reconcile", userId: row.userId }, "تمت مطابقة المستويات وإصدار أي مكافأة مستحقة.", `reconcile-${row.userId}`)} /></Card>) : <EmptyState title="لا توجد نتيجة" text="غيّر عبارة البحث." />}</View>
      <SectionTitle title="مراجعة الإحالات" subtitle="التعديل اليدوي مسجل ويصدر المكافأة فور التأهيل" />
      <View style={styles.list}>{data.attributions.slice(0, 40).map((row) => <Card key={row.id} style={styles.rowCard}><View style={styles.rowHead}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.referred.fullName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>عن طريق {row.referrer.fullName} · {row.qualificationEvent}</Text></View><Text style={{ color: row.status === "qualified" ? colors.success : row.status === "rejected" ? colors.danger : colors.warning, fontSize: 9, fontWeight: "900" }}>{attributionLabels[row.status]}</Text></View>{row.reviewReason ? <Text style={[styles.rowDescription, { color: colors.textSoft }]}>السبب: {row.reviewReason}</Text> : null}<View style={styles.actions}><AppButton full={false} title="تأهيل" variant="soft" loading={busy === `attr-${row.id}`} onPress={() => void mutate("PATCH", { action: "attribution_status", id: row.id, status: "qualified", reviewReason: "manual_admin_review" }, "تم تأهيل الإحالة ومطابقة المكافآت.", `attr-${row.id}`)} /><AppButton full={false} title="تعليق" variant="ghost" onPress={() => void mutate("PATCH", { action: "attribution_status", id: row.id, status: "pending", reviewReason: "manual_admin_review" }, "أعيدت الإحالة للمراجعة.", `attr-${row.id}`)} /><AppButton full={false} title="رفض" variant="danger" onPress={() => void mutate("PATCH", { action: "attribution_status", id: row.id, status: "rejected", reviewReason: "manual_admin_review" }, "تم رفض الإحالة.", `attr-${row.id}`)} /></View></Card>)}</View>
    </> : null}

    {section === "gifts" ? <>
      <SectionTitle title="منح هدية لمستخدم" subtitle="الكوبون أو اشتراك AI لا يعمل إلا على حساب البريد المحدد" />
      <Card><Field label="بريد المستخدم" keyboardType="email-address" autoCapitalize="none" value={gift.email} onChangeText={(email) => setGift({ ...gift, email })} /><Text style={[styles.fieldCaption, { color: colors.textSoft }]}>نوع الهدية</Text><ChoiceChips values={["coupon_percent", "coupon_fixed", "ai_subscription"]} selected={gift.rewardType} labels={rewardLabels} onChange={(rewardType) => setGift({ ...gift, rewardType: rewardType as RewardType, rewardValue: rewardType === "ai_subscription" ? "1" : gift.rewardValue })} /><Field label={gift.rewardType === "ai_subscription" ? "عدد الأشهر" : gift.rewardType === "coupon_percent" ? "نسبة الخصم" : "مبلغ الخصم"} keyboardType="decimal-pad" value={gift.rewardValue} onChangeText={(rewardValue) => setGift({ ...gift, rewardValue: rewardValue.replace(/[^0-9.]/g, "") })} /><Field label="مدة الصلاحية بالأيام" keyboardType="number-pad" value={gift.validityDays} onChangeText={(validityDays) => setGift({ ...gift, validityDays: validityDays.replace(/\D/g, "") })} />{gift.rewardType !== "ai_subscription" ? <Field label="رمز المادة — اختياري" autoCapitalize="none" value={gift.courseSlug} onChangeText={(courseSlug) => setGift({ ...gift, courseSlug })} /> : null}<Field label="عنوان الهدية" value={gift.title} onChangeText={(title) => setGift({ ...gift, title })} /><TextInput multiline value={gift.note} onChangeText={(note) => setGift({ ...gift, note })} placeholder="ملاحظة داخلية — اختيارية" placeholderTextColor={colors.textSoft} style={[styles.area, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /><AppButton title="منح الهدية وإرسال الإشعار" icon="gift-outline" loading={busy === "gift"} disabled={!gift.email.includes("@") || Number(gift.rewardValue) <= 0} onPress={() => void grantGift()} /></Card>
      <SectionTitle title="المكافآت الصادرة" subtitle="فعّل أو أوقف المكافأة والكوبون المرتبط دون حذف السجل" />
      <View style={styles.list}>{data.rewards.slice(0, 50).map((row) => <Card key={row.id} style={styles.rowCard}><View style={styles.rowHead}><View style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={row.rewardType === "ai_subscription" ? "sparkles-outline" : "ticket-outline"} size={21} color={colors.primary} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{row.user.fullName}</Text><Text style={[styles.rowMeta, { color: colors.textSoft }]}>{row.rewardLabel || `${rewardLabels[row.rewardType]} · ${row.rewardValue}`} · {row.sourceType}</Text></View><Status active={row.status === "active"} /></View>{row.coupon ? <Text selectable style={[styles.couponCode, { color: colors.primary }]}>{row.coupon.code} · {couponUsed(row) ? "مستخدم" : row.coupon.status}{row.coupon.courseSlug ? ` · ${row.coupon.courseSlug}` : ""}</Text> : null}{["redeemed", "expired"].includes(row.status) ? <Text style={[styles.nextTier, { color: colors.textSoft }]}>{row.status === "redeemed" ? "مكافأة مستخدمة — يبقى سجلها للتدقيق" : "مكافأة منتهية — يبقى سجلها للتدقيق"}</Text> : <AppButton title={row.status === "active" ? "إيقاف المكافأة" : "تفعيل المكافأة"} variant={row.status === "active" ? "danger" : "soft"} loading={busy === `reward-${row.id}`} onPress={() => void mutate("PATCH", { action: "reward_status", id: row.id, status: row.status === "active" ? "disabled" : "active" }, "تم تحديث حالة المكافأة والكوبون المرتبط.", `reward-${row.id}`)} />}</Card>)}</View>
    </> : null}
  </>;
}

function ChoiceChips({ values, selected, labels, onChange }: { values: string[]; selected: string; labels: Record<string, string>; onChange: (value: string) => void }) {
  const { colors } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{values.map((value) => <Pressable key={value} onPress={() => onChange(value)} style={[styles.chip, { backgroundColor: selected === value ? colors.primary : colors.surfaceAlt }]}><Text style={{ color: selected === value ? "#FFF" : colors.text, fontSize: 9, fontWeight: "900" }}>{labels[value]}</Text></Pressable>)}</ScrollView>;
}
function Status({ active }: { active: boolean }) { const { colors } = useTheme(); return <View style={[styles.status, { backgroundColor: active ? `${colors.success}15` : `${colors.danger}12` }]}><View style={[styles.statusDot, { backgroundColor: active ? colors.success : colors.danger }]} /><Text style={{ color: active ? colors.success : colors.danger }}>{active ? "نشط" : "موقوف"}</Text></View>; }
function Count({ label, value, color }: { label: string; value: number; color: string }) { return <View style={styles.count}><Text style={{ color, fontSize: 13, fontWeight: "900" }}>{value}</Text><Text style={{ color, fontSize: 7 }}>{label}</Text></View>; }

const styles = StyleSheet.create({
  hero: { minHeight: 90, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }, heroIcon: { width: 55, height: 55, borderRadius: 18, alignItems: "center", justifyContent: "center" }, heroCopy: { flex: 1, alignItems: "flex-start" }, heroTitle: { fontSize: 18, fontWeight: "900" }, heroText: { fontSize: 9, lineHeight: 16, textAlign: "right", marginTop: 4 }, liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }, liveDot: { width: 6, height: 6, borderRadius: 3 }, sections: { gap: 7, paddingBottom: 12 }, sectionTab: { minWidth: 94, height: 45, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 14 }, feedback: { fontSize: 9, lineHeight: 17, textAlign: "center", marginBottom: 8 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { width: "48%", minHeight: 108, alignItems: "flex-start" }, metricValue: { fontSize: 20, fontWeight: "900", marginTop: 10 }, metricLabel: { fontSize: 8, marginTop: 3 }, fieldCaption: { fontSize: 9, fontWeight: "800", textAlign: "right", marginBottom: 7 }, riskNote: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, fontSize: 8, lineHeight: 15, textAlign: "right", marginBottom: 10 }, area: { minHeight: 90, borderWidth: 1, borderRadius: 14, padding: 11, textAlign: "right", writingDirection: "rtl", textAlignVertical: "top", fontSize: 11, marginBottom: 12 }, chips: { gap: 7, paddingBottom: 12 }, chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  list: { gap: 9 }, rowCard: { padding: 13 }, rowHead: { flexDirection: "row", alignItems: "center", gap: 9 }, rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, rowCopy: { flex: 1, alignItems: "flex-start" }, rowTitle: { fontSize: 12, fontWeight: "900", textAlign: "right" }, rowMeta: { fontSize: 8, lineHeight: 14, textAlign: "right", marginTop: 3 }, rowDescription: { fontSize: 9, lineHeight: 17, textAlign: "right", marginVertical: 9 }, status: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }, statusDot: { width: 6, height: 6, borderRadius: 3 }, avatar: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" }, qualifiedCount: { fontSize: 19, fontWeight: "900" }, counts: { flexDirection: "row", marginTop: 11, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(120,140,170,.2)" }, count: { flex: 1, alignItems: "center" }, nextTier: { fontSize: 8, textAlign: "center", marginTop: 9 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }, couponCode: { fontSize: 11, fontWeight: "900", letterSpacing: .7, textAlign: "center", marginVertical: 10 },
});
