import React, { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, LoadingState, SectionTitle } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";

type History = { items: { id: string; title: string; status: string; purchased_at: string; duration_days: number | null }[]; total: number; pageSize: number };

/** Read-only receipts remain visible after retiring the store purchasing SDK. */
export function PurchaseHistory() {
  const { user } = useAuth();
  return user ? <AccountHistory key={user.id} userId={user.id} /> : null;
}
function AccountHistory({ userId }: { userId: number }) {
  const { colors } = useTheme();
  const [page, setPage] = useState(1);
  const history = useQuery({ queryKey: ["store-history", userId, page], queryFn: ({ signal }) => api<History>("/api/mobile/purchases/history?page=" + page, { signal }) });
  if (history.isLoading) return <LoadingState label="جارٍ تحميل سجل الاشتراكات…" />;
  if (history.isError) return <Card><Text style={{ color: colors.textSoft, textAlign: "right" }}>تعذر تحميل سجل مشتريات المتجر السابقة.</Text><AppButton title="إعادة المحاولة" variant="ghost" onPress={() => void history.refetch()} /></Card>;
  if (!history.data?.items.length) return null;
  return <View style={{ gap: 12, marginBottom: 20 }}>
    <SectionTitle title="مشتريات المتجر السابقة" subtitle="سجل محفوظ مرتبط بحسابك" />
    {history.data.items.map(item => <Card key={item.id}>
      <Text style={{ color: colors.text, fontWeight: "700", textAlign: "right" }}>{item.title}</Text>
      <Text style={{ color: colors.textSoft, textAlign: "right", marginTop: 8 }}>{new Date(item.purchased_at).toLocaleDateString("ar-SA")} · {item.status === "owned" ? "شراء موثق" : item.status === "refunded" ? "مسترد" : "قيد المراجعة"}</Text>
    </Card>)}
    {history.data.total > history.data.pageSize ? <View style={{ gap: 8 }}>
      <AppButton title="السابق" variant="soft" disabled={page === 1} onPress={() => setPage(value => value - 1)} />
      <Text style={{ color: colors.text, textAlign: "center" }}>صفحة {page}</Text>
      <AppButton title="التالي" variant="soft" disabled={page * history.data.pageSize >= history.data.total} onPress={() => setPage(value => value + 1)} />
    </View> : null}
  </View>;
}
