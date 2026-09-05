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
  const wide = width >= 720;
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
    { icon: "layers-outline" as const, title: "أدوات مراس", text: "ملفاتك، بفهم أعمق", route: "/(tabs)/ai", tint: "#DDF5EB", ink: "#175B48" },
    { icon: "cloud-upload-outline" as const, title: "اطلب مادتك", text: "دعنا نعرف ما تحتاجه", route: user ? "/requests" : "/(auth)/login", tint: "#E5EDFF", ink: "#314F87" },
    { icon: "gift-outline" as const, title: "الإحالات والهدايا", text: "تعلّم وشارك المكافآت", route: "/referrals", tint: "#FFF0DB", ink: "#805A23" },
    { icon: "headset-outline" as const, title: "نحن معك", text: "تواصل مع فريق الدعم", route: "/support", tint: "#EDE8FF", ink: "#60468E" },
  ];

  return <Screen>
    <AppHeader title={user ? `مرحبًا، ${user.fullName.split(" ")[0]}` : "مراس العلم"} subtitle={user ? dashboard.data?.institutions.find((item) => item.slug === user.universitySlug)?.name || "يوم جديد، وخطوة أقرب" : "تعلّم بعمق، نصل أبعد"} unread={unread} />
    {platform?.announcement ? <View style={[styles.announcement, { backgroundColor: colors.surfaceAlt, flexDirection: rowDirection }]}><Ionicons name="megaphone-outline" size={18} color={colors.primary} /><Text style={[styles.announcementText, { color: colors.text }]}>{platform.announcement}</Text></View> : null}

    <FadeIn>
      <LinearGradient colors={["#091D31", "#12384A", "#155852"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, wide && styles.heroWide, { direction }]}>
        <View pointerEvents="none" style={styles.orbitOuter} /><View pointerEvents="none" style={styles.orbitInner} />
        <View style={[styles.heroLayout, wide && { flexDirection: rowDirection }]}>
          <View style={styles.heroCopyColumn}>
            <View style={[styles.kicker, { flexDirection: rowDirection }]}><View style={styles.kickerDot} /><Text style={styles.kickerText}>{first ? "رحلتك تستحق أن تكمل" : "مساحة للفهم. وبداية للأثر."}</Text></View>
            <Text style={[styles.heroTitle, wide && styles.heroTitleWide]}>{first ? "خطوة جديدة،\nوفهم أعمق." : "لكل طموح بداية.\nابدأها بفهم."}</Text>
            <Text style={styles.heroCopy}>{first ? "دروسك وملاحظاتك وتقدمك محفوظة. عُد إلى مسارك في أي وقت، وتعلّم على إيقاعك." : "شرح مواد جامعتك، وأدوات تعينك على الدراسة، ومسارات تفتح لك آفاقًا جديدة. كلها في مراس."}</Text>
            <View style={[styles.heroActions, wide && { flexDirection: rowDirection }]}>
              <Pressable accessibilityRole="button" onPress={() => router.push(first ? "/(tabs)/learning" : "/(tabs)/courses")} style={({ pressed }) => [styles.primaryAction, { flexDirection: rowDirection, opacity: pressed ? .8 : 1 }]}><Text style={styles.primaryActionText}>{first ? "افتح موادي" : "اكتشف موادك"}</Text><Ionicons name={arrow} size={19} color="#092D2C" /></Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push("/tracks")} style={({ pressed }) => [styles.secondaryAction, { flexDirection: rowDirection, opacity: pressed ? .7 : 1 }]}><Text style={styles.secondaryActionText}>استكشف المسارات</Text><Ionicons name="compass-outline" size={18} color="#D3ECE8" /></Pressable>
            </View>
          </View>

          {first ? <View style={[styles.studyCard, wide && styles.studyCardWide]}>
            <View style={[styles.studyHead, { flexDirection: rowDirection }]}><View style={styles.studyIcon}><Ionicons name="play-circle-outline" size={23} color="#145B51" /></View><Text style={styles.studyEyebrow}>تابع من حيث توقفت</Text><Ionicons name="bookmark-outline" size={20} color="#397369" /></View>
            <Text numberOfLines={2} style={styles.studyTitle}>{first.title}</Text>
            <Text style={styles.studyDetail}>{first.currentLessonId ? "آخر درس محفوظ في انتظارك" : "رحلتك تبدأ بأول درس"}</Text>
            <View style={[styles.progressMeta, { flexDirection: rowDirection }]}><Text style={styles.progressLabel}>تقدمك في المادة</Text><Text style={styles.progressValue}>{progress}%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/learn/[slug]", params: { slug: first.slug } })} style={({ pressed }) => [styles.resume, { flexDirection: rowDirection, opacity: pressed ? .8 : 1 }]}><Text style={styles.resumeText}>أكمل التعلّم</Text><Ionicons name="play" size={17} color="#FFF" /></Pressable>
          </View> : <View style={[styles.studyCard, wide && styles.studyCardWide]}>
            <View style={[styles.studyHead, { flexDirection: rowDirection }]}><View style={styles.studyIcon}><Ionicons name="school-outline" size={23} color="#145B51" /></View><Text style={styles.studyEyebrow}>من أول سؤال إلى فهم أعمق</Text></View>
            {[{ icon: "search-outline" as const, title: "اعثر على مادتك", text: "بحسب الجامعة والتخصص" }, { icon: "play-circle-outline" as const, title: "شاهد الشرح", text: "دروس مرتبة وبوتيرتك" }, { icon: "bookmark-outline" as const, title: "ثبّت ما تعلّمته", text: "ملاحظاتك عند لحظتها" }].map((step, index) => <View key={step.title} style={[styles.studyStep, { flexDirection: rowDirection }]}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{String(index + 1).padStart(2, "0")}</Text></View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{step.title}</Text><Text style={styles.stepText}>{step.text}</Text></View><Ionicons name={step.icon} size={20} color="#488077" /></View>)}
          </View>}
        </View>
      </LinearGradient>
    </FadeIn>

    <FadeIn delay={70}><View style={[styles.platformLine, { flexDirection: rowDirection, borderBottomColor: colors.border }]}><Ionicons name="leaf-outline" size={20} color={colors.primary} /><Text style={[styles.platformLineText, { color: colors.textSoft }]}>{platform?.first_platform_claim_text || "تجربة تعلّم سعودية، قريبة من طموحك"}</Text></View></FadeIn>

    {recommended.length ? <FadeIn delay={110}><SectionTitle title={user ? "اختر خطوتك التالية" : "مواد تستحق أن تبدأ بها"} subtitle={user ? "مرتبطة بجامعتك وتخصصك أولًا" : "اكتشف الشرح المناسب لمسارك الجامعي"} action={<Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/courses")} style={styles.sectionLink}><Text style={[styles.sectionLinkText, { color: colors.primary }]}>كل المواد</Text><Ionicons name={arrow} size={16} color={colors.primary} /></Pressable>} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontal, { direction, flexDirection: rowDirection }]}>{recommended.map((course) => <CourseCard key={course.slug} course={course} />)}</ScrollView></FadeIn> : null}

    <FadeIn delay={150}><SectionTitle title="جامعتك، أقرب إليك" subtitle="تصفّح الجامعة ثم اختر تخصصك" action={<Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/universities")} style={styles.sectionLink}><Text style={[styles.sectionLinkText, { color: colors.primary }]}>كل الجامعات</Text><Ionicons name={arrow} size={16} color={colors.primary} /></Pressable>} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontal, { direction, flexDirection: rowDirection }]}>{featuredInstitutions.map((institution) => <InstitutionCard key={institution.slug} institution={institution} />)}</ScrollView></FadeIn>

    <SectionTitle title="أكثر من شرح" subtitle="تفاصيل صغيرة تصنع فرقًا في يومك الدراسي" />
    <View style={[styles.quickGrid, { flexDirection: rowDirection }]}>{quickLinks.map((item, index) => <FadeIn key={item.title} delay={index * 35} style={{ width: wide ? "23.5%" : "48%" }}><Pressable accessibilityRole="button" onPress={() => router.push(item.route as never)} style={({ pressed }) => ({ opacity: pressed ? .75 : 1 })}><Card style={styles.quick}><View style={[styles.quickIcon, { backgroundColor: item.tint }]}><Ionicons name={item.icon} size={23} color={item.ink} /></View><Text style={[styles.quickTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.quickCopy, { color: colors.textSoft }]}>{item.text}</Text><Ionicons name={arrow} size={17} color={colors.textSoft} style={styles.quickArrow} /></Card></Pressable></FadeIn>)}</View>

    {STORE_COMMERCE_ENABLED && platform?.payment_methods_marketing_enabled !== "false" ? <FadeIn><View style={[styles.payment, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.paymentHeader, { flexDirection: rowDirection }]}><View style={[styles.paymentIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="wallet-outline" size={24} color={colors.primary} /></View><View style={styles.paymentCopy}><Text style={[styles.paymentTitle, { color: colors.text }]}>تعلّم اليوم، واختر طريقة الدفع</Text><Text style={[styles.paymentText, { color: colors.textSoft }]}>خيارات التقسيط عبر Tap حسب أهلية الطلب</Text></View></View><View style={[styles.paymentBrands, { flexDirection: rowDirection }]}><View style={[styles.brandPill, { backgroundColor: "#DDF8E9" }]}><Text style={[styles.brandText, { color: "#164C37" }]}>تابي</Text></View><View style={[styles.brandPill, { backgroundColor: "#FCE9DD" }]}><Text style={[styles.brandText, { color: "#704024" }]}>تمارا</Text></View><View style={[styles.brandPill, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.brandText, { color: colors.text }]}>Tap</Text></View></View></View></FadeIn> : null}

    <HomeLearningTracks />
    <HomePartners />
  </Screen>;
}

const styles = StyleSheet.create({
  announcement: { minHeight: 48, borderRadius: 15, padding: 13, alignItems: "center", gap: 10, marginBottom: 12 }, announcementText: { flex: 1, fontSize: 11, lineHeight: 19 },
  hero: { borderRadius: 30, padding: 23, overflow: "hidden", marginTop: 8 }, heroWide: { padding: 36 }, heroLayout: { gap: 30 }, heroCopyColumn: { flex: 1, minWidth: 0 },
  orbitOuter: { position: "absolute", width: 390, height: 390, borderRadius: 195, borderWidth: 1, borderColor: "rgba(168,233,211,.12)", bottom: -200, end: -130 }, orbitInner: { position: "absolute", width: 270, height: 270, borderRadius: 135, borderWidth: 1, borderColor: "rgba(168,233,211,.14)", bottom: -145, end: -70 },
  kicker: { alignItems: "center", gap: 8, marginBottom: 16 }, kickerDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: "#ADF0CF" }, kickerText: { color: "#C4E5DE", fontSize: 11, fontWeight: "700", flexShrink: 1, lineHeight: 20 },
  heroTitle: { color: "#FAFFFC", fontSize: 34, lineHeight: 47, fontWeight: "900", letterSpacing: -.7 }, heroTitleWide: { fontSize: 44, lineHeight: 61 }, heroCopy: { color: "#C8DBDC", fontSize: 13, lineHeight: 24, marginTop: 16, maxWidth: 490 }, heroActions: { gap: 10, marginTop: 25 },
  primaryAction: { minHeight: 52, borderRadius: 16, backgroundColor: "#B8EBD2", paddingHorizontal: 20, alignItems: "center", justifyContent: "space-between", gap: 18 }, primaryActionText: { color: "#0D3430", fontSize: 14, fontWeight: "900", flexShrink: 1 }, secondaryAction: { minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 15, borderWidth: 1, borderColor: "rgba(213,238,229,.2)" }, secondaryActionText: { color: "#D3ECE8", fontSize: 12, fontWeight: "700" },
  studyCard: { backgroundColor: "#F1F8F0", borderRadius: 22, padding: 18, gap: 4 }, studyCardWide: { flex: 1, maxWidth: 340, alignSelf: "center" }, studyHead: { alignItems: "center", gap: 10, paddingBottom: 8 }, studyIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#D9EADF", alignItems: "center", justifyContent: "center" }, studyEyebrow: { color: "#365E52", fontSize: 10, lineHeight: 18, fontWeight: "800", flex: 1 }, studyTitle: { color: "#123C33", fontSize: 23, lineHeight: 33, fontWeight: "900", marginTop: 10 }, studyDetail: { color: "#617D72", fontSize: 11, lineHeight: 19, marginTop: 7 }, studyStep: { alignItems: "center", gap: 11, borderTopWidth: 1, borderTopColor: "#DAE7DC", paddingVertical: 14 }, stepNumber: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#E1ECDF", alignItems: "center", justifyContent: "center" }, stepNumberText: { fontSize: 10, fontWeight: "800", color: "#396855" }, stepCopy: { flex: 1 }, stepTitle: { fontSize: 13, fontWeight: "800", color: "#224D40" }, stepText: { fontSize: 10, color: "#6A8173", marginTop: 4 },
  progressMeta: { justifyContent: "space-between", alignItems: "center", marginTop: 18 }, progressLabel: { fontSize: 10, color: "#5C7D6F" }, progressValue: { color: "#255B48", fontSize: 12, fontWeight: "900" }, progressTrack: { width: "100%", height: 6, borderRadius: 4, backgroundColor: "#D7E5D8", marginTop: 8, overflow: "hidden" }, progressFill: { height: 6, borderRadius: 4, backgroundColor: "#367459" }, resume: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: "#225B4D", alignItems: "center", justifyContent: "space-between", marginTop: 20 }, resumeText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  platformLine: { minHeight: 69, alignItems: "center", gap: 10, paddingHorizontal: 4, paddingVertical: 16, borderBottomWidth: 1 }, platformLineText: { flex: 1, fontSize: 11, lineHeight: 20 }, horizontal: { paddingEnd: 18, paddingBottom: 6 }, sectionLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5 }, sectionLinkText: { fontSize: 11, fontWeight: "800" },
  quickGrid: { flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }, quick: { minHeight: 164, padding: 16 }, quickIcon: { width: 43, height: 43, borderRadius: 15, alignItems: "center", justifyContent: "center" }, quickTitle: { fontSize: 13, lineHeight: 22, fontWeight: "900", marginTop: 13 }, quickCopy: { fontSize: 10, lineHeight: 18, marginTop: 3 }, quickArrow: { alignSelf: "flex-end", marginTop: 8 },
  payment: { borderRadius: 24, borderWidth: 1, padding: 20, marginTop: 28 }, paymentHeader: { alignItems: "center", gap: 13 }, paymentIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" }, paymentCopy: { flex: 1 }, paymentTitle: { fontSize: 15, fontWeight: "900", lineHeight: 23 }, paymentText: { fontSize: 11, lineHeight: 20, marginTop: 4 }, paymentBrands: { gap: 9, marginTop: 18, flexWrap: "wrap" }, brandPill: { minWidth: 78, minHeight: 42, paddingHorizontal: 19, borderRadius: 13, alignItems: "center", justifyContent: "center" }, brandText: { fontSize: 17, fontWeight: "900" },
});
