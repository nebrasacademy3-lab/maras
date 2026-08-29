import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { AppButton, Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Dashboard } from "@/src/types";

const orderLabels: Record<string, string> = { paid: "مدفوع", initiated: "بانتظار التأكيد", pending: "قيد البدء", failed: "لم يكتمل", canceled: "ملغي" };

export default function Orders() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const dashboard = useQuery({ queryKey: ["dashboard", user?.id], queryFn: () => api<Dashboard>("/api/mobile/dashboard"), enabled: Boolean(user) });
  if (!user) return <Screen><AppHeader title="الطلبات والفواتير" back /><EmptyState icon="receipt-outline" title="الحساب مطلوب" text="سجّل الدخول لعرض سجل اشتراكاتك وفواتيرك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (dashboard.isLoading) return <Screen><LoadingState /></Screen>;

  const orders = dashboard.data?.orders || [];
  const invoices = dashboard.data?.invoices || [];
  const paid = orders.filter((item) => item.status === "paid");
  const paidTotal = paid.reduce((sum, item) => sum + item.total, 0);

  return <Screen>
    <AppHeader title="الطلبات والفواتير" subtitle="سجل مالي مرتبط بحسابك" back />
    <Card style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}> 
      <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}><Ionicons name="receipt-outline" size={25} color={colors.primary} /></View>
      <View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.text }]}>سجل اشتراكاتك</Text><Text style={[styles.heroText, { color: colors.textSoft }]}>كل عملية دفع وفاتورة تبقى مرتبطة بحسابك، وتتحدث تلقائيًا بعد تأكيد مزود الدفع.</Text></View>
    </Card>

    <View style={styles.stats}>
      <Stat icon="bag-check-outline" label="الطلبات" value={String(orders.length)} colors={colors} />
      <Stat icon="checkmark-done-outline" label="مدفوعة" value={String(paid.length)} colors={colors} />
      <Stat icon="cash-outline" label="الإجمالي" value={`${paidTotal.toLocaleString("ar-SA")} ر.س`} colors={colors} />
    </View>

    <SectionTitle title="الطلبات" subtitle={`${orders.length} عملية محفوظة`} />
    {orders.length ? orders.map((order) => {
      const success = order.status === "paid";
      const failed = order.status === "failed" || order.status === "canceled";
      const statusColor = success ? colors.success : failed ? colors.danger : colors.primary;
      return <Card key={order.orderNumber} style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.status, { backgroundColor: `${statusColor}16` }]}><Ionicons name={success ? "checkmark-circle" : failed ? "close-circle-outline" : "time-outline"} size={13} color={statusColor} /><Text style={{ color: statusColor, fontSize: 8, fontWeight: "900" }}>{orderLabels[order.status] || order.status}</Text></View>
          <Text style={[styles.title, { color: colors.text }]}>{order.courseTitle}</Text>
        </View>
        <View style={styles.details}><Text style={[styles.amount, { color: colors.text }]}>{order.total.toLocaleString("ar-SA")} ر.س</Text><Text style={[styles.meta, { color: colors.textSoft }]}>طلب #{order.orderNumber} · {new Date(order.createdAt).toLocaleDateString("ar-SA")}</Text></View>
      </Card>;
    }) : <EmptyState icon="cart-outline" title="لا توجد طلبات" text="ستظهر هنا عمليات الاشتراك فور إنشائها وتبقى متزامنة مع موقع مراس." action={<AppButton title="استكشف المواد" variant="soft" onPress={() => router.push("/(tabs)/courses")} />} />}

    <SectionTitle title="الفواتير" subtitle="تُنشأ تلقائيًا بعد تأكيد الدفع" />
    {invoices.length ? invoices.map((invoice) => <Card key={invoice.invoiceNumber} style={styles.card}><View style={styles.invoice}><View style={[styles.invoiceIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="document-text-outline" size={22} color={colors.primary} /></View><View style={styles.flex}><Text style={[styles.title, { color: colors.text }]}>فاتورة {invoice.invoiceNumber}</Text><Text style={[styles.meta, { color: colors.textSoft }]}>طلب #{invoice.orderNumber} · {new Date(invoice.issuedAt).toLocaleDateString("ar-SA")}</Text></View><Text style={[styles.amount, { color: colors.text }]}>{invoice.total.toLocaleString("ar-SA")} ر.س</Text></View></Card>) : <EmptyState icon="document-text-outline" title="لا توجد فواتير" text="تظهر الفاتورة تلقائيًا بعد نجاح الدفع والتحقق منه." />}
  </Screen>;
}

function Stat({ icon, label, value, colors }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <Card style={styles.stat}><Ionicons name={icon} size={20} color={colors.primary} /><Text style={[styles.statValue, { color: colors.text }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.textSoft }]}>{label}</Text></Card>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 12 },
  heroIcon: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, alignItems: "flex-end" },
  heroTitle: { fontSize: 15, fontWeight: "900", textAlign: "right" },
  heroText: { fontSize: 9, lineHeight: 17, textAlign: "right", writingDirection: "rtl", marginTop: 3 },
  stats: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, minHeight: 100, alignItems: "center", justifyContent: "center", paddingHorizontal: 7, gap: 5 },
  statValue: { fontSize: 13, fontWeight: "900", textAlign: "center" },
  statLabel: { fontSize: 8, fontWeight: "800", textAlign: "center" },
  card: { marginBottom: 9 },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, fontSize: 12, fontWeight: "900", textAlign: "right" },
  status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  details: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 11 },
  amount: { fontSize: 13, fontWeight: "900" },
  meta: { fontSize: 8, textAlign: "right", marginTop: 4 },
  invoice: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  invoiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
