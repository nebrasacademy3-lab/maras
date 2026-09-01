import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
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

type ReferralsResponse = {
  ok: true;
  program: { enabled: boolean; title: string; description: string; qualificationLabel: string; terms: string[] };
  referral: {
    code: string;
    shareUrl: string;
    counts: { total: number; pending: number; qualified: number; rejected: number };
    nextTier: ReferralTier | null;
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

function dateLabel(value: string | null) {
  if (!value) return "بلا تاريخ انتهاء";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `ينتهي ${new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
}

export default function ReferralsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [sharing, setSharing] = useState(false);
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
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      void api("/api/referrals", { method: "POST", body: jsonBody({ action: "track_share", channel: "native_share" }) }).catch(() => undefined);
      await Share.share({
        title: "تعلّم معي في مراس العلم",
        message: `سجّل في مراس العلم من رابط دعوتي، واستكشف المواد الجامعية والدروس التجريبية:\n${data.referral.shareUrl}`,
        url: data.referral.shareUrl,
      });
    } finally {
      setSharing(false);
    }
  };

  return <Screen>
    <AppHeader title="الإحالات والهدايا" subtitle="ادعُ أصدقاءك وتقدّم نحو مكافأتك" back />

    <LinearGradient colors={["#061B49", "#115BD6", "#7140E7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroTop}><View style={styles.giftIcon}><Ionicons name="gift" size={25} color="#FFFFFF" /></View><View style={styles.heroCopy}><Text style={styles.eyebrow}>رابطك الشخصي</Text><Text style={styles.heroTitle}>{data.program.title || "شارك مراس واكسب هديتك"}</Text></View></View>
      <Text style={styles.heroText}>{data.program.description}</Text>
      <View style={styles.linkBox}><View style={styles.linkCopy}><Text style={styles.linkLabel}>رمزك</Text><Text selectable style={styles.code}>{data.referral.code}</Text></View><Pressable accessibilityRole="button" onPress={() => void share()} style={styles.shareButton}><Ionicons name="share-social" size={19} color="#155EEF" /><Text style={styles.shareButtonText}>{sharing ? "جارٍ الفتح…" : "مشاركة"}</Text></Pressable></View>
      <View style={styles.heroStats}>
        <View style={styles.stat}><Text style={styles.statValue}>{data.referral.counts.qualified}</Text><Text style={styles.statLabel}>إحالة مكتملة</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{data.referral.counts.pending}</Text><Text style={styles.statLabel}>قيد التأهيل</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{data.rewards.length}</Text><Text style={styles.statLabel}>هدية حصلت عليها</Text></View>
      </View>
    </LinearGradient>

    {nextTier ? <Card style={styles.progressCard}>
      <View style={styles.progressHead}><View style={[styles.progressIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="trophy-outline" size={22} color={colors.primary} /></View><View style={styles.progressCopy}><Text style={[styles.progressTitle, { color: colors.text }]}>هديتك التالية: {nextTier.rewardLabel}</Text><Text style={[styles.progressText, { color: colors.textSoft }]}>{nextTier.description || `أكمل ${nextTier.requiredReferrals} إحالات مؤهلة للحصول عليها تلقائيًا.`}</Text></View><Text style={[styles.progressNumber, { color: colors.primary }]}>{Math.min(100, Math.max(0, data.referral.progressPercent))}%</Text></View>
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}><LinearGradient colors={[colors.primary, "#7B46EC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${Math.min(100, Math.max(2, data.referral.progressPercent))}%` }]} /></View>
      <Text style={[styles.progressHint, { color: colors.textSoft }]}>{data.program.qualificationLabel}</Text>
    </Card> : <Card style={styles.completedCard}><Ionicons name="ribbon" size={28} color={colors.success} /><View><Text style={[styles.progressTitle, { color: colors.text }]}>أكملت جميع المستويات الحالية</Text><Text style={[styles.progressText, { color: colors.textSoft }]}>أي مستوى جديد تضيفه الإدارة سيظهر لك هنا تلقائيًا.</Text></View></Card>}

    <SectionTitle title="مستويات المكافآت" subtitle="كل مكافأة تُصدر تلقائيًا مرة واحدة عند اكتمال عدد الإحالات المؤهلة" />
    <View style={styles.tiers}>{data.tiers.filter((tier) => tier.enabled).sort((a, b) => a.requiredReferrals - b.requiredReferrals).map((tier, index) => <Card key={tier.id} style={[styles.tier, tier.earned && { borderColor: `${colors.success}66` }]}>
      <View style={[styles.tierBadge, { backgroundColor: tier.earned ? `${colors.success}18` : colors.surfaceAlt }]}><Ionicons name={tier.earned ? "checkmark-circle" : "people-outline"} size={21} color={tier.earned ? colors.success : colors.primary} /></View>
      <View style={styles.tierCopy}><Text style={[styles.tierName, { color: colors.text }]}>{index + 1}. {tier.name}</Text><Text style={[styles.tierRule, { color: colors.textSoft }]}>{tier.requiredReferrals} إحالات مؤهلة · {tier.rewardLabel}</Text><Text style={[styles.tierDescription, { color: colors.textSoft }]}>{tier.description}</Text></View>
      <Text style={[styles.tierState, { color: tier.earned ? colors.success : colors.primary, backgroundColor: tier.earned ? `${colors.success}12` : colors.surfaceAlt }]}>{tier.earned ? "حصلت عليها" : "متاحة"}</Text>
    </Card>)}</View>

    <SectionTitle title="كوبوناتي وهداياي" subtitle="هذه المكافآت مملوكة لحسابك وحده وتُطبّق عند الشراء" />
    {data.coupons.length ? <View style={styles.coupons}>{data.coupons.map((coupon) => {
      const unavailable = coupon.used || ["expired", "disabled", "revoked"].includes(coupon.status);
      return <Card key={coupon.id} style={[styles.coupon, unavailable && styles.muted]}>
        <View style={[styles.couponSide, { backgroundColor: unavailable ? colors.surfaceAlt : colors.primary }]}><Ionicons name={coupon.used ? "checkmark-done" : "ticket-outline"} size={25} color={unavailable ? colors.textSoft : "#FFF"} /><Text style={{ color: unavailable ? colors.textSoft : "#FFF" }}>{coupon.type === "percentage" ? `${coupon.value}%` : `${coupon.value} ر.س`}</Text></View>
        <View style={styles.couponCopy}><Text style={[styles.couponCode, { color: colors.text }]} selectable>{coupon.code}</Text><Text style={[styles.couponMeta, { color: colors.textSoft }]}>{coupon.courseSlug ? "مخصص لمادة محددة" : "صالح على أي مادة مؤهلة"} · {dateLabel(coupon.expiresAt)}</Text><Text style={[styles.couponStatus, { color: unavailable ? colors.textSoft : colors.success }]}>{coupon.used ? "تم استخدامه" : statusLabels[coupon.status] || coupon.status}</Text></View>
      </Card>;
    })}</View> : <EmptyState icon="ticket-outline" title="لم تصدر لك هدية بعد" text="شارك رابطك. عند اكتمال أول مستوى ستجد الكوبون هنا وسيصلك إشعار مباشر." />}

    <SectionTitle title="كيف تُحتسب الإحالة؟" />
    <Card style={styles.terms}>{data.program.terms.map((term, index) => <View key={`${index}-${term}`} style={styles.term}><View style={[styles.termNumber, { backgroundColor: colors.surfaceAlt }]}><Text style={{ color: colors.primary }}>{index + 1}</Text></View><Text style={[styles.termText, { color: colors.textSoft }]}>{term}</Text></View>)}</Card>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 20, overflow: "hidden", marginTop: 6 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  giftIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.14)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)" },
  heroCopy: { flex: 1, alignItems: "flex-start" }, eyebrow: { color: "#BFD4FF", fontSize: 9, fontWeight: "800" }, heroTitle: { color: "#FFF", fontSize: 20, lineHeight: 29, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  heroText: { color: "#D9E5FF", fontSize: 11, lineHeight: 20, textAlign: "right", writingDirection: "rtl", marginTop: 13 },
  linkBox: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 10, padding: 8, paddingStart: 13, borderRadius: 18, backgroundColor: "rgba(255,255,255,.1)", borderWidth: 1, borderColor: "rgba(255,255,255,.15)", marginTop: 16 },
  linkCopy: { flex: 1, alignItems: "flex-start" }, linkLabel: { color: "#BFD4FF", fontSize: 8 }, code: { color: "#FFF", fontSize: 15, fontWeight: "900", letterSpacing: 1.4 },
  shareButton: { minWidth: 96, minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FFF" }, shareButtonText: { color: "#155EEF", fontSize: 11, fontWeight: "900" },
  heroStats: { flexDirection: "row", marginTop: 17, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,.2)", paddingTop: 15 },
  stat: { flex: 1, alignItems: "center" }, statValue: { color: "#FFF", fontSize: 19, fontWeight: "900", textAlign: "center" }, statLabel: { color: "#BED0EF", fontSize: 8, textAlign: "center", marginTop: 2 },
  progressCard: { marginTop: 13 }, progressHead: { flexDirection: "row", alignItems: "center", gap: 10 }, progressIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }, progressCopy: { flex: 1, alignItems: "flex-start" }, progressTitle: { fontSize: 13, fontWeight: "900", textAlign: "right" }, progressText: { fontSize: 9, lineHeight: 16, textAlign: "right", marginTop: 3 }, progressNumber: { fontSize: 14, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 99, overflow: "hidden", marginTop: 15 }, progressFill: { height: "100%", borderRadius: 99 }, progressHint: { fontSize: 8, lineHeight: 15, textAlign: "right", marginTop: 8 }, completedCard: { marginTop: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  tiers: { gap: 9 }, tier: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 10 }, tierBadge: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, tierCopy: { flex: 1, alignItems: "flex-start" }, tierName: { fontSize: 12, fontWeight: "900", textAlign: "right" }, tierRule: { fontSize: 9, fontWeight: "800", marginTop: 4, textAlign: "right" }, tierDescription: { fontSize: 8, lineHeight: 14, textAlign: "right", marginTop: 3 }, tierState: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, fontSize: 8, fontWeight: "900" },
  coupons: { gap: 9 }, coupon: { flexDirection: "row", padding: 0, overflow: "hidden", minHeight: 100 }, muted: { opacity: .68 }, couponSide: { width: 82, alignItems: "center", justifyContent: "center", gap: 6 }, couponCopy: { flex: 1, alignItems: "flex-start", justifyContent: "center", padding: 13 }, couponCode: { fontSize: 15, fontWeight: "900", letterSpacing: .8 }, couponMeta: { fontSize: 8, lineHeight: 15, textAlign: "right", marginTop: 4 }, couponStatus: { fontSize: 9, fontWeight: "900", marginTop: 5 },
  terms: { gap: 11 }, term: { flexDirection: "row", alignItems: "flex-start", gap: 9 }, termNumber: { width: 28, height: 28, flexShrink: 0, borderRadius: 10, alignItems: "center", justifyContent: "center" }, termText: { flex: 1, fontSize: 9, lineHeight: 17, textAlign: "right", writingDirection: "rtl" },
});
