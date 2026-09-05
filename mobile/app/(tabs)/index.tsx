import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { InstitutionCard } from "@/src/components/InstitutionCard";
import { HomeLearningTracks } from "@/src/components/LearningTracks";
import { HomePartners } from "@/src/components/HomePartners";
import { AppButton, Card, EmptyState, FadeIn, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, STORE_COMMERCE_ENABLED } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog, Dashboard, PublicSettings } from "@/src/types";

export default function Home() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { direction, rowDirection, isRTL } = useLanguage();
  const wide = width >= 1000;
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const dashboard = useQuery({ queryKey: ["dashboard", user?.id], queryFn: () => api<Dashboard>("/api/mobile/dashboard"), enabled: Boolean(user) });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<{ ok: true; settings: PublicSettings }>("/api/public/settings") });

  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  if (catalog.isError) return <Screen><AppHeader title="مراس العلم" subtitle="تعلم بعمق، نصل أبعد" /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل الكتالوج" text={catalog.error instanceof Error ? catalog.error.message : "تحقق من اتصالك ثم حاول مرة أخرى."} action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void catalog.refetch()} />} /></Screen>;

  const allCourses = catalog.data?.courses || [];
  const featuredCourses = [...allCourses].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).slice(0, 8);
  const featuredInstitutions = [...(catalog.data?.institutions || [])].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).slice(0, 8);
  const recommended = dashboard.data?.recommended.length ? dashboard.data.recommended : featuredCourses;
  const first = dashboard.data?.owned[0];
  const progress = Math.max(0, Math.min(100, first?.progress || 0));
  const unread = dashboard.data?.notifications.filter((item) => !item.readAt).length || 0;
  const platform = settings.data?.settings;
  const arrow = isRTL ? "arrow-back" : "arrow-forward";
  const quickLinks = [
    { icon: "layers-outline" as const, title: "أدوات مراس", text: "ملفاتك، بفهم أعمق", route: "/(tabs)/ai", tint: `${colors.primary}14`, ink: colors.primary },
    { icon: "cloud-upload-outline" as const, title: "اطلب مادتك", text: "دعنا نعرف ما تحتاجه", route: user ? "/requests" : "/(auth)/login", tint: `${colors.violet}14`, ink: colors.violet },
    { icon: "gift-outline" as const, title: "الإحالات والهدايا", text: "تعلّم وشارك المكافآت", route: "/referrals", tint: `${colors.accent}12`, ink: colors.accent },
    { icon: "headset-outline" as const, title: "نحن معك", text: "تواصل مع فريق الدعم", route: "/support", tint: colors.surfaceAlt, ink: colors.primary },
  ];

  return <Screen>
    <AppHeader title={user ? `مرحبًا، ${user.fullName.split(" ")[0]}` : "مراس العلم"} subtitle={user ? dashboard.data?.institutions.find((item) => item.slug === user.universitySlug)?.name || "يوم جديد، وخطوة أقرب" : "تعلّم بعمق، نصل أبعد"} unread={unread} />
    {platform?.announcement ? <View style={[styles.announcement, { backgroundColor: colors.surfaceAlt, flexDirection: rowDirection }]}><Ionicons name="megaphone-outline" size={18} color={colors.primary} /><Text style={[styles.announcementText, { color: colors.text }]}>{platform.announcement}</Text></View> : null}

    <FadeIn>
      <LinearGradient colors={[colors.primaryDark, colors.primary, colors.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, wide && styles.heroWide, width < 380 && { padding: 18, borderRadius: 26 }, { direction }]}>
        <View pointerEvents="none" style={[styles.orbitOuter, { borderColor: `${colors.onPrimary}22` }]} /><View pointerEvents="none" style={[styles.orbitInner, { borderColor: `${colors.onPrimary}30` }]} />
        <View style={[styles.heroLayout, wide && { flexDirection: rowDirection }]}>
          <View style={styles.heroCopyColumn}>
            <View style={[styles.kicker, { flexDirection: rowDirection, backgroundColor: `${colors.onPrimary}12`, borderColor: `${colors.onPrimary}40` }]}><View style={[styles.kickerDot, { backgroundColor: colors.onPrimary }]} /><Text style={[styles.kickerText, { color: colors.onPrimary }]}>{platform?.first_platform_claim_text || "أول منصة سعودية رسمية"}</Text></View>
            <Text style={[styles.heroTitle, wide && styles.heroTitleWide, width < 380 && { fontSize: 30, lineHeight: 44 }, { color: colors.onPrimary }]}>{first ? "خطوة جديدة،\nوفهم أعمق." : "لكل طموح بداية.\nابدأها بفهم."}</Text>
            <Text style={[styles.heroCopy, { color: colors.onPrimary }]}>{first ? "دروسك وملاحظاتك وتقدمك محفوظة. عُد إلى مسارك في أي وقت، وتعلّم على إيقاعك." : "شرح مواد جامعتك، وأدوات تعينك على الدراسة، ومسارات تفتح لك آفاقًا جديدة. كلها في مراس."}</Text>
            <View style={[styles.heroActions, wide && { flexDirection: rowDirection }]}>
              <Pressable accessibilityRole="button" onPress={() => router.push(first ? "/(tabs)/learning" : "/(tabs)/courses")} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.surface, flexDirection: rowDirection, opacity: pressed ? .8 : 1 }]}><Text style={[styles.primaryActionText, { color: colors.primary }]}>{first ? "افتح موادي" : "اكتشف موادك"}</Text><Ionicons name={arrow} size={19} color={colors.primary} /></Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push("/tracks")} style={({ pressed }) => [styles.secondaryAction, { borderColor: `${colors.onPrimary}66`, flexDirection: rowDirection, opacity: pressed ? .7 : 1 }]}><Text style={[styles.secondaryActionText, { color: colors.onPrimary }]}>استكشف المسارات</Text><Ionicons name="compass-outline" size={18} color={colors.onPrimary} /></Pressable>
            </View>
          </View>

          {first ? <View style={[styles.studyCard, wide && styles.studyCardWide, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <View style={[styles.studyHead, { flexDirection: rowDirection }]}><View style={[styles.studyIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="play-circle-outline" size={23} color={colors.primary} /></View><Text style={[styles.studyEyebrow, { color: colors.textSoft }]}>تابع من حيث توقفت</Text><Ionicons name="bookmark-outline" size={20} color={colors.violet} /></View>
            <Text style={[styles.studyTitle, { color: colors.text }]}>{first.title}</Text>
            <Text style={[styles.studyDetail, { color: colors.textSoft }]}>{first.currentLessonId ? "آخر درس محفوظ في انتظارك" : "رحلتك تبدأ بأول درس"}</Text>
            <View style={[styles.progressMeta, { flexDirection: rowDirection }]}><Text style={[styles.progressLabel, { color: colors.textSoft }]}>تقدمك في المادة</Text><Text style={[styles.progressValue, { color: colors.primary }]}>{progress}%</Text></View>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress}%` }]} /></View>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/learn/[slug]", params: { slug: first.slug } })} style={({ pressed }) => [styles.resume, { backgroundColor: colors.primary, flexDirection: rowDirection, opacity: pressed ? .8 : 1 }]}><Text style={[styles.resumeText, { color: colors.onPrimary }]}>أكمل التعلّم</Text><Ionicons name="play" size={17} color={colors.onPrimary} /></Pressable>
          </View> : <View style={[styles.studyCard, wide && styles.studyCardWide, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <View style={[styles.studyHead, { flexDirection: rowDirection }]}><View style={[styles.studyIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="school-outline" size={23} color={colors.primary} /></View><Text style={[styles.studyEyebrow, { color: colors.textSoft }]}>من أول سؤال إلى فهم أعمق</Text></View>
            {[{ icon: "search-outline" as const, title: "اعثر على مادتك", text: "بحسب الجامعة والتخصص" }, { icon: "play-circle-outline" as const, title: "شاهد الشرح", text: "دروس مرتبة وبوتيرتك" }, { icon: "bookmark-outline" as const, title: "ثبّت ما تعلّمته", text: "ملاحظاتك عند لحظتها" }].map((step, index) => <View key={step.title} style={[styles.studyStep, { borderTopColor: colors.border, flexDirection: rowDirection }]}><View style={[styles.stepNumber, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.stepNumberText, { color: colors.primary }]}>{String(index + 1).padStart(2, "0")}</Text></View><View style={styles.stepCopy}><Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text><Text style={[styles.stepText, { color: colors.textSoft }]}>{step.text}</Text></View><Ionicons name={step.icon} size={20} color={colors.violet} /></View>)}
          </View>}
        </View>
      </LinearGradient>
    </FadeIn>

    <FadeIn delay={70}><View style={[styles.platformLine, { flexDirection: rowDirection, borderBottomColor: colors.border }]}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /><Text style={[styles.platformLineText, { color: colors.textSoft }]}>{first ? "رحلتك تستحق أن تكمل" : "مساحة للفهم. وبداية للأثر."}</Text></View></FadeIn>

    {recommended.length ? <FadeIn delay={110}><SectionTitle title={user ? "اختر خطوتك التالية" : "مواد تستحق أن تبدأ بها"} subtitle={user ? "مرتبطة بجامعتك وتخصصك أولًا" : "اكتشف الشرح المناسب لمسارك الجامعي"} action={<Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/courses")} style={styles.sectionLink}><Text style={[styles.sectionLinkText, { color: colors.primary }]}>كل المواد</Text><Ionicons name={arrow} size={16} color={colors.primary} /></Pressable>} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontal, { direction, flexDirection: rowDirection }]}>{recommended.map((course) => <CourseCard key={course.slug} course={course} />)}</ScrollView></FadeIn> : null}

    <FadeIn delay={150}><SectionTitle title="جامعتك، أقرب إليك" subtitle="تصفّح الجامعة ثم اختر تخصصك" action={<Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/universities")} style={styles.sectionLink}><Text style={[styles.sectionLinkText, { color: colors.primary }]}>كل الجامعات</Text><Ionicons name={arrow} size={16} color={colors.primary} /></Pressable>} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontal, { direction, flexDirection: rowDirection }]}>{featuredInstitutions.map((institution) => <InstitutionCard key={institution.slug} institution={institution} />)}</ScrollView></FadeIn>

    <SectionTitle title="أكثر من شرح" subtitle="تفاصيل صغيرة تصنع فرقًا في يومك الدراسي" />
    <View style={[styles.quickGrid, { flexDirection: rowDirection }]}>{quickLinks.map((item, index) => <FadeIn key={item.title} delay={index * 35} style={{ width: wide ? "23.5%" : width < 380 ? "100%" : "48%" }}><Pressable accessibilityRole="button" onPress={() => router.push(item.route as never)} style={({ pressed }) => ({ opacity: pressed ? .75 : 1 })}><Card style={styles.quick}><View style={[styles.quickIcon, { backgroundColor: item.tint }]}><Ionicons name={item.icon} size={23} color={item.ink} /></View><Text style={[styles.quickTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.quickCopy, { color: colors.textSoft }]}>{item.text}</Text><Ionicons name={arrow} size={17} color={colors.textSoft} style={styles.quickArrow} /></Card></Pressable></FadeIn>)}</View>

    {STORE_COMMERCE_ENABLED && platform?.payment_methods_marketing_enabled !== "false" ? <FadeIn><View style={[styles.payment, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.paymentHeader, { flexDirection: rowDirection }]}><View style={[styles.paymentIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="wallet-outline" size={24} color={colors.primary} /></View><View style={styles.paymentCopy}><Text style={[styles.paymentTitle, { color: colors.text }]}>تعلّم اليوم، واختر طريقة الدفع</Text><Text style={[styles.paymentText, { color: colors.textSoft }]}>خيارات التقسيط عبر Tap حسب أهلية الطلب</Text></View></View><View style={[styles.paymentBrands, { flexDirection: rowDirection }]}><View style={[styles.brandPill, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.brandText, { color: colors.primary }]}>تابي</Text></View><View style={[styles.brandPill, { backgroundColor: `${colors.violet}14` }]}><Text style={[styles.brandText, { color: colors.violet }]}>تمارا</Text></View>{["مدى", "Visa", "Mastercard", "Apple Pay", "Tap"].map((method) => <View key={method} style={[styles.brandPill, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.brandText, { color: colors.text }]}>{method}</Text></View>)}</View></View></FadeIn> : null}

    <HomeLearningTracks />
    <HomePartners />
  </Screen>;
}

const styles = StyleSheet.create({
  announcement: { minHeight: 48, borderRadius: 15, padding: 13, alignItems: "center", gap: 10, marginBottom: 12 }, announcementText: { flex: 1, fontSize: 11, lineHeight: 19 },
  hero: { borderRadius: 34, padding: 24, overflow: "hidden", marginTop: 8 }, heroWide: { padding: 38 }, heroLayout: { gap: 32 }, heroCopyColumn: { flex: 1, minWidth: 0 },
  orbitOuter: { position: "absolute", width: 390, height: 390, borderRadius: 195, borderWidth: 1, bottom: -200, end: -130 }, orbitInner: { position: "absolute", width: 270, height: 270, borderRadius: 135, borderWidth: 1, bottom: -145, end: -70 },
  kicker: { alignSelf: "flex-start", maxWidth: "100%", alignItems: "center", gap: 9, marginBottom: 18, paddingVertical: 10, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 }, kickerDot: { width: 6, height: 6, borderRadius: 5 }, kickerText: { fontSize: 14, fontWeight: "900", flexShrink: 1, lineHeight: 22 },
  heroTitle: { fontSize: 35, lineHeight: 49, fontWeight: "900", letterSpacing: -.7 }, heroTitleWide: { fontSize: 46, lineHeight: 62 }, heroCopy: { fontSize: 13, lineHeight: 25, marginTop: 16, maxWidth: 490, opacity: .9 }, heroActions: { flexWrap: "wrap", gap: 10, marginTop: 27 },
  primaryAction: { minHeight: 54, borderRadius: 17, paddingHorizontal: 20, alignItems: "center", justifyContent: "space-between", gap: 18 }, primaryActionText: { fontSize: 14, fontWeight: "900", flexShrink: 1 }, secondaryAction: { minHeight: 48, borderRadius: 17, alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 15, borderWidth: 1 }, secondaryActionText: { fontSize: 12, fontWeight: "700" },
  studyCard: { borderRadius: 24, borderWidth: 1, padding: 19, gap: 4, shadowOffset: { width: 0, height: 12 }, shadowOpacity: .17, shadowRadius: 24, elevation: 4 }, studyCardWide: { flex: 1, maxWidth: 340, alignSelf: "center" }, studyHead: { alignItems: "center", gap: 10, paddingBottom: 9 }, studyIcon: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" }, studyEyebrow: { fontSize: 11, lineHeight: 19, fontWeight: "800", flex: 1 }, studyTitle: { fontSize: 23, lineHeight: 33, fontWeight: "900", marginTop: 10 }, studyDetail: { fontSize: 11, lineHeight: 19, marginTop: 7 }, studyStep: { alignItems: "center", gap: 11, borderTopWidth: 1, paddingVertical: 15 }, stepNumber: { width: 31, height: 31, borderRadius: 11, alignItems: "center", justifyContent: "center" }, stepNumberText: { fontSize: 11, fontWeight: "800" }, stepCopy: { flex: 1 }, stepTitle: { fontSize: 13, fontWeight: "800" }, stepText: { fontSize: 10, marginTop: 4 },
  progressMeta: { justifyContent: "space-between", alignItems: "center", marginTop: 18 }, progressLabel: { fontSize: 10 }, progressValue: { fontSize: 12, fontWeight: "900" }, progressTrack: { width: "100%", height: 7, borderRadius: 4, marginTop: 8, overflow: "hidden" }, progressFill: { height: 7, borderRadius: 4 }, resume: { minHeight: 48, paddingHorizontal: 16, borderRadius: 15, alignItems: "center", justifyContent: "space-between", marginTop: 20 }, resumeText: { fontSize: 12, fontWeight: "800" },
  platformLine: { minHeight: 69, alignItems: "center", gap: 10, paddingHorizontal: 4, paddingVertical: 16, borderBottomWidth: 1 }, platformLineText: { flex: 1, fontSize: 12, lineHeight: 21 }, horizontal: { paddingEnd: 18, paddingBottom: 6 }, sectionLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5 }, sectionLinkText: { fontSize: 11, fontWeight: "800" },
  quickGrid: { flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }, quick: { minHeight: 164, padding: 16 }, quickIcon: { width: 43, height: 43, borderRadius: 15, alignItems: "center", justifyContent: "center" }, quickTitle: { fontSize: 13, lineHeight: 22, fontWeight: "900", marginTop: 13 }, quickCopy: { fontSize: 10, lineHeight: 18, marginTop: 3 }, quickArrow: { alignSelf: "flex-end", marginTop: 8 },
  payment: { borderRadius: 24, borderWidth: 1, padding: 20, marginTop: 28 }, paymentHeader: { alignItems: "center", gap: 13 }, paymentIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" }, paymentCopy: { flex: 1 }, paymentTitle: { fontSize: 15, fontWeight: "900", lineHeight: 23 }, paymentText: { fontSize: 11, lineHeight: 20, marginTop: 4 }, paymentBrands: { gap: 9, marginTop: 18, flexWrap: "wrap" }, brandPill: { minWidth: 78, minHeight: 42, paddingHorizontal: 19, borderRadius: 13, alignItems: "center", justifyContent: "center" }, brandText: { fontSize: 14, fontWeight: "900" },
});
