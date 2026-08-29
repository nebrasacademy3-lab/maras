import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard, courseGradient } from "@/src/components/CourseCard";
import { InstitutionCard } from "@/src/components/InstitutionCard";
import { AppButton, Card, FadeIn, HeroGradient, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog, Dashboard, PublicSettings } from "@/src/types";

export default function Home() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const dashboard = useQuery({ queryKey: ["dashboard", user?.id], queryFn: () => api<Dashboard>("/api/mobile/dashboard"), enabled: Boolean(user) });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => api<{ ok: true; settings: PublicSettings }>("/api/public/settings"), staleTime: 5_000 });
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;

  const settings = settingsQuery.data?.settings;
  const featuredCourses = (catalog.data?.courses || []).filter((item) => item.featured).slice(0, 8);
  const featuredInstitutions = (catalog.data?.institutions || []).sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).slice(0, 8);
  const first = dashboard.data?.owned[0];
  const unread = dashboard.data?.notifications.filter((item) => !item.readAt).length || 0;
  const assistantEnabled = settings?.assistant_enabled !== "false";
  const requestsEnabled = settings?.course_requests_enabled !== "false";
  const registrationEnabled = settings?.student_registration_enabled !== "false";
  const heroTitle = `${settings?.home_hero_title || "شرح جامعتك،"} ${settings?.home_hero_highlight || "في مكان واحد."}`;
  const heroSubtitle = settings?.home_hero_subtitle || "اختر جامعتك وتخصصك، استعرض محتوى المادة، وابدأ التعلّم بخطوات واضحة حتى الاختبار.";

  const quickItems = [
    ...(assistantEnabled ? [{ icon: "sparkles-outline" as const, title: "مساعد مراس", text: "اسأل عن أي خدمة", route: "/assistant" }] : []),
    ...(requestsEnabled ? [{ icon: "cloud-upload-outline" as const, title: "طلب مادة", text: "أرسل المقرر والمرفقات", route: user ? "/requests" : "/(auth)/login" }] : []),
    { icon: "headset-outline" as const, title: "الدعم", text: "تذاكر وواتساب", route: "/support" },
    { icon: "notifications-outline" as const, title: "الإشعارات", text: "تابع كل تحديث", route: "/notifications" },
  ];

  return (
    <Screen>
      <AppHeader
        title={user ? `مرحبًا، ${user.fullName.split(" ")[0]}` : "مراس العلم"}
        subtitle={user ? (user.universitySlug ? dashboard.data?.institutions.find((item) => item.slug === user.universitySlug)?.name || "ملفك الجامعي" : "أكمل ملفك") : settings?.home_hero_kicker || "تعلم بعمق، نصل أبعد"}
        unread={unread}
      />

      {settings?.announcement ? <Pressable onPress={() => router.push("/notifications")} style={[styles.announcement, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="megaphone-outline" size={18} color={colors.primary} />
        <Text style={[styles.announcementText, { color: colors.text }]}>{settings.announcement}</Text>
        <Ionicons name="chevron-back" size={16} color={colors.textSoft} />
      </Pressable> : null}

      {first ? <FadeIn>
        <LinearGradient colors={courseGradient(first.color)} style={styles.continue}>
          <View style={styles.continueCopyWrap}>
            <Text style={styles.heroKicker}>تابع من حيث توقفت</Text>
            <Text style={styles.continueTitle}>{first.title}</Text>
            <Text style={styles.continueCopy}>تقدمك {first.progress}% · {first.currentLessonId ? "آخر درس محفوظ" : "ابدأ الآن"}</Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${first.progress}%` }]} /></View>
          </View>
          <Pressable onPress={() => router.push({ pathname: "/learn/[slug]", params: { slug: first.slug } })} style={styles.play}><Ionicons name="play" size={24} color="#155EEF" /></Pressable>
        </LinearGradient>
      </FadeIn> : <HeroGradient>
        <Text style={styles.heroKicker}>{settings?.home_hero_kicker || "منصتك الجامعية في مكان واحد"}</Text>
        <Text style={styles.heroTitle}>{heroTitle}</Text>
        <Text style={styles.heroCopy}>{heroSubtitle}</Text>
        <View style={styles.heroActions}>
          <AppButton title="استكشف المواد" icon="search-outline" onPress={() => router.push("/(tabs)/courses")} />
          {user&&requestsEnabled?<AppButton title="طلب مادة" variant="soft" icon="cloud-upload-outline" onPress={() => router.push("/requests")} />:!user&&registrationEnabled?<AppButton title="أنشئ حسابك" variant="soft" icon="person-add-outline" onPress={() => router.push("/(auth)/register")} />:!user?<AppButton title="تسجيل الدخول" variant="soft" icon="log-in-outline" onPress={() => router.push("/(auth)/login")} />:null}
        </View>
      </HeroGradient>}

      {user ? <View style={styles.snapshotGrid}>
        <SnapshotCard icon="play-circle-outline" value={String(dashboard.data?.owned.length || 0)} label="مواد مفعّلة" colors={colors} />
        {requestsEnabled?<SnapshotCard icon="cloud-upload-outline" value={String(dashboard.data?.requests.length || 0)} label="طلبات مواد" colors={colors} />:<SnapshotCard icon="school-outline" value={String(catalog.data?.institutions.length || 0)} label="جهة تعليمية" colors={colors} />}
        <SnapshotCard icon="notifications-outline" value={String(unread)} label="غير مقروء" colors={colors} />
      </View> : null}

      <SectionTitle title="مقترحة لك" subtitle={user ? "مرتبطة بجامعتك وتخصصك أولًا" : "مواد مختارة من كتالوج مراس"} action={<Pressable onPress={() => router.push("/(tabs)/courses")}><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11 }}>عرض الكل</Text></Pressable>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontal}>{(dashboard.data?.recommended.length ? dashboard.data.recommended : featuredCourses).map((course) => <CourseCard key={course.slug} course={course} />)}</ScrollView>

      <SectionTitle title="الجامعات والكليات" subtitle={`${catalog.data?.institutions.length || 0} جهة تعليمية قابلة للتصفح`} action={<Pressable onPress={() => router.push("/(tabs)/universities")}><Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11 }}>كل الجهات</Text></Pressable>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontal}>{featuredInstitutions.map((institution) => <InstitutionCard key={institution.slug} institution={institution} />)}</ScrollView>

      <SectionTitle title="اختصارات ذكية" subtitle="الخدمات التي تحتاجها بدون زحمة" />
      <View style={styles.quickGrid}>{quickItems.map((item) => <Pressable key={item.title} onPress={() => router.push(item.route as never)} style={styles.quickPressable}><Card style={styles.quick}><View style={[styles.quickIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={item.icon} size={23} color={colors.primary} /></View><Text style={[styles.quickTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.quickCopy, { color: colors.textSoft }]}>{item.text}</Text></Card></Pressable>)}</View>
    </Screen>
  );
}

function SnapshotCard({ icon, value, label, colors }: { icon: React.ComponentProps<typeof Ionicons>["name"]; value: string; label: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <Card style={styles.snapshot}><Ionicons name={icon} size={19} color={colors.primary} /><Text style={[styles.snapshotValue, { color: colors.text }]}>{value}</Text><Text style={[styles.snapshotLabel, { color: colors.textSoft }]}>{label}</Text></Card>;
}

const styles = StyleSheet.create({
  announcement: { minHeight: 52, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row-reverse", alignItems: "center", gap: 9, marginBottom: 12 },
  announcementText: { flex: 1, fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl" },
  continue: { borderRadius: 28, padding: 22, minHeight: 210, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 16 },
  continueCopyWrap: { flex: 1, alignItems: "flex-end" },
  heroKicker: { color: "#BFD5FF", fontSize: 10, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  continueTitle: { color: "#FFFFFF", fontSize: 24, lineHeight: 34, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 8 },
  continueCopy: { color: "#DCE8FF", fontSize: 10, textAlign: "right", marginTop: 8 },
  progressTrack: { width: "100%", maxWidth: 230, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,.25)", marginTop: 17 },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: "#FFFFFF" },
  play: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 42, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 9 },
  heroCopy: { color: "#D9E5FF", fontSize: 12, lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginTop: 10 },
  heroActions: { gap: 9, marginTop: 20 },
  snapshotGrid: { flexDirection: "row-reverse", gap: 8, marginTop: 14 },
  snapshot: { flex: 1, minHeight: 106, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  snapshotValue: { fontSize: 20, fontWeight: "900", marginTop: 6 },
  snapshotLabel: { fontSize: 8, textAlign: "center", marginTop: 3 },
  horizontal: { paddingLeft: 18 },
  quickGrid: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  quickPressable: { width: "48%" },
  quick: { alignItems: "flex-end", minHeight: 148 },
  quickIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  quickTitle: { fontSize: 14, fontWeight: "900", marginTop: 11, textAlign: "right" },
  quickCopy: { fontSize: 10, marginTop: 4, textAlign: "right", writingDirection: "rtl", lineHeight: 17 },
});
