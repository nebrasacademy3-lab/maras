import React, { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";

type LegalResponse = {
  policies: { slug: "privacy" | "terms"; title: string; effectiveDate: string; version: string; sections: { id: string; title: string; body: string }[] }[];
  operator: { name: string; registration: string; address: string; supportEmail: string };
};
export default function LegalScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ document?: string }>();
  const [document, setDocument] = useState(params.document === "terms" ? "terms" : "privacy");
  const query = useQuery({ queryKey: ["published-legal"], queryFn: ({ signal }) => api<LegalResponse>("/api/public/legal", { signal }), staleTime: 60_000 });
  const policy = query.data?.policies.find(item => item.slug === document);
  const text = { color: colors.text, fontSize: 16, lineHeight: 28, textAlign: "right" as const, writingDirection: "rtl" as const };
  return <Screen><AppHeader title={policy?.title || "الخصوصية والشروط"} subtitle="وثائق مراس المنشورة" back />
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
      <AppButton full={false} title="سياسة الخصوصية" variant={document === "privacy" ? "primary" : "soft"} onPress={() => setDocument("privacy")} />
      <AppButton full={false} title="الشروط والأحكام" variant={document === "terms" ? "primary" : "soft"} onPress={() => setDocument("terms")} />
    </View>
    {query.isLoading ? <LoadingState /> : query.isError || !policy ? <EmptyState title="تعذر تحميل الوثيقة" text="تحقق من اتصالك ثم حاول مرة أخرى لقراءة النسخة المنشورة." action={<AppButton title="إعادة المحاولة" onPress={() => void query.refetch()} />} /> : <View style={{ gap: 16 }}>
      <Card style={{ gap: 8 }}><Text style={{ ...text, fontWeight: "800", fontSize: 22 }}>{policy.title}</Text><Text style={{ ...text, color: colors.textSoft }}>تاريخ النفاذ: {policy.effectiveDate} · الإصدار {policy.version}</Text></Card>
      {policy.sections.map(section => <Card key={section.id} style={{ gap: 12 }}><Text accessibilityRole="header" style={{ ...text, fontWeight: "800", fontSize: 19 }}>{section.title}</Text><Text selectable style={text}>{section.body}</Text></Card>)}
      <Card style={{ gap: 8 }}><Text style={{ ...text, fontWeight: "800" }}>الجهة المشغلة</Text>{Object.values(query.data!.operator).filter(Boolean).map((value, index) => <Text key={index} selectable style={text}>{value}</Text>)}<AppButton title="التواصل مع الدعم" variant="soft" onPress={() => router.push("/support")} /></Card>
    </View>}
  </Screen>;
}
