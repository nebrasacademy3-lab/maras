import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, type Href } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { BrandMark } from "@/src/components/Brand";
import { AppButton, Screen, useReduceMotion } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { authDestination } from "@/src/lib/account-access";
import { safeInternalPath } from "@/src/lib/notification-routing";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

const steps = [
  { icon: "sparkles-outline" as const, number: "01", kicker: "بداية هادئة", title: "مراس ترتّب رحلتك الجامعية", text: "نقرّب جامعتك وتخصصك وموادك في واجهة واضحة، حتى تصل لما تحتاجه من دون قوائم متعبة.", colors: ["#061B49", "#1458D7", "#6E3EEA"] as const, points: ["حساب واحد على كل الأجهزة", "واجهة عربية مرتبة بالكامل"] },
  { icon: "school-outline" as const, number: "02", kicker: "اكتشاف أذكى", title: "جامعتك وتخصصك أولًا", text: "نبدأ بالمحتوى الأقرب لمسارك، ويمكنك فتح فلاتر البحث واختيار أي جامعة أو تخصص آخر متى رغبت.", colors: ["#042F44", "#087F8C", "#0FB9A8"] as const, points: ["بحث داخل كل اختيار", "فلاتر قليلة وواضحة"] },
  { icon: "play-circle-outline" as const, number: "03", kicker: "تعلّم بثقة", title: "شاهد المتاح ثم أكمل", text: "افتح الدرس التجريبي عندما يتوفر، وبعد الاشتراك يحفظ المشغل تقدمك لتكمل من آخر ثانية.", colors: ["#1E1B4B", "#4338CA", "#7C3AED"] as const, points: ["تقدم محفوظ تلقائيًا", "مشاهدة خاصة ومحمية"] },
  { icon: "notifications-outline" as const, number: "04", kicker: "كل الأدوات معك", title: "اطلب، ارفع، اسأل وتابع", text: "ارفع توصيف المادة أو ملفات الدعم، تابع حالة الطلب، واستقبل تنبيهات الإدارة واسأل مساعد مراس من المكان نفسه.", colors: ["#3A1B1B", "#B45309", "#F97316"] as const, points: ["إشعارات مرتبطة بحسابك", "دعم ومساعد مراس دائمًا"] },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();
  const { refresh } = useAuth();
  const params = useLocalSearchParams<{ return_to?: string }>();
  const returnTo = safeInternalPath(params.return_to);
  const reduceMotion = useReduceMotion();
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));
  const [translate] = useState(() => new Animated.Value(0));
  const step = steps[index]!;

  useEffect(() => {
    if (reduceMotion) { opacity.setValue(1); translate.setValue(0); return; }
    opacity.setValue(0); translate.setValue(18);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 270, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    return () => { opacity.stopAnimation(); translate.stopAnimation(); };
  }, [index, opacity, translate, reduceMotion]);

  async function complete() {
    setBusy(true);
    try { await api("/api/profile/onboarding", { method: "POST" }); const updated = await refresh(); if (updated) router.replace(authDestination(updated, undefined, returnTo) as Href); else setError("تعذر تحديث الحساب. حاول مرة أخرى."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر إكمال التهيئة."); }
    finally { setBusy(false); }
  }
  function next() { if (index < steps.length - 1) setIndex((value) => value + 1); else void complete(); }

  return <Screen showFooter={false} style={styles.page}>
    <View style={styles.topbar}><BrandMark size={70} whiteTile /><Pressable accessibilityRole="button" onPress={() => void complete()} disabled={busy} style={[styles.skip, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.skipText, { color: colors.textSoft }]}>تخطي</Text></Pressable></View>
    <View style={styles.progressHeader}><View style={styles.progressCopy}><Text style={[styles.progressKicker, { color: colors.primary }]}>تهيئة حسابك</Text><Text style={[styles.progressTitle, { color: colors.text }]}>خطوات بسيطة قبل أن تبدأ</Text></View><Text style={[styles.counter, { color: colors.textSoft }]}>{index + 1} / {steps.length}</Text></View>
    <View style={styles.progressRow}>{steps.map((_, item) => <View key={item} style={[styles.progressTrack, { backgroundColor: colors.border }, item <= index && { backgroundColor: colors.primary }, item === index && styles.progressActive]} />)}</View>
    <Animated.View style={[styles.stage, { opacity, transform: [{ translateY: translate }] }]}>
      <LinearGradient colors={step.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroOrbOne} /><View style={styles.heroOrbTwo} />
        <Text style={styles.heroNumber}>{step.number}</Text>
        <View style={styles.heroIcon}><Ionicons name={step.icon} size={48} color="#FFF" /></View>
        <Text style={styles.heroBrand}>مراس العلم</Text>
      </LinearGradient>
      <View style={[styles.contentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.kicker, { color: colors.primary }]}>{step.kicker}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>
        <Text style={[styles.copy, { color: colors.textSoft }]}>{step.text}</Text>
        <View style={[styles.points, { borderTopColor: colors.border }]}>{step.points.map((point) => <View key={point} style={styles.point}><View style={[styles.check, { backgroundColor: `${colors.success}18` }]}><Ionicons name="checkmark" size={14} color={colors.success} /></View><Text style={[styles.pointText, { color: colors.text }]}>{point}</Text></View>)}</View>
      </View>
    </Animated.View>
    <View style={styles.footer}>
      {error ? <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text> : null}
      <AppButton title={index === steps.length - 1 ? "ابدأ استخدام مراس" : "التالي"} icon={index === steps.length - 1 ? "rocket-outline" : (isRTL ? "arrow-back" : "arrow-forward")} loading={busy} onPress={next} />
      {index > 0 ? <Pressable onPress={() => setIndex((value) => Math.max(0, value - 1))} disabled={busy} style={styles.back}><Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={16} color={colors.textSoft} /><Text style={[styles.backText, { color: colors.textSoft }]}>الخطوة السابقة</Text></Pressable> : <Text style={[styles.secure, { color: colors.textSoft }]}><Ionicons name="shield-checkmark-outline" size={14} color={colors.success} /> بياناتك محفوظة بأمان</Text>}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingBottom: 18 },
  topbar: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  skip: { minHeight: 38, borderRadius: 12, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" },
  skipText: { fontSize: 10, fontWeight: "900" },
  progressHeader: { width: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  progressCopy: { flex: 1, alignItems: "flex-start" },
  progressKicker: { fontSize: 9, fontWeight: "900" },
  progressTitle: { fontSize: 19, fontWeight: "900", marginTop: 3 },
  counter: { fontSize: 10, fontWeight: "800" },
  progressRow: { width: "100%", flexDirection: "row", gap: 5, marginTop: 14, marginBottom: 16 },
  progressTrack: { flex: 1, height: 4, borderRadius: 4, opacity: .75 },
  progressActive: { flex: 1.7, opacity: 1 },
  stage: { width: "100%", gap: 12 },
  hero: { minHeight: 218, borderRadius: 30, overflow: "hidden", alignItems: "center", justifyContent: "center", position: "relative" },
  heroOrbOne: { width: 260, height: 260, borderRadius: 130, position: "absolute", top: -135, end: -78, backgroundColor: "rgba(255,255,255,.10)" },
  heroOrbTwo: { width: 150, height: 150, borderRadius: 75, position: "absolute", bottom: -78, start: -32, borderWidth: 1, borderColor: "rgba(255,255,255,.14)" },
  heroIcon: { width: 96, height: 96, borderRadius: 31, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.14)", borderWidth: 1, borderColor: "rgba(255,255,255,.16)" },
  heroNumber: { position: "absolute", top: 15, start: 18, color: "rgba(255,255,255,.32)", fontSize: 42, fontWeight: "900" },
  heroBrand: { color: "rgba(255,255,255,.78)", fontSize: 9, fontWeight: "900", marginTop: 11 },
  contentCard: { borderWidth: 1, borderRadius: 24, padding: 18 },
  kicker: { fontSize: 9, fontWeight: "900", textAlign: "right" },
  title: { fontSize: 22, lineHeight: 32, fontWeight: "900", textAlign: "right", marginTop: 6 },
  copy: { fontSize: 11, lineHeight: 21, textAlign: "right", marginTop: 7 },
  points: { gap: 8, marginTop: 14, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth },
  point: { flexDirection: "row", alignItems: "center", gap: 8 },
  check: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  pointText: { flex: 1, fontSize: 10, fontWeight: "800", textAlign: "right" },
  footer: { width: "100%", marginTop: 16, gap: 10 },
  back: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  backText: { fontSize: 9, fontWeight: "800" },
  secure: { textAlign: "center", fontSize: 9, fontWeight: "700" },
});
