import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, type Href } from "expo-router";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/src/components/AppHeader";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, Card, EmptyState, Field, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api, ApiError } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { ACADEMIC_LEVELS as ACADEMIC_LEVELS } from "@/src/constants/academic-levels";
import type { Catalog } from "@/src/types";
import { SocialSignIn } from "@/src/components/SocialSignIn";
import { authDestination } from "@/src/lib/account-access";

type ProgramsResponse = { programs: { name: string; degree: string; area: string }[] };
export default function Register() {
  const params = useLocalSearchParams<{ ref?: string }>();
  const { register } = useAuth();
  const { colors } = useTheme();
  const { direction, rowDirection, t } = useLanguage();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const referralCode = String(Array.isArray(params.ref) ? params.ref[0] : params.ref || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", universitySlug: "", specialty: "", academicLevel: "", referralCode });
  const programQuery = useQuery({ queryKey: ["programs", form.universitySlug], queryFn: () => api<ProgramsResponse>(`/api/catalog/programs?institution=${encodeURIComponent(form.universitySlug)}`), enabled: Boolean(form.universitySlug) });
  const programs = programQuery.data?.programs || [];
  const programLoading = programQuery.isFetching;
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (catalog.isLoading) return <Screen><LoadingState label="نجهّز الجامعات والتخصصات..." /></Screen>;
  if (catalog.isError && !catalog.data) return <Screen><AppHeader title="إنشاء حساب" auth /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل الجامعات" text="تحقق من اتصالك وأعد المحاولة. بياناتك لم تُرسل." action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void catalog.refetch()} />} /></Screen>;
  const institutions = catalog.data?.institutions || [];
  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await register({ ...form, termsAccepted: true });
      router.replace(authDestination(result.user, result.next) as Href);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "تعذر إنشاء الحساب");
    } finally {
      setLoading(false);
    }
  };
  const valid = form.fullName.trim().length >= 5 && form.email.includes("@") && form.phone.replace(/\D/g, "").length >= 9 && form.password.length >= 10 && form.universitySlug && form.specialty && form.academicLevel && accepted;
  return <Screen keyboard showFooter={false}><AppHeader title="إنشاء حساب" subtitle="ملف جامعي مكتمل من البداية" auth />
    <View style={[styles.intro, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><View style={[styles.introIcon, { backgroundColor: `${colors.primary}18` }]}><Ionicons name="school-outline" size={25} color={colors.primary} /></View><View style={styles.introCopy}><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>ابدأ رحلتك مع مراس</Text><Text style={[styles.copy, { color: colors.textSoft }]}>ستظهر لك مواد تخصصك أولًا، ويمكنك تصفح مواد بقية الجامعات أيضًا.</Text></View></View>
    {form.referralCode ? <View style={[styles.referral, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><View style={[styles.referralIcon, { backgroundColor: `${colors.primary}16` }]}><Ionicons name="gift-outline" size={20} color={colors.primary} /></View><View style={styles.referralCopy}><Text style={[styles.referralTitle, { color: colors.text }]}>دخلت من دعوة صديق</Text><Text style={[styles.referralCode, { color: colors.primary }]}>رمز الإحالة: {form.referralCode}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={t("إزالة رمز الإحالة")} onPress={() => setForm({ ...form, referralCode: "" })} style={styles.removeReferral}><Ionicons name="close-circle" size={21} color={colors.textSoft} /></Pressable></View> : null}
    <View style={[styles.sections, { flexDirection: wide ? rowDirection : "column" }]}>
      <View style={[styles.section, wide && styles.sectionWide]}><SectionTitle title="بيانات الحساب" subtitle="كيف نتواصل معك ونحمي دخولك" /><Card style={styles.formCard}>
        <Field label="الاسم الكامل" icon="person-outline" autoComplete="name" value={form.fullName} onChangeText={(fullName) => setForm({ ...form, fullName })} placeholder="الاسم الرباعي" />
        <Field label="البريد الإلكتروني" icon="mail-outline" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={form.email} onChangeText={(email) => setForm({ ...form, email })} placeholder="name@example.com" />
        <Field label="رقم الجوال السعودي" icon="call-outline" autoComplete="tel" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="05xxxxxxxx" />
        <Field label="كلمة المرور" icon="lock-closed-outline" inputDirection="ltr" autoComplete="new-password" secureTextEntry={!showPassword} value={form.password} onChangeText={(password) => setForm({ ...form, password })} placeholder="10 أحرف، رقم ورمز خاص" trailing={<Pressable accessibilityRole="button" accessibilityLabel={t(showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور")} onPress={() => setShowPassword((value) => !value)} style={styles.eyeInline}><Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color={colors.textSoft} /></Pressable>} />
        {!referralCode ? <Field label="رمز إحالة — اختياري" icon="gift-outline" inputDirection="ltr" autoCapitalize="characters" value={form.referralCode} onChangeText={(value) => setForm({ ...form, referralCode: value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32) })} placeholder="MERAS-XXXX" /> : null}
      </Card></View>
      <View style={[styles.section, wide && styles.sectionWide]}><SectionTitle title="مسارك الدراسي" subtitle="لنقترح المواد الأقرب لتخصصك" /><Card style={styles.formCard}>
        <SearchPicker label="الجامعة أو الكلية" value={form.universitySlug} placeholder="اختر جهتك التعليمية" items={institutions.map((item) => ({ key: item.slug, label: item.name, detail: `${item.region} · ${item.type}` }))} onSelect={(item) => setForm({ ...form, universitySlug: item.key, specialty: "" })} />
        <SearchPicker label="التخصص" value={form.specialty} placeholder={programLoading ? "جارٍ تحميل التخصصات..." : "اختر تخصصك"} disabled={!form.universitySlug || programLoading} items={programs.map((item) => ({ key: item.name, label: item.name, detail: `${item.degree} · ${item.area}` }))} onSelect={(item) => setForm({ ...form, specialty: item.key })} />
        {programQuery.isError ? <View style={[styles.programError, { backgroundColor: colors.surfaceAlt }]}><Text style={{ color: colors.danger, flex: 1 }}>تعذر تحميل التخصصات. أعد المحاولة.</Text><Pressable accessibilityRole="button" accessibilityLabel={t("إعادة المحاولة")} onPress={() => void programQuery.refetch()} style={styles.retry}><Ionicons name="refresh-outline" size={20} color={colors.primary} /></Pressable></View> : null}
        <SearchPicker label="المستوى الدراسي" value={form.academicLevel} placeholder="اختر مستواك الحالي" items={ACADEMIC_LEVELS.map((level) => ({ key: level, label: level, detail: level === "خريج" ? "أنهيت الدراسة" : "مستوى دراسي" }))} onSelect={(item) => setForm({ ...form, academicLevel: item.key })} />
      </Card></View>
    </View>
    <SectionTitle title="الموافقة والبدء" subtitle="راجع الشروط قبل إنشاء الحساب" />
    <Card style={styles.termsCard}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} style={[styles.terms, { direction, flexDirection: rowDirection, backgroundColor: colors.surfaceAlt }]}><Ionicons name={accepted ? "checkbox" : "square-outline"} size={25} color={accepted ? colors.primary : colors.textSoft} /><Text style={[styles.termsText, { color: colors.text }]}>أوافق على شروط الاستخدام وسياسة الخصوصية ومعالجة بيانات الحساب.</Text></Pressable><View style={styles.legalLinks}><AppButton title="قراءة الشروط" full={false} variant="ghost" onPress={() => router.push("/legal?document=terms" as Href)} /><AppButton title="سياسة الخصوصية" full={false} variant="ghost" onPress={() => router.push("/legal?document=privacy" as Href)} /></View>{error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AppButton title="إنشاء الحساب" icon="sparkles-outline" loading={loading} disabled={!valid} onPress={submit} /><SocialSignIn referralCode={form.referralCode} disabled={loading || !accepted} /></Card>
    <View style={[styles.login, { direction, flexDirection: rowDirection }]}><Text style={{ color: colors.textSoft }}>لديك حساب؟</Text><Pressable accessibilityRole="button" onPress={() => router.replace("/(auth)/login")} style={styles.loginButton}><Text style={{ color: colors.primary, fontWeight: "900" }}>تسجيل الدخول</Text></Pressable></View>
  </Screen>;
}

const styles = StyleSheet.create({
  intro: { borderWidth: 1, borderRadius: 24, padding: 18, flexDirection: "row", alignItems: "center", gap: 13, marginTop: 4 },
  introIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  introCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, lineHeight: 31, fontWeight: "900" },
  copy: { fontSize: 13, lineHeight: 22, marginTop: 4 },
  sections: { flexWrap: "wrap", alignItems: "flex-start", gap: 18 },
  section: { width: "100%" },
  sectionWide: { width: "48%" },
  formCard: { gap: 3, paddingBottom: 8 },
  referral: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 17, padding: 10, marginTop: 15 },
  referralIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  referralCopy: { flex: 1, minWidth: 0 },
  referralTitle: { fontSize: 13, fontWeight: "900" },
  referralCode: { fontSize: 12, fontWeight: "800", marginTop: 3 },
  removeReferral: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  eyeInline: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  programError: { flexDirection: "row", alignItems: "center", borderRadius: 13, paddingHorizontal: 10, minHeight: 52 },
  retry: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  termsCard: { gap: 12 },
  terms: { minHeight: 70, borderRadius: 15, alignItems: "center", gap: 12, padding: 12 },
  termsText: { flex: 1, fontSize: 13, lineHeight: 22 },
  legalLinks: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  error: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  login: { alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 6, marginTop: 19, marginBottom: 16 },
  loginButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
});
