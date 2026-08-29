import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { BrandLogo, BrandMark } from "@/src/components/Brand";
import { AppButton, Card, HeroGradient, Screen } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

const steps = [
  { icon: "sparkles-outline" as const, kicker: "أهلًا بك في مراس", title: "تجربة مرتبة من أول دخول", text: "نبني لك واجهة واضحة وسريعة، ثم نقرّب المواد والخدمات التي تحتاجها في مسارك الجامعي.", points: ["واجهة عربية من اليمين لليسار", "دخول موحد على الويب والتطبيق"] },
  { icon: "school-outline" as const, kicker: "اكتشاف أسرع", title: "مواد جامعتك وتخصصك أولًا", text: "ستظهر لك المواد الأقرب إليك تلقائيًا، ويمكنك فتح فلترة واضحة ومنظمة متى رغبت.", points: ["بحث أبسط", "فلترة منظمة بدل الزحمة"] },
  { icon: "play-circle-outline" as const, kicker: "تعلّم بلا انقطاع", title: "تابع من آخر ثانية", text: "المشغل يحفظ تقدمك لتكمل من أي جهاز، مع مزامنة مباشرة بين التطبيق والويب.", points: ["حفظ التقدم تلقائيًا", "جلسة مشاهدة محمية"] },
  { icon: "cloud-upload-outline" as const, kicker: "مادتك غير موجودة؟", title: "اطلبها من داخل حسابك", text: "ارفع السلايدات أو توصيف المقرر، وسيتولى المشرف متابعة طلبك وإشعارك عند التحديث.", points: ["رفع مرفقات بسهولة", "متابعة الحالة من الحساب"] },
  { icon: "shield-checkmark-outline" as const, kicker: "جاهز للانطلاق", title: "كل أدواتك في مكان واحد", text: "استكشف، اشترك، احفظ، تواصل، واستفد من الإشعارات والمساعد ولوحة الإدارة المترابطة.", points: ["دعم وإشعارات", "إدارة مترابطة ومحترفة"] },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const { refresh } = useAuth();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const step = steps[index]!;
  const [opacity] = useState(() => new Animated.Value(1));
  const [translate] = useState(() => new Animated.Value(0));

  useEffect(() => {
    opacity.setValue(0);
    translate.setValue(14);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [index, opacity, translate]);

  const complete = async () => {
    setBusy(true);
    try {
      await api("/api/profile/onboarding", { method: "POST" });
      await refresh();
      router.replace("/(tabs)");
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (index < steps.length - 1) setIndex(index + 1);
    else void complete();
  };

  return (
    <Screen scroll={false} footer={false} style={styles.page}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={() => void complete()} disabled={busy}>
          <Text style={[styles.skip, { color: colors.textSoft }]}>تخطي</Text>
        </Pressable>
        <View style={styles.brandHead}>
          <BrandLogo width={118} />
          <BrandMark size={58} whiteTile />
        </View>
      </View>

      <View style={styles.intro}>
        <Text style={[styles.overline, { color: colors.primary }]}>مرحبًا بك في مراس العلم</Text>
        <Text style={[styles.heading, { color: colors.text }]}>انطلاقة احترافية{`\n`}مناسبة لك</Text>
        <Text style={[styles.counter, { color: colors.textSoft }]}>{index + 1} من {steps.length}</Text>
      </View>

      <View style={styles.progressRow}>
        {steps.map((_, item) => <View key={item} style={[styles.progressTrack, { backgroundColor: colors.border }, item <= index && { backgroundColor: colors.primary }, item === index && styles.progressActive]} />)}
      </View>

      <Animated.View style={[styles.content, { opacity, transform: [{ translateY: translate }] }]}>
        <HeroGradient>
          <View style={styles.heroInner}>
            <View style={[styles.heroIcon, { backgroundColor: "rgba(255,255,255,.16)" }]}>
              <Ionicons name={step.icon} size={44} color="#FFFFFF" />
            </View>
            <View style={styles.heroCopyBox}>
              <Text style={styles.heroKicker}>{step.kicker}</Text>
              <Text style={styles.heroTitle}>{step.title}</Text>
              <Text style={styles.heroText}>{step.text}</Text>
            </View>
            <Text style={styles.heroNumber}>{String(index + 1).padStart(2, "0")}</Text>
          </View>
        </HeroGradient>

        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>ما الذي ستحصل عليه؟</Text>
          <View style={styles.points}>
            {step.points.map((point) => (
              <View key={point} style={styles.point}>
                <Ionicons name="checkmark-circle" size={17} color={colors.success} />
                <Text style={[styles.pointText, { color: colors.text }]}>{point}</Text>
              </View>
            ))}
          </View>
        </Card>
      </Animated.View>

      <View style={styles.footer}>
        <AppButton title={index === steps.length - 1 ? "ابدأ استخدام مراس" : "التالي"} icon={index === steps.length - 1 ? "rocket-outline" : "arrow-back"} loading={busy} onPress={next} />
        <Text style={[styles.secure, { color: colors.textSoft }]}><Ionicons name="shield-checkmark-outline" size={14} color={colors.success} /> بياناتك محفوظة وتستطيع تعديلها من حسابك في أي وقت</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingBottom: 22 },
  topbar: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  brandHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  skip: { fontSize: 12, fontWeight: "800", padding: 10 },
  intro: { width: "100%", alignItems: "flex-end" },
  overline: { width: "100%", fontSize: 11, fontWeight: "800", textAlign: "right" },
  heading: { width: "100%", fontSize: 28, fontWeight: "900", textAlign: "right", marginTop: 4, lineHeight: 38 },
  counter: { width: "100%", fontSize: 11, textAlign: "right", marginTop: 3 },
  progressRow: { width: "100%", flexDirection: "row-reverse", gap: 5, marginTop: 18, marginBottom: 18 },
  progressTrack: { flex: 1, height: 4, borderRadius: 4, opacity: 0.75 },
  progressActive: { flex: 2, opacity: 1 },
  content: { width: "100%", gap: 14 },
  heroInner: { minHeight: 220, justifyContent: "space-between" },
  heroIcon: { width: 92, height: 92, borderRadius: 28, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  heroCopyBox: { marginTop: 8 },
  heroKicker: { color: "#BFD5FF", fontSize: 11, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  heroTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", textAlign: "right", writingDirection: "rtl", marginTop: 8, lineHeight: 36 },
  heroText: { color: "#D9E5FF", fontSize: 13, lineHeight: 23, textAlign: "right", writingDirection: "rtl", marginTop: 8 },
  heroNumber: { color: "rgba(255,255,255,.28)", fontSize: 42, fontWeight: "900", alignSelf: "flex-start" },
  card: { width: "100%", padding: 20 },
  cardTitle: { fontSize: 18, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  points: { gap: 11, marginTop: 14 },
  point: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  pointText: { fontSize: 11, fontWeight: "700", textAlign: "right", writingDirection: "rtl", flex: 1 },
  footer: { width: "100%", marginTop: 18, gap: 12 },
  secure: { textAlign: "center", fontSize: 10, fontWeight: "700", lineHeight: 18 },
});
