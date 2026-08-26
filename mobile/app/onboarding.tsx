import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BrandMark } from "@/src/components/Brand";
import { AppButton, Card, Screen } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

const steps = [
  { icon: "school-outline" as const, title: "مواد تخصصك أولًا", text: "سنرتب مواد جامعتك وتخصصك في الرئيسية، ويمكنك تصفح جميع الجامعات بحرية." },
  { icon: "play-circle-outline" as const, title: "جرّب قبل الاشتراك", text: "شاهد الدرس المجاني، ثم تابع المادة من أي جهاز مع حفظ تقدمك تلقائيًا." },
  { icon: "cloud-upload-outline" as const, title: "اطلب المادة غير المتوفرة", text: "أرسل اسم المادة وارفع السلايدات أو التوصيف؛ يصل الطلب إلى المشرف وتتابع حالته." },
  { icon: "sparkles-outline" as const, title: "مساعد مراس معك", text: "اضغط علامة M في أي صفحة للسؤال عن المواد والحساب والدفع والمشغل والدعم." },
];
export default function Onboarding() {
  const { colors } = useTheme(); const { refresh } = useAuth(); const [index, setIndex] = useState(0); const step = steps[index]!;
  const next = async () => { if (index < steps.length - 1) setIndex(index + 1); else { await api("/api/profile/onboarding", { method: "POST" }); await refresh(); router.replace("/(tabs)"); } };
  return <Screen scroll={false} style={styles.page}><BrandMark size={88} whiteTile /><View style={styles.dots}>{steps.map((_, item) => <View key={item} style={[styles.dot, { backgroundColor: item === index ? colors.primary : colors.border }, item === index && styles.dotActive]} />)}</View><Card style={styles.card}><View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={step.icon} size={46} color={colors.primary} /></View><Text style={[styles.title, { color: colors.text }]}>{step.title}</Text><Text style={[styles.copy, { color: colors.textSoft }]}>{step.text}</Text></Card><AppButton title={index === steps.length - 1 ? "ابدأ استخدام مراس" : "التالي"} icon={index === steps.length - 1 ? "rocket-outline" : "arrow-back"} onPress={next} /><AppButton title="تخطي الإرشادات" variant="ghost" onPress={async () => { await api("/api/profile/onboarding", { method: "POST" }); await refresh(); router.replace("/(tabs)"); }} /></Screen>;
}
const styles = StyleSheet.create({ page: { alignItems: "center", justifyContent: "center", paddingBottom: 40 }, dots: { flexDirection: "row", gap: 7, marginVertical: 24 }, dot: { width: 8, height: 8, borderRadius: 4 }, dotActive: { width: 26 }, card: { width: "100%", alignItems: "center", paddingVertical: 34, marginBottom: 24 }, icon: { width: 92, height: 92, borderRadius: 30, alignItems: "center", justifyContent: "center" }, title: { fontSize: 23, fontWeight: "900", textAlign: "center", marginTop: 22 }, copy: { fontSize: 13, lineHeight: 24, textAlign: "center", writingDirection: "rtl", marginTop: 10 },
});
