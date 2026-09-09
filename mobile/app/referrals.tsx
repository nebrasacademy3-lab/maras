import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, EmptyState, FadeIn, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { safeExternalLink } from "@/src/lib/notification-routing";
import { useTheme } from "@/src/providers/ThemeProvider";

type ReferralTier = {
  id: number;
  name: string;
  requiredReferrals: number;
  rewardType: string;
  rewardLabel: string;
  description: string;
  enabled: boolean;
  earned: boolean;
};

type ReferralReward = {
  id: number;
  type: string;
  title: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  coupon?: { code?: string; value?: number; type?: string } | null;
};

type ReferralCoupon = {
  id: number;
  code: string;
  type: string;
  value: number;
  courseSlug: string | null;
  status: string;
  used: boolean;
  expiresAt: string | null;
};

type ReferralNextTier = {
  id: number;
  name: string;
  requiredReferrals: number;
  remaining: number;
  rewardLabel: string;
  description?: string;
};

type ReferralsResponse = {
  ok: true;
  program: { enabled: boolean; title: string; description: string; qualificationLabel: string; terms: string };
  referral: {
    code: string;
    shareUrl: string;
    counts: { total: number; pending: number; qualified: number; rejected: number };
    nextTier: ReferralNextTier | null;
    progressPercent: number;
  };
  tiers: ReferralTier[];
  rewards: ReferralReward[];
  coupons: ReferralCoupon[];
};

const statusLabels: Record<string, string> = {
  active: "متاح للاستخدام",
  issued: "تم الإصدار",
  used: "مستخدم",
  redeemed: "مستخدم",
  expired: "منتهي",
  disabled: "موقوف",
  revoked: "ملغي",
};

function termLines(terms: unknown) {
  if (Array.isArray(terms)) return terms.map((term) => String(term ?? "").trim()).filter(Boolean);
  if (typeof terms !== "string") return [];
  return terms.split(/\n+/).map((term) => term.replace(/^[-•\d.)\s]+/, "").trim()).filter(Boolean);
}

function couponValueLabel(coupon: { type: string; value: number }) {
  return coupon.type === "percent" || coupon.type === "percentage" ? `${coupon.value}%` : `${coupon.value} ر.س`;
}

function dateLabel(value: string | null, locale: string) {
  if (!value) return "بلا تاريخ انتهاء";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `ينتهي ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
}

export default function ReferralsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { direction, locale } = useLanguage();
  const [sharing, setSharing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const query = useQuery({
    queryKey: ["referrals", user?.id],
    queryFn: () => api<ReferralsResponse>("/api/referrals"),
    enabled: Boolean(user),
  });

  const nextTier = useMemo(() => {
    if (!query.data) return null;
    return query.data.referral.nextTier || query.data.tiers
      .filter((tier) => tier.enabled && !tier.earned)
      .sort((a, b) => a.requiredReferrals - b.requiredReferrals)[0] || null;
  }, [query.data]);

  if (!user) return <Screen><AppHeader title="الإحالات والهدايا" back /><EmptyState icon="gift-outline" title="سجّل الدخول أولًا" text="رابط الإحالة والمكافآت والكوبونات مرتبطة بحسابك ولا يمكن استخدامها من حساب آخر." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (query.isLoading) return <Screen><AppHeader title="الإحالات والهدايا" back /><LoadingState label="نجهّز رابطك ومكافآتك…" /></Screen>;
  if (query.isError || !query.data) return <Screen><AppHeader title="الإحالات والهدايا" back /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل الإحالات" text={query.error instanceof Error ? query.error.message : "حاول مرة أخرى بعد قليل."} action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void query.refetch()} />} /></Screen>;

  const data = query.data;
  const terms = termLines(data.program.terms);
  const percent = Number.isFinite(data.referral.progressPercent) ? Math.min(100, Math.max(0, data.referral.progressPercent)) : 0;
  const enabledTiers = data.tiers.filter((tier) => tier.enabled).sort((a, b) => a.requiredReferrals - b.requiredReferrals);
  const share = async () => {
    if (sharing || !data.program.enabled) return;
    const url = safeExternalLink(data.referral.shareUrl);
    if (!url) { setFeedback("تعذر فتح رابط الدعوة. أعد تحميل الصفحة ثم حاول مجددًا."); return; }
    setSharing(true); setFeedback("");
    try {
      const result = await Share.share({
        title: "تعلّم معي في مراس العلم",
        message: `سجّل في مراس العلم من رابط دعوتي، واستكشف المواد الجامعية والدروس التجريبية:\n${url}`,
        url,
      });
      if (result.action === Share.sharedAction) {
        void api("/api/referrals", { method: "POST", body: jsonBody({ action: "track_share", channel: "native_share" }) }).catch(() => undefined);
      }
    } catch { setFeedback("تعذرت المشاركة الآن. يمكنك تحديد الرابط أدناه ونسخه."); }
    finally { setSharing(false); }
  };

  return <Screen>
    <AppHeader title="الإحالات والهدايا" subtitle="ادعُ أصدقاءك وتقدّم نحو مكافأتك" back />

    <FadeIn><LinearGradient colors={[colors.primaryDark, colors.primary, colors.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { direction }]}>
      <View pointerEvents="none" style={styles.orbit} />
      <View style={styles.heroTop}><View style={styles.giftIcon}><Ionicons name="gift-outline" size={29} color={colors.onPrimary} /></View><Text style={styles.eyebrow}>{data.program.enabled ? "أثر جميل يبدأ بدعوة" : "برنامج الإحالات متوقف مؤقتًا"}</Text></View>
      <Text style={styles.heroTitle}>{data.program.title || "شارك المعرفة.\nواحتفل بمكافأتك."}</Text>
      <Text style={styles.heroText}>{data.program.description}</Text>
      <View style={styles.heroStats}>
        <View style={styles.stat}><Text style={styles.statValue}>{data.referral.counts.qualified}</Text><Text style={styles.statLabel}>إحالة مكتملة</Text></View>
        <View style={[styles.stat, styles.statDivider]}><Text style={styles.statValue}>{data.referral.counts.pending}</Text><Text style={styles.statLabel}>قيد التأهيل</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{data.rewards.length}</Text><Text style={styles.statLabel}>هدية مكتسبة</Text></View>
      </View>
    </LinearGradient></FadeIn>

    <FadeIn delay={50}><Card style={styles.invitationCard}>
      <View style={styles.invitationHead}><View style={[styles.progressIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="link-outline" size={23} color={colors.primary} /></View><View style={styles.progressCopy}><Text style={[styles.progressTitle, { color: colors.text }]}>دعوتك الخاصة</Text><Text style={[styles.progressText, { color: colors.textSoft }]}>رابط واحد يصل بأصدقائك إلى مراس</Text></View></View>
      <View style={[styles.linkBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Text style={[styles.linkLabel, { color: colors.textSoft }]}>رمز الدعوة</Text><Text selectable style={[styles.code, { color: colors.primary }]}>{data.referral.code}</Text></View>
      <Text selectable style={[styles.shareUrl, { color: colors.textSoft }]}>{data.referral.shareUrl}</Text>
      <AppButton title={data.program.enabled ? "شارك دعوتك" : "المشاركة غير متاحة حاليًا"} icon="share-social-outline" loading={sharing} disabled={!data.program.enabled} onPress={() => void share()} />
      {feedback ? <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.danger }]}>{feedback}</Text> : null}
    </Card></FadeIn>

    {nextTier ? <Card style={styles.progressCard}>
      <View style={styles.progressHead}><View style={[styles.progressIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="trophy-outline" size={22} color={colors.primary} /></View><View style={styles.progressCopy}><Text style={[styles.progressTitle, { color: colors.text }]}>هديتك التالية: {nextTier.rewardLabel}</Text><Text style={[styles.progressText, { color: colors.textSoft }]}>{nextTier.description || `أكمل ${nextTier.requiredReferrals} إحالات مؤهلة للحصول عليها تلقائيًا.`}</Text></View><Text style={[styles.progressNumber, { color: colors.primary }]}>{percent}%</Text></View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}><LinearGradient colors={[colors.primary, colors.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${percent}%` }]} /></View>
      <Text style={[styles.progressHint, { color: colors.textSoft }]}>{data.program.qualificationLabel}</Text>
    </Card> : <Card style={styles.completedCard}><Ionicons name="ribbon" size={28} color={colors.success} /><View style={styles.progressCopy}><Text style={[styles.progressTitle, { color: colors.text }]}>{enabledTiers.length ? "أكملت جميع المستويات الحالية" : "مستويات جديدة في الطريق"}</Text><Text style={[styles.progressText, { color: colors.textSoft }]}>أي مستوى جديد تضيفه الإدارة سيظهر لك هنا تلقائيًا.</Text></View></Card>}

    <SectionTitle title="مستويات المكافآت" subtitle="كل مكافأة تُصدر تلقائيًا مرة واحدة عند اكتمال عدد الإحالات المؤهلة" />
    <View style={styles.tiers}>{enabledTiers.map((tier, index) => <Card key={tier.id} style={[styles.tier, tier.earned && { borderColor: `${colors.success}66` }]}>
      <View style={[styles.tierBadge, { backgroundColor: tier.earned ? `${colors.success}18` : colors.surfaceAlt }]}><Ionicons name={tier.earned ? "checkmark-circle" : "people-outline"} size={21} color={tier.earned ? colors.success : colors.primary} /></View>
      <View style={styles.tierCopy}><Text style={[styles.tierName, { color: colors.text }]}>{index + 1}. {tier.name}</Text><Text style={[styles.tierRule, { color: colors.textSoft }]}>{tier.requiredReferrals} إحالات مؤهلة · {tier.rewardLabel}</Text><Text style={[styles.tierDescription, { color: colors.textSoft }]}>{tier.description}</Text><View style={styles.tierStatusRow}><Ionicons name={tier.earned ? "checkmark-circle" : "ellipse-outline"} size={15} color={tier.earned ? colors.success : colors.primary} /><Text style={[styles.tierState, { color: tier.earned ? colors.success : colors.primary }]}>{tier.earned ? "حصلت عليها" : "بانتظار اكتمال الإحالات"}</Text></View></View>
    </Card>)}</View>

    <SectionTitle title="كوبوناتي وهداياي" subtitle="هذه المكافآت مملوكة لحسابك وحده وتُطبّق عند الشراء" />
    {data.coupons.length ? <View style={styles.coupons}>{data.coupons.map((coupon) => {
      const unavailable = coupon.used || ["expired", "disabled", "revoked"].includes(coupon.status);
      return <Card key={coupon.id} style={[styles.coupon, unavailable && styles.muted]}>
        <View style={[styles.couponSide, { backgroundColor: unavailable ? colors.surfaceAlt : colors.primary }]}><Ionicons name={coupon.used ? "checkmark-done" : "ticket-outline"} size={25} color={unavailable ? colors.textSoft : "#FFF"} /><Text style={{ color: unavailable ? colors.textSoft : "#FFF" }}>{couponValueLabel(coupon)}</Text></View>
        <View style={styles.couponCopy}><Text style={[styles.couponCode, { color: colors.text }]} selectable>{coupon.code}</Text><Text style={[styles.couponMeta, { color: colors.textSoft }]}>{coupon.courseSlug ? "مخصص لمادة محددة" : "صالح على أي مادة مؤهلة"} · {dateLabel(coupon.expiresAt, locale)}</Text><Text style={[styles.couponStatus, { color: unavailable ? colors.textSoft : colors.success }]}>{coupon.used ? "تم استخدامه" : statusLabels[coupon.status] || coupon.status}</Text></View>
      </Card>;
    })}</View> : <EmptyState icon="ticket-outline" title="لم تصدر لك هدية بعد" text="شارك رابطك. عند اكتمال أول مستوى ستجد الكوبون هنا وسيصلك إشعار مباشر." />}

    {data.rewards.length ? <><SectionTitle title="سجل مكافآتك" subtitle="كل هدية وحالتها في مكان واحد" /><View style={styles.coupons}>{data.rewards.map((reward) => <Card key={reward.id} style={styles.rewardRow}><View style={[styles.progressIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="ribbon-outline" size={22} color={colors.primary} /></View><View style={styles.progressCopy}><Text style={[styles.progressTitle, { color: colors.text }]}>{reward.title}</Text><Text style={[styles.progressText, { color: colors.textSoft }]}>{statusLabels[reward.status] || reward.status} · {dateLabel(reward.expiresAt, locale)}</Text></View></Card>)}</View></> : null}

    <SectionTitle title="كيف تُحتسب الإحالة؟" />
    {terms.length ? <Card style={styles.terms}>{terms.map((term, index) => <View key={`${index}-${term}`} style={styles.term}><View style={[styles.termNumber, { backgroundColor: colors.surfaceAlt }]}><Text style={{ color: colors.primary }}>{index + 1}</Text></View><Text style={[styles.termText, { color: colors.textSoft }]}>{term}</Text></View>)}</Card> : <Card style={styles.terms}><Text style={[styles.termText, { color: colors.textSoft }]}>{data.program.qualificationLabel}</Text></Card>}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 30, padding: 23, overflow: "hidden", marginTop: 2 },
  orbit: { position: "absolute", width: 260, height: 260, borderRadius: 130, borderWidth: 1, borderColor: "rgba(255,255,255,.18)", end: -145, top: -75 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 }, giftIcon: { width: 54, height: 54, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.14)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)" },
  eyebrow: { color: "#FFF", opacity: .9, fontSize: 12, lineHeight: 21, fontWeight: "800", flex: 1 }, heroTitle: { color: "#FFF", fontSize: 28, lineHeight: 42, fontWeight: "900", marginTop: 20 }, heroText: { color: "#FFF", opacity: .85, fontSize: 13, lineHeight: 25, marginTop: 11 },
  heroStats: { flexDirection: "row", marginTop: 24, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.2)", paddingTop: 20 }, stat: { flex: 1, alignItems: "center", paddingHorizontal: 5, gap: 5 }, statDivider: { borderStartWidth: 1, borderEndWidth: 1, borderColor: "rgba(255,255,255,.2)" }, statValue: { color: "#FFF", fontSize: 25, lineHeight: 33, fontWeight: "900", textAlign: "center" }, statLabel: { color: "#FFF", opacity: .8, fontSize: 11, lineHeight: 18, textAlign: "center" },
  invitationCard: { marginTop: 15, padding: 20, gap: 14 }, invitationHead: { flexDirection: "row", alignItems: "center", gap: 12 }, linkBox: { borderWidth: 1, borderStyle: "dashed", borderRadius: 16, padding: 14, gap: 5 }, linkLabel: { fontSize: 11, lineHeight: 18 }, code: { fontSize: 21, lineHeight: 30, fontWeight: "900", letterSpacing: 1.4, writingDirection: "ltr", textAlign: "center" }, shareUrl: { fontSize: 11, lineHeight: 19, writingDirection: "ltr", textAlign: "center" }, feedback: { fontSize: 12, lineHeight: 21 },
  progressCard: { marginTop: 15, padding: 20 }, progressHead: { flexDirection: "row", alignItems: "center", gap: 11, flexWrap: "wrap" }, progressIcon: { width: 44, height: 44, flexShrink: 0, borderRadius: 15, alignItems: "center", justifyContent: "center" }, progressCopy: { flex: 1, minWidth: 0 }, progressTitle: { fontSize: 15, lineHeight: 24, fontWeight: "900" }, progressText: { fontSize: 11, lineHeight: 20, marginTop: 4 }, progressNumber: { fontSize: 17, lineHeight: 26, fontWeight: "900" },
  progressTrack: { height: 9, borderRadius: 99, overflow: "hidden", marginTop: 18 }, progressFill: { height: "100%", borderRadius: 99 }, progressHint: { fontSize: 11, lineHeight: 20, marginTop: 11 }, completedCard: { marginTop: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  tiers: { gap: 12 }, tier: { minHeight: 112, flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 18 }, tierBadge: { width: 42, height: 42, flexShrink: 0, borderRadius: 14, alignItems: "center", justifyContent: "center" }, tierCopy: { flex: 1, minWidth: 0 }, tierName: { fontSize: 16, lineHeight: 25, fontWeight: "900" }, tierRule: { fontSize: 12, lineHeight: 21, fontWeight: "800", marginTop: 5 }, tierDescription: { fontSize: 11, lineHeight: 20, marginTop: 4 }, tierStatusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 }, tierState: { flex: 1, fontSize: 11, lineHeight: 19, fontWeight: "800" },
  coupons: { gap: 12 }, coupon: { flexDirection: "row", padding: 0, overflow: "hidden", minHeight: 118 }, muted: { opacity: .68 }, couponSide: { width: 75, alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 5 }, couponCopy: { flex: 1, minWidth: 0, justifyContent: "center", padding: 15 }, couponCode: { fontSize: 16, lineHeight: 26, fontWeight: "900", letterSpacing: .8, writingDirection: "ltr" }, couponMeta: { fontSize: 11, lineHeight: 20, marginTop: 5 }, couponStatus: { fontSize: 11, lineHeight: 20, fontWeight: "900", marginTop: 7 }, rewardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  terms: { gap: 16, padding: 20 }, term: { flexDirection: "row", alignItems: "flex-start", gap: 11 }, termNumber: { width: 28, height: 28, flexShrink: 0, borderRadius: 10, alignItems: "center", justifyContent: "center" }, termText: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 23 },
});
