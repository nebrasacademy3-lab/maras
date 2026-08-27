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
  return <Screen>
    <AppHeader title="الطلبات والفواتير" subtitle="سجل مرتبط بحسابك" back />
    <SectionTitle title="الطلبات" subtitle={`${orders.length} عملية`} />
    {orders.length ? orders.map((order) => <Card key={order.orderNumber} style={styles.card}>
      <View style={styles.row}><View style={[styles.status, { backgroundColor: order.status === "paid" ? `${colors.success}18` : colors.surfaceAlt }]}><Text style={{ color: order.status === "paid" ? colors.success : colors.primary, fontSize: 8, fontWeight: "900" }}>{orderLabels[order.status] || order.status}</Text></View><Text style={[styles.title, { color: colors.text }]}>{order.courseTitle}</Text></View>
      <View style={styles.details}><Text style={[styles.amount, { color: colors.text }]}>{order.total.toLocaleString("ar-SA")} ر.س</Text><Text style={[styles.meta, { color: colors.textSoft }]}>#{order.orderNumber} · {new Date(order.createdAt).toLocaleDateString("ar-SA")}</Text></View>
    </Card>) : <EmptyState icon="cart-outline" title="لا توجد طلبات" text="ستظهر هنا عمليات الاشتراك بعد إنشائها من موقع مراس." />}
    <SectionTitle title="الفواتير" subtitle="تُنشأ بعد تأكيد الدفع من مزود الدفع" />
    {invoices.length ? invoices.map((invoice) => <Card key={invoice.invoiceNumber} style={styles.card}><View style={styles.invoice}><View style={[styles.invoiceIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="document-text-outline" size={22} color={colors.primary} /></View><View style={styles.flex}><Text style={[styles.title, { color: colors.text }]}>فاتورة {invoice.invoiceNumber}</Text><Text style={[styles.meta, { color: colors.textSoft }]}>طلب #{invoice.orderNumber} · {new Date(invoice.issuedAt).toLocaleDateString("ar-SA")}</Text></View><Text style={[styles.amount, { color: colors.text }]}>{invoice.total.toLocaleString("ar-SA")} ر.س</Text></View></Card>) : <EmptyState icon="document-text-outline" title="لا توجد فواتير" text="تظهر الفاتورة تلقائيًا بعد نجاح الدفع والتحقق منه." />}
  </Screen>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, card: { marginBottom: 9 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, title: { flex: 1, fontSize: 12, fontWeight: "900", textAlign: "right" }, status: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 }, details: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 11 }, amount: { fontSize: 13, fontWeight: "900" }, meta: { fontSize: 8, textAlign: "right", marginTop: 4 }, invoice: { flexDirection: "row-reverse", alignItems: "center", gap: 10 }, invoiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" } });
