import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useDeferredValue, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { InstitutionCard } from "@/src/components/InstitutionCard";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, EmptyState, LoadingState, Screen, SearchBox } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

const types = ["الكل", "حكومية", "أهلية", "كلية", "تقنية"] as const;
function normalizeSearch(value: string) {
  return value.normalize("NFKD").toLocaleLowerCase("ar")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
}

export default function Universities() {
  const { colors } = useTheme();
  const { direction, rowDirection, isRTL } = useLanguage();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [type, setType] = useState<string>("الكل");
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog"), retry: 2 });
  const terms = useMemo(() => normalizeSearch(deferredQuery).split(/\s+/).filter(Boolean), [deferredQuery]);
  const institutions = useMemo(() => catalog.data?.institutions || [], [catalog.data]);
  const rows = useMemo(() => institutions
    .filter((item) => {
      const matchesType = type === "الكل" || item.type === type;
      const searchable = normalizeSearch(`${item.name} ${item.nameEn} ${item.region} ${(item.aliases || []).join(" ")}`);
      return matchesType && terms.every((term) => searchable.includes(term));
    })
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.name.localeCompare(b.name, "ar")), [institutions, terms, type]);
  const columns = width >= 1080 ? 3 : width >= 700 ? 2 : 1;
  const arrow = isRTL ? "arrow-back" : "arrow-forward";
  const reset = () => { setQuery(""); setType("الكل"); };

  if (catalog.isLoading) return <Screen><AppHeader title="الجامعات والكليات" subtitle="اكتشف جهتك التعليمية" /><LoadingState label="نجهّز دليل الجامعات..." /></Screen>;
  if (catalog.isError && !catalog.data) return <Screen><AppHeader back title="الجامعات والكليات" onBack={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/courses")} /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل الجامعات" text="تحقق من اتصالك وحاول مجددًا." action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void catalog.refetch()} />} /></Screen>;

  return <Screen scroll={false} showFooter={false}>
    <FlatList
      key={String(columns)}
      data={rows}
      keyExtractor={(item) => item.slug}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? styles.columns : undefined}
      renderItem={({ item }) => <View style={[styles.cell, columns === 2 && styles.cellHalf, columns === 3 && styles.cellThird]}><InstitutionCard compact institution={item} /></View>}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={6}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={<>
        <AppHeader back title="الجامعات والكليات" subtitle="ابدأ بجامعتك، ثم اختر المادة" onBack={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/courses")} />
        <LinearGradient colors={[colors.hero, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { direction }]}>
          <View pointerEvents="none" style={styles.heroOrbit} />
          <View style={[styles.heroLabel, { flexDirection: rowDirection }]}><Ionicons name="school-outline" size={16} color="#D9E7FF" /><Text style={styles.eyebrow}>دليل الجهات التعليمية</Text></View>
          <Text style={styles.heroTitle}>جامعتك بداية{"\n"}كل خطوة.</Text>
          <Text style={styles.heroCopy}>اختر الجهة التعليمية لتصل إلى تخصصاتها وموادها بسهولة.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="تصفح كل المواد مباشرة" onPress={() => router.push("/(tabs)/courses")} style={({ pressed }) => [styles.heroAction, { flexDirection: rowDirection, opacity: pressed ? .78 : 1 }]}>
            <Text style={styles.heroActionText}>تصفح كل المواد</Text><Ionicons name={arrow} size={18} color="#FFFFFF" />
          </Pressable>
        </LinearGradient>
        <View style={styles.searchSection}><Text style={[styles.searchLabel, { color: colors.text }]}>ابحث عن جامعتك أو كليتك</Text><SearchBox value={query} onChangeText={setQuery} placeholder="اسم الجامعة أو المنطقة" /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filters, { direction, flexDirection: rowDirection }]}>
          {types.map((item) => {
            const selected = type === item;
            const count = item === "الكل" ? institutions.length : institutions.filter((institution) => institution.type === item).length;
            return <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${item}، ${count} جهة`} onPress={() => setType(item)} style={({ pressed }) => [styles.filter, { flexDirection: rowDirection, backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? .76 : 1 }]}>
              <Text style={[styles.filterText, { color: selected ? colors.onPrimary : colors.text }]}>{item}</Text>
              <Text style={[styles.filterCount, { color: selected ? colors.onPrimary : colors.textSoft }]}>{count}</Text>
            </Pressable>;
          })}
        </ScrollView>
        {catalog.isError ? <Pressable accessibilityRole="button" onPress={() => void catalog.refetch()} style={[styles.warning, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.warningText, { color: colors.text }]}>نعرض نسخة محفوظة من الدليل. اضغط لتحديثها.</Text></Pressable> : null}
        <View style={[styles.resultsHead, { flexDirection: rowDirection }]}><View><Text style={[styles.resultsEyebrow, { color: colors.primary }]}>دليل الجامعات</Text><Text style={[styles.resultsTitle, { color: colors.text }]}>{rows.length ? "جهات تعليمية تناسب بحثك" : "لم نجد جهة مطابقة"}</Text></View><Text accessibilityLiveRegion="polite" style={[styles.resultsCount, { color: colors.textSoft }]}>{rows.length} جهة</Text></View>
      </>}
      ListEmptyComponent={<EmptyState icon="search-outline" title={institutions.length ? "لا توجد جامعات مطابقة" : "لا توجد جامعات منشورة حاليًا"} text="جرّب اسمًا آخر أو منطقة مختلفة، أو تصفح كل المواد مباشرة." action={<View style={styles.emptyActions}><AppButton title="إظهار كل الجامعات" icon="refresh-outline" variant="soft" onPress={reset} /><AppButton title="تصفح المواد" icon="library-outline" onPress={() => router.push("/(tabs)/courses")} /></View>} />}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  listContent: { flexGrow: 1, paddingBottom: 130 },
  columns: { justifyContent: "space-between", gap: 12 },
  cell: { width: "100%", marginBottom: 12 },
  cellHalf: { width: "49%" },
  cellThird: { width: "32%" },
  hero: { minHeight: 226, borderRadius: 26, padding: 23, justifyContent: "space-between", gap: 10, overflow: "hidden", marginBottom: 22 },
  heroOrbit: { position: "absolute", width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: "rgba(255,255,255,.14)", end: -95, bottom: -143 },
  heroLabel: { alignItems: "center", gap: 8 }, eyebrow: { color: "#D9E7FF", fontSize: 11, lineHeight: 18, fontWeight: "900" },
  heroTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 39, fontWeight: "900" },
  heroCopy: { color: "#E1EAFA", fontSize: 13, lineHeight: 22, maxWidth: 470 },
  heroAction: { alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: "rgba(255,255,255,.32)", alignItems: "center", gap: 9, marginTop: 3 },
  heroActionText: { color: "#FFFFFF", fontSize: 12, lineHeight: 20, fontWeight: "800" },
  searchSection: { gap: 9 },
  searchLabel: { fontSize: 15, lineHeight: 23, fontWeight: "900" },
  filters: { gap: 8, paddingVertical: 15, paddingEnd: 16 },
  filter: { minHeight: 46, minWidth: 80, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 7 },
  filterText: { fontSize: 12, lineHeight: 19, fontWeight: "800" },
  filterCount: { fontSize: 10, lineHeight: 17, fontWeight: "800" },
  warning: { minHeight: 48, borderRadius: 12, padding: 13 },
  warningText: { fontSize: 11, lineHeight: 20 },
  resultsHead: { marginTop: 12, marginBottom: 14, alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  resultsEyebrow: { fontSize: 10, lineHeight: 17, fontWeight: "900" },
  resultsTitle: { fontSize: 19, lineHeight: 29, fontWeight: "900" },
  resultsCount: { fontSize: 11, lineHeight: 20, fontWeight: "800" },
  emptyActions: { width: "100%", gap: 8, marginTop: 12 },
});
