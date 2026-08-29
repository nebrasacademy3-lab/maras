import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { InstitutionCard } from "@/src/components/InstitutionCard";
import { Card, LoadingState, Screen, SearchBox } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";
import { Ionicons } from "@expo/vector-icons";

const types = ["الكل", "حكومية", "أهلية", "كلية", "تقنية"];

export default function Universities() {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("الكل");
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const rows = useMemo(() => (catalog.data?.institutions || []).filter((item) => (type === "الكل" || item.type === type) && `${item.name} ${item.nameEn} ${item.region}`.toLowerCase().includes(query.toLowerCase())), [catalog.data, query, type]);
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;

  return (
    <Screen>
      <AppHeader title="الجامعات والكليات" subtitle={`${rows.length} جهة مطابقة`} />
      <Card style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}>
        <View style={styles.heroRow}>
          <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}><Ionicons name="school-outline" size={22} color={colors.primary} /></View>
          <View style={styles.flexEnd}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>تصفح الجهات التعليمية بسهولة</Text>
            <Text style={[styles.heroCopy, { color: colors.textSoft }]}>ابحث باسم الجامعة أو المنطقة، ثم اختر نوع الجهة من الخيارات الواضحة بالأسفل.</Text>
          </View>
        </View>
      </Card>
      <SearchBox value={query} onChangeText={setQuery} placeholder="ابحث باسم الجامعة أو المنطقة" />
      <View style={styles.filters}>{types.map((item) => <Pressable key={item} onPress={() => setType(item)} style={[styles.filter, { backgroundColor: type === item ? colors.primary : colors.surface, borderColor: type === item ? colors.primary : colors.border }]}><Text style={{ color: type === item ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>{item}</Text></Pressable>)}</View>
      <View style={styles.list}>{rows.map((item) => <InstitutionCard compact key={item.slug} institution={item} />)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: 12 },
  heroRow: { flexDirection: "row-reverse", gap: 12, alignItems: "flex-start" },
  heroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  flexEnd: { flex: 1, alignItems: "flex-end" },
  heroTitle: { fontSize: 14, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  heroCopy: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  filters: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, paddingVertical: 14 },
  filter: { minWidth: 78, minHeight: 37, paddingHorizontal: 13, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  list: { marginTop: 2 },
});
