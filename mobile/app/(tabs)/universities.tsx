import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { InstitutionCard } from "@/src/components/InstitutionCard";
import { LoadingState, Screen, SearchBox } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

export default function Universities() {
  const { colors } = useTheme(); const [query, setQuery] = useState(""); const [type, setType] = useState("الكل"); const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const rows = useMemo(() => (catalog.data?.institutions || []).filter((item) => (type === "الكل" || item.type === type) && `${item.name} ${item.nameEn} ${item.region}`.toLowerCase().includes(query.toLowerCase())), [catalog.data, query, type]);
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  return <Screen><AppHeader title="الجامعات والكليات" subtitle={`${rows.length} جهة مطابقة`} /><SearchBox value={query} onChangeText={setQuery} placeholder="ابحث باسم الجامعة أو المنطقة" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{["الكل", "حكومية", "أهلية", "كلية", "تقنية"].map((item) => <Pressable key={item} onPress={() => setType(item)} style={[styles.filter, { backgroundColor: type === item ? colors.primary : colors.surface, borderColor: type === item ? colors.primary : colors.border }]}><Text style={{ color: type === item ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>{item}</Text></Pressable>)}</ScrollView><View style={styles.list}>{rows.map((item) => <InstitutionCard compact key={item.slug} institution={item} />)}</View></Screen>;
}
const styles = StyleSheet.create({ filters: { gap: 8, paddingVertical: 14 }, filter: { minWidth: 78, minHeight: 37, paddingHorizontal: 13, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" }, list: { marginTop: 2 } });

