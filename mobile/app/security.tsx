import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, Field, Screen } from "@/src/components/ui";
import { api, ApiError, jsonBody } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

export default function Security() {
  const { colors } = useTheme();
  const { logout } = useAuth();
  const [modal, setModal] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setLoading(true); setError("");
    try { await api("/api/mobile/account", { method: "DELETE", body: jsonBody({ password, confirmation }) }); await logout(); setModal(false); router.replace("/(auth)/welcome"); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "تعذر حذف الحساب"); }
    finally { setLoading(false); }
  };

  return <Screen>
    <AppHeader title="الأمان والخصوصية" subtitle="إعدادات حساسة لحسابك" back />
    <Card style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}> 
      <View style={[styles.heroIcon, { backgroundColor: `${colors.success}14` }]}><Ionicons name="shield-checkmark-outline" size={27} color={colors.success} /></View>
      <View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.text }]}>حسابك تحت سيطرتك</Text><Text style={[styles.heroText, { color: colors.textSoft }]}>بيانات الجلسة محفوظة في التخزين الآمن، والاتصال بالخادم مصمم للعمل عبر HTTPS في الإنتاج.</Text></View>
    </Card>

    <Card style={styles.card}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="phone-portrait-outline" size={23} color={colors.primary} /></View>
      <Text style={[styles.title, { color: colors.text }]}>الجلسة الحالية</Text>
      <Text style={[styles.copy, { color: colors.textSoft }]}>يمكنك إنهاء تسجيل الدخول على هذا الجهاز في أي وقت. بعد الخروج ستحتاج لتسجيل الدخول مجددًا للوصول إلى بياناتك الخاصة.</Text>
      <AppButton title="تسجيل الخروج من هذا الجهاز" icon="log-out-outline" variant="soft" onPress={async () => { await logout(); router.replace("/(auth)/welcome"); }} />
    </Card>

    <Card style={[styles.card, styles.dangerCard, { borderColor: `${colors.danger}55` }]}>
      <View style={[styles.sectionIcon, { backgroundColor: `${colors.danger}12` }]}><Ionicons name="trash-outline" size={23} color={colors.danger} /></View>
      <Text style={[styles.title, { color: colors.danger }]}>منطقة حساسة</Text>
      <Text style={[styles.copy, { color: colors.textSoft }]}>حذف الحساب إجراء نهائي. تُزال بيانات الحساب والجلسات والأجهزة والتقدم والدعم والطلبات غير المالية، بينما تُعالج السجلات المالية التي يلزم الاحتفاظ بها وفق متطلبات السجل.</Text>
      <AppButton title="طلب حذف حسابي" icon="trash-outline" variant="danger" onPress={() => setModal(true)} />
    </Card>

    <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.dialog, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.dialogHead}><Pressable accessibilityLabel="إغلاق" onPress={() => setModal(false)} style={[styles.close, { backgroundColor: colors.surface }]}><Ionicons name="close" size={22} color={colors.text} /></Pressable><View style={[styles.warning, { backgroundColor: `${colors.danger}12` }]}><Ionicons name="warning-outline" size={24} color={colors.danger} /></View></View>
          <Text style={[styles.dialogTitle, { color: colors.danger }]}>تأكيد حذف الحساب نهائيًا</Text>
          <Text style={[styles.copy, { color: colors.textSoft }]}>لمنع الحذف بالخطأ، اكتب «حذف حسابي» ثم أدخل كلمة المرور الحالية.</Text>
          <Field label="عبارة التأكيد" value={confirmation} onChangeText={setConfirmation} placeholder="حذف حسابي" />
          <Field label="كلمة المرور" value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          <AppButton title="حذف الحساب نهائيًا" variant="danger" loading={loading} disabled={confirmation !== "حذف حسابي" || password.length < 8} onPress={remove} />
          <AppButton title="إلغاء" variant="ghost" disabled={loading} onPress={() => setModal(false)} />
        </View>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 13 },
  heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, alignItems: "flex-end" },
  heroTitle: { fontSize: 15, fontWeight: "900", textAlign: "right" },
  heroText: { fontSize: 9, lineHeight: 17, textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  card: { alignItems: "flex-end", gap: 9, marginBottom: 13 },
  dangerCard: { marginTop: 2 },
  sectionIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "900", textAlign: "right" },
  copy: { fontSize: 10, lineHeight: 19, textAlign: "right", writingDirection: "rtl", marginBottom: 8 },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  dialog: { width: "100%", borderRadius: 25, padding: 20, borderWidth: 1 },
  dialogHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  close: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  warning: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dialogTitle: { fontSize: 19, fontWeight: "900", textAlign: "right", marginTop: 14 },
  error: { fontSize: 10, textAlign: "center", marginBottom: 8, fontWeight: "800" },
});
