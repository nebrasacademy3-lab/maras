import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { PurchaseRequirements } from "@/src/components/PurchaseRequirements";
import { AppearanceSettings } from "@/src/components/AppearanceSettings";
import { AppButton, Card, Screen, SectionTitle } from "@/src/components/ui";
import { STORE_COMMERCE_ENABLED } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

type MenuItem = { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; text: string; route: string };
const journey: MenuItem[] = [
  { icon: "sparkles-outline", title: "أدوات مراس", text: "المحادثات والملخصات والترجمة والاختبارات", route: "/(tabs)/ai" },
  { icon: "receipt-outline", title: "الطلبات والفواتير", text: "حالة الاشتراكات والفواتير", route: "/orders" },
  { icon: "cloud-upload-outline", title: "طلبات المواد", text: "طلب جديد ورفع السلايدات", route: "/requests" },
  { icon: "gift-outline", title: "الإحالات والهدايا", text: "رابطك وتقدمك والكوبونات الخاصة بك", route: "/referrals" },
  { icon: "map-outline", title: "المسارات القادمة", text: "سجّل اهتمامك بما ستطلقه مراس لاحقًا", route: "/tracks" },
];
const account: MenuItem[] = [
  { icon: "person-outline", title: "بيانات الحساب", text: "الاسم والجوال والجامعة والتخصص والمستوى", route: "/profile" },
  { icon: "notifications-outline", title: "الإشعارات", text: "تحديثات المواد والطلبات", route: "/notifications" },
  { icon: "shield-checkmark-outline", title: "الأمان والخصوصية", text: "كلمة المرور وحذف الحساب", route: "/security" },
  { icon: "document-text-outline", title: "الخصوصية والشروط", text: "اقرأ وثائق مراس المنشورة", route: "/legal" },
  { icon: "chatbubbles-outline", title: "تواصل معنا", text: "قنوات التواصل وساعات العمل", route: "/contact" },
];

export default function Account() {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const { direction, rowDirection, isRTL, t } = useLanguage();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const chevron = isRTL ? "chevron-back" : "chevron-forward";
  const navigate = (route: string) => router.push(route as never);
  const shortcut = (icon: React.ComponentProps<typeof Ionicons>["name"], title: string, route: string, tint = colors.primary) => <Pressable key={title} accessibilityRole="button" accessibilityLabel={t(title)} onPress={() => navigate(route)} style={({ pressed }) => [styles.shortcut, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .78 : 1, transform: [{ scale: pressed ? .97 : 1 }] }]}><View style={[styles.shortcutIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={22} color={tint} /></View><Text numberOfLines={2} style={[styles.shortcutText, { color: colors.text }]}>{title}</Text></Pressable>;
  const menu = (item: MenuItem, index: number, count: number) => <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={t(item.title)} accessibilityHint={t(item.text)} onPress={() => navigate(item.route)} style={({ pressed }) => [styles.row, { flexDirection: rowDirection, borderBottomColor: colors.border, borderBottomWidth: index === count - 1 ? 0 : 1, backgroundColor: pressed ? colors.surfaceAlt : "transparent" }]}><View style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={item.icon} size={21} color={colors.primary} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{item.title}</Text><Text numberOfLines={2} style={[styles.rowText, { color: colors.textSoft }]}>{item.text}</Text></View><Ionicons name={chevron} size={17} color={colors.textSoft} /></Pressable>;
  const group = (title: string, description: string, items: MenuItem[]) => <View key={title} style={[styles.menuGroup, { width: wide ? "48%" : "100%" }]}><SectionTitle title={title} subtitle={description} /><Card style={styles.groupCard}>{items.map((item, index) => menu(item, index, items.length))}</Card></View>;

  if (!user) return <Screen><AppHeader title="حسابي" subtitle="الدخول إلى مراس" /><LinearGradient colors={[colors.hero, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.guestHero}><View style={styles.guestGlow} /><View style={styles.guestIcon}><Ionicons name="person-outline" size={27} color="#FFFFFF" /></View><Text style={styles.guestEyebrow}>مساحتك في مراس</Text><Text accessibilityRole="header" style={styles.guestTitle}>رحلتك الجامعية تبدأ من هنا</Text><Text style={styles.guestCopy}>سجّل دخولك لتجد موادك وتقدمك وأدواتك الذكية في مساحة واحدة.</Text><View style={styles.guestActions}><AppButton title="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/(auth)/login")} /><AppButton title="إنشاء حساب" variant="soft" icon="person-add-outline" onPress={() => router.push("/(auth)/register")} /></View></LinearGradient></Screen>;

  const role = user.role === "admin" ? "المدير الأعلى" : user.role === "supervisor" ? "مشرف محتوى" : user.role === "instructor" ? "شارح مراس" : "طالب مراس";
  const workspaces: MenuItem[] = user.role === "admin" ? [
    { icon: "grid-outline", title: "لوحة الإدارة", text: "إدارة المنصة والصلاحيات والطلبات", route: "/admin" },
    { icon: "construct-outline", title: "مساحة المشرف", text: "الطلبات والمحتوى المسند", route: "/supervisor" },
  ] : user.role === "supervisor" ? [
    { icon: "grid-outline", title: "لوحة الإدارة", text: "الأقسام المصرح بها لحسابك", route: "/admin" },
    { icon: "construct-outline", title: "مساحة المشرف", text: "الطلبات والمحتوى المسند", route: "/supervisor" },
  ] : user.role === "instructor" ? [
    { icon: "school-outline", title: "مساحة الشارح", text: "المواد والتكليفات والعقود", route: "/instructor" },
  ] : [];
  const specialty = user.specialty || "أكمل تخصصك";
  const level = user.academicLevel || "أكمل مستواك";

  return <Screen><AppHeader title="حسابي" subtitle={role} />
    <LinearGradient colors={[colors.hero, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.profileHero, { direction }]}>
      <View style={styles.profileGlow} />
      <View style={[styles.profileTop, { flexDirection: rowDirection }]}><View style={styles.avatar}><Text style={styles.avatarText}>{user.fullName?.trim().charAt(0) || "م"}</Text></View><View style={styles.profileCopy}><Text style={styles.profileEyebrow}>حساب مراس</Text><Text numberOfLines={2} accessibilityRole="header" style={styles.name}>{user.fullName}</Text><Text numberOfLines={1} style={styles.email}>{user.email}</Text></View></View>
      <View style={[styles.profileMeta, { flexDirection: rowDirection }]}><View style={[styles.rolePill, { flexDirection: rowDirection }]}><Ionicons name={user.role === "student" ? "school-outline" : "shield-checkmark-outline"} size={15} color="#FFFFFF" /><Text style={styles.roleText}>{role}</Text></View><Text numberOfLines={2} style={styles.study}>{specialty} · {level}</Text></View>
    </LinearGradient>
    {workspaces.length ? <View style={styles.workspaceSection}><SectionTitle title="مساحة العمل" subtitle="اذهب مباشرة إلى المهام المتاحة لصلاحياتك" /><Card style={styles.groupCard}>{workspaces.map((item, index) => menu(item, index, workspaces.length))}</Card></View> : null}
    {user.role !== "instructor" && STORE_COMMERCE_ENABLED ? <PurchaseRequirements returnTo="/(tabs)/account" /> : null}
    <SectionTitle title="اختصاراتك" subtitle="الأشياء التي تعود إليها كثيرًا" />
    <View style={[styles.shortcuts, { flexDirection: rowDirection }]}>{shortcut("play-circle-outline", "موادي", "/(tabs)/learning")}{shortcut("heart-outline", "المفضلة", "/favorites", colors.danger)}{shortcut("headset-outline", "الدعم الفني", "/support")}{STORE_COMMERCE_ENABLED ? shortcut("bag-handle-outline", "السلة", "/cart") : null}</View>
    <View style={[styles.menuGrid, { flexDirection: rowDirection }]}>{group("رحلتي التعليمية", "موادك وأدواتك وطلباتك", journey)}{group("الحساب والخصوصية", "بياناتك وإشعاراتك وخياراتك", account)}</View>
    <AppearanceSettings />
    <Pressable accessibilityRole="button" accessibilityLabel={t("تسجيل الخروج")} onPress={() => { void logout().finally(() => router.replace("/(auth)/welcome")); }} style={({ pressed }) => [styles.logoutRow, { flexDirection: rowDirection, backgroundColor: colors.surface, borderColor: `${colors.danger}55`, opacity: pressed ? .76 : 1 }]}><View style={[styles.logoutIcon, { backgroundColor: `${colors.danger}14` }]}><Ionicons name="log-out-outline" size={21} color={colors.danger} /></View><View style={styles.rowCopy}><Text style={[styles.logoutTitle, { color: colors.danger }]}>تسجيل الخروج</Text><Text style={[styles.rowText, { color: colors.textSoft }]}>إنهاء الجلسة بأمان</Text></View><Ionicons name={chevron} size={17} color={colors.textSoft} /></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  guestHero: { borderRadius: 30, minHeight: 430, padding: 24, overflow: "hidden", justifyContent: "center", marginTop: 6 },
  guestGlow: { position: "absolute", width: 270, height: 270, borderRadius: 135, backgroundColor: "rgba(102,171,255,.18)", top: -120, right: -80 },
  guestIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "rgba(255,255,255,.17)", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  guestEyebrow: { color: "#C3D6FF", fontSize: 12, fontWeight: "800", marginBottom: 8 },
  guestTitle: { color: "#FFFFFF", fontSize: 30, lineHeight: 41, fontWeight: "900", maxWidth: 560 },
  guestCopy: { color: "#DCE7FF", fontSize: 15, lineHeight: 25, marginTop: 14, maxWidth: 560 },
  guestActions: { marginTop: 28, gap: 10, maxWidth: 480 },
  profileHero: { borderRadius: 30, padding: 22, minHeight: 206, overflow: "hidden", marginTop: 4, justifyContent: "space-between" },
  profileGlow: { position: "absolute", width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(122,180,255,.16)", top: -125, right: -80 },
  profileTop: { alignItems: "center", gap: 16 },
  avatar: { width: 70, height: 70, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,.48)", backgroundColor: "rgba(255,255,255,.18)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  profileCopy: { flex: 1, minWidth: 0 },
  profileEyebrow: { color: "#B9D0FF", fontSize: 11, fontWeight: "800", marginBottom: 4 },
  name: { color: "#FFFFFF", fontSize: 23, lineHeight: 31, fontWeight: "900" },
  email: { color: "#D8E5FF", fontSize: 12, lineHeight: 19, writingDirection: "ltr", marginTop: 3 },
  profileMeta: { alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 22 },
  rolePill: { alignItems: "center", gap: 6, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "rgba(255,255,255,.17)" },
  roleText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  study: { color: "#E4ECFF", fontSize: 11, lineHeight: 19, flexShrink: 1 },
  workspaceSection: { marginTop: 6 },
  shortcuts: { flexWrap: "wrap", gap: 10 },
  shortcut: { flexGrow: 1, flexBasis: 100, minHeight: 108, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", padding: 12, gap: 8 },
  shortcutIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  shortcutText: { fontSize: 13, lineHeight: 19, fontWeight: "800", textAlign: "center" },
  menuGrid: { flexWrap: "wrap", gap: 16, justifyContent: "space-between" },
  menuGroup: { minWidth: 0 },
  groupCard: { paddingHorizontal: 0, paddingVertical: 2, overflow: "hidden" },
  row: { minHeight: 76, alignItems: "center", gap: 13, paddingHorizontal: 16, paddingVertical: 10 },
  rowIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, lineHeight: 23, fontWeight: "800" },
  rowText: { fontSize: 12, lineHeight: 19, marginTop: 2 },
  logoutRow: { minHeight: 72, borderWidth: 1, borderRadius: 19, paddingHorizontal: 14, alignItems: "center", gap: 12, marginTop: 12, marginBottom: 22 },
  logoutIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  logoutTitle: { fontSize: 14, lineHeight: 21, fontWeight: "900" },
});
