import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useDeferredValue, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { SearchPicker } from "@/src/components/SearchPicker";
import { AppButton, EmptyState, LoadingState, Screen, SearchBox } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

const ALL_UNIVERSITIES = "كل الجامعات";
const ALL_SPECIALTIES = "كل التخصصات";
const scopeOptions = [
  { key: "موادي", label: "مناسب لي", icon: "sparkles-outline" },
  { key: "جامعتي", label: "جامعتي", icon: "school-outline" },
  { key: "تخصصي", label: "تخصصي", icon: "library-outline" },
  { key: "الكل", label: "كل المواد", icon: "grid-outline" },
] as const;

function normalizeSearch(value: string) {
  return value.normalize("NFKD").toLocaleLowerCase("ar")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
}

export default function Courses() {
  const { colors } = useTheme();
  const { direction, rowDirection, isRTL } = useLanguage();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const [scopeOverride, setScopeOverride] = useState<string | null>(null);
  const [universityOverride, setUniversityOverride] = useState<string | null>(null);
  const [specialtyOverride, setSpecialtyOverride] = useState<string | null>(null);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog"), retry: 2 });
  const activeScope = scopeOverride ?? (user?.universitySlug ? "موادي" : "الكل");
  const activeUniversity = universityOverride ?? (user?.universitySlug || ALL_UNIVERSITIES);
  const activeSpecialty = specialtyOverride ?? (user?.universitySlug && user?.specialty ? user.specialty : ALL_SPECIALTIES);
  const programs = useQuery({
    queryKey: ["catalog-programs", activeUniversity],
    queryFn: () => api<{ programs: { name: string; aliases?: string[] }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(activeUniversity)}`),
    enabled: activeUniversity !== ALL_UNIVERSITIES,
    retry: 2,
  });

  const universities = useMemo(() => (catalog.data?.institutions || [])
    .map((institution) => ({ key: institution.slug, label: institution.name, detail: institution.region }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar")), [catalog.data]);
  const specialties = useMemo(() => {
    if (activeUniversity !== ALL_UNIVERSITIES) return [...new Set((programs.data?.programs || []).flatMap((program) => [program.name, ...(program.aliases || [])]))].sort((a, b) => a.localeCompare(b, "ar"));
    return [...new Set((catalog.data?.courses || []).map((course) => course.specialty))].sort((a, b) => a.localeCompare(b, "ar"));
  }, [activeUniversity, catalog.data, programs.data]);
  const universityItems = useMemo(() => [{ key: ALL_UNIVERSITIES, label: ALL_UNIVERSITIES, detail: `${universities.length} جهة تعليمية` }, ...universities], [universities]);
  const specialtyItems = useMemo(() => [{ key: ALL_SPECIALTIES, label: ALL_SPECIALTIES, detail: "من جميع المسارات" }, ...specialties.map((label) => ({ key: label, label }))], [specialties]);
  const terms = useMemo(() => normalizeSearch(deferredQuery).split(/\s+/).filter(Boolean), [deferredQuery]);

  const rows = useMemo(() => (catalog.data?.courses || []).filter((course) => {
    const institutionWide = course.audienceScope === "institution";
    const sameUserUniversity = Boolean(user?.universitySlug && course.universitySlug === user.universitySlug);
    const belongsToUserStudyPlan = sameUserUniversity && (institutionWide || course.specialty === user?.specialty);
    const matchesScope = activeScope === "الكل"
      || activeScope === "موادي" && belongsToUserStudyPlan
      || activeScope === "جامعتي" && sameUserUniversity
      || activeScope === "تخصصي" && Boolean(user?.specialty && course.specialty === user.specialty);
    const matchesUniversity = activeUniversity === ALL_UNIVERSITIES || course.universitySlug === activeUniversity;
    const matchesSpecialty = activeSpecialty === ALL_SPECIALTIES
      || course.specialty === activeSpecialty
      || institutionWide && activeUniversity !== ALL_UNIVERSITIES && course.universitySlug === activeUniversity;
    const searchable = normalizeSearch(`${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`);
    return matchesScope && matchesUniversity && matchesSpecialty && terms.every((term) => searchable.includes(term));
  }), [activeScope, activeSpecialty, activeUniversity, catalog.data, terms, user]);

  function showAll() {
    setScopeOverride("الكل");
    setUniversityOverride(ALL_UNIVERSITIES);
    setSpecialtyOverride(ALL_SPECIALTIES);
    setQuery("");
  }
  function chooseScope(value: string) {
    setScopeOverride(value);
    if (!user || value === "الكل") { setUniversityOverride(ALL_UNIVERSITIES); setSpecialtyOverride(ALL_SPECIALTIES); return; }
    if (value === "موادي") {
      setUniversityOverride(user.universitySlug || ALL_UNIVERSITIES);
      setSpecialtyOverride(user.specialty || ALL_SPECIALTIES);
    } else if (value === "تخصصي") {
      setUniversityOverride(ALL_UNIVERSITIES);
      setSpecialtyOverride(user.specialty || ALL_SPECIALTIES);
    } else {
      setUniversityOverride(user.universitySlug || ALL_UNIVERSITIES);
      setSpecialtyOverride(ALL_SPECIALTIES);
    }
  }
  function chooseUniversity(value: string) {
    setScopeOverride("الكل");
    setUniversityOverride(value);
    setSpecialtyOverride(ALL_SPECIALTIES);
  }
  function chooseSpecialty(value: string) {
    setScopeOverride("الكل");
    setSpecialtyOverride(value);
  }

  if (catalog.isLoading) return <Screen><AppHeader title="المواد والشروحات" subtitle="اكتشف شرحًا يناسب دراستك" /><LoadingState label="نجهّز كتالوج المواد..." /></Screen>;
  if (catalog.isError && !catalog.data) return <Screen><AppHeader title="المواد والشروحات" /><EmptyState icon="cloud-offline-outline" title="تعذر تحميل المواد" text="تحقق من اتصالك وحاول مجددًا." action={<AppButton title="إعادة المحاولة" icon="refresh-outline" onPress={() => void catalog.refetch()} />} /></Screen>;

  const grid = width >= 700;
  const chosenUniversity = universityItems.find((item) => item.key === activeUniversity)?.label || activeUniversity;
  const arrow = isRTL ? "arrow-back" : "arrow-forward";
  const hasFilters = activeScope !== "الكل" || activeUniversity !== ALL_UNIVERSITIES || activeSpecialty !== ALL_SPECIALTIES || Boolean(query.trim());

  return <Screen scroll={false} showFooter={false}>
    <FlatList
      key={grid ? "grid" : "list"}
      data={rows}
      keyExtractor={(course) => course.slug}
      numColumns={grid ? 2 : 1}
      columnWrapperStyle={grid ? styles.columns : undefined}
      renderItem={({ item }) => <View style={[styles.resultCell, grid && styles.resultCellWide]}><CourseCard compact course={item} /></View>}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={5}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={<>
        <AppHeader title="المواد والشروحات" subtitle="وصول أسرع إلى الشرح الذي تحتاجه" />
        <LinearGradient colors={[colors.hero, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { direction }]}>
          <View pointerEvents="none" style={styles.heroOrbit} />
          <Text style={styles.heroEyebrow}>دليل مراس الدراسي</Text>
          <Text style={styles.heroTitle}>تعلّم ما تحتاجه،{"\n"}بطريقتك.</Text>
          <Text style={styles.heroText}>ابحث عن المادة بالاسم أو الرمز، أو ابدأ من جامعتك وتخصصك.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="تصفح الجامعات والكليات" onPress={() => router.push("/(tabs)/universities")} style={({ pressed }) => [styles.universityLink, { flexDirection: rowDirection, opacity: pressed ? .78 : 1 }]}>
            <Ionicons name="school-outline" size={19} color="#FFFFFF" />
            <Text style={styles.universityLinkText}>ابدأ من جامعتك</Text>
            <Ionicons name={arrow} size={17} color="#FFFFFF" />
          </Pressable>
        </LinearGradient>

        <View style={styles.searchSection}>
          <Text style={[styles.searchLabel, { color: colors.text }]}>ما المادة التي تبحث عنها؟</Text>
          <SearchBox value={query} onChangeText={setQuery} placeholder="اسم المادة، الرمز، الجامعة أو التخصص" />
        </View>
        {user ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.scopeRail, { direction, flexDirection: rowDirection }]}>
          {scopeOptions.filter((item) => item.key === "الكل" || (item.key === "تخصصي" ? Boolean(user?.specialty) : Boolean(user?.universitySlug))).map((item) => {
            const selected = activeScope === item.key;
            return <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={item.label} onPress={() => chooseScope(item.key)} style={({ pressed }) => [styles.scopeButton, { flexDirection: rowDirection, backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? .76 : 1 }]}>
              <Ionicons name={item.icon} size={17} color={selected ? colors.onPrimary : colors.primary} />
              <Text style={[styles.scopeText, { color: selected ? colors.onPrimary : colors.text }]}>{item.label}</Text>
            </Pressable>;
          })}
        </ScrollView> : null}

        <View style={[styles.filterBar, { flexDirection: rowDirection }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="اختيار الجامعة والتخصص" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen((current) => !current)} style={({ pressed }) => [styles.filterToggle, { flexDirection: rowDirection, backgroundColor: colors.surface, borderColor: filtersOpen ? colors.primary : colors.border, opacity: pressed ? .76 : 1 }]}>
            <View style={[styles.filterIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="options-outline" size={19} color={colors.primary} /></View>
            <View style={styles.filterCopy}><Text style={[styles.filterTitle, { color: colors.text }]}>الجامعة والتخصص</Text><Text numberOfLines={1} style={[styles.filterDetail, { color: colors.textSoft }]}>{chosenUniversity} · {activeSpecialty}</Text></View>
            <Ionicons name={filtersOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
          </Pressable>
          {hasFilters ? <Pressable accessibilityRole="button" accessibilityLabel="إعادة ضبط البحث والتصفية" onPress={showAll} style={[styles.resetButton, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="refresh-outline" size={20} color={colors.primary} /></Pressable> : null}
        </View>
        {filtersOpen ? <View style={[styles.filterCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.filterIntro, { color: colors.textSoft }]}>خصص النتائج بجهتك التعليمية ومسارك.</Text>
          <SearchPicker label="الجامعة أو الكلية" value={activeUniversity} items={universityItems} placeholder="اختر جهة تعليمية" onSelect={(item) => chooseUniversity(item.key)} />
          <SearchPicker label="التخصص" value={activeSpecialty} items={specialtyItems} placeholder="اختر التخصص" disabled={programs.isLoading} onSelect={(item) => chooseSpecialty(item.key)} />
        </View> : null}

        {catalog.isError ? <Pressable accessibilityRole="button" onPress={() => void catalog.refetch()} style={[styles.warning, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.warningText, { color: colors.text }]}>نعرض نسخة محفوظة من المواد. اضغط لتحديثها.</Text></Pressable> : null}
        <View style={[styles.resultsHead, { flexDirection: rowDirection }]}>
          <View><Text style={[styles.resultsEyebrow, { color: colors.primary }]}>نتائج البحث</Text><Text style={[styles.resultsTitle, { color: colors.text }]}>{rows.length ? "مواد تناسب بحثك" : "لم نعثر على مادة مطابقة"}</Text></View>
          <Text accessibilityLiveRegion="polite" style={[styles.resultsCount, { color: colors.textSoft }]}>{rows.length} مادة</Text>
        </View>
      </>}
      ListEmptyComponent={<EmptyState icon="search-outline" title={catalog.data?.courses.length ? "لا توجد نتائج مطابقة" : "لا توجد مواد منشورة حاليًا"} text="جرّب اسمًا أقصر أو غيّر الجامعة والتخصص. يمكنك أيضًا طلب مادة جديدة ومتابعة طلبك من حسابك." action={<View style={styles.emptyActions}><AppButton title="عرض كل المواد" icon="refresh-outline" variant="soft" onPress={showAll} /><AppButton title="طلب مادة" icon="cloud-upload-outline" onPress={() => router.push("/requests")} /></View>} />}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  listContent: { flexGrow: 1, paddingBottom: 130 },
  columns: { justifyContent: "space-between", gap: 12 },
  resultCell: { width: "100%", marginBottom: 12 },
  resultCellWide: { width: "49%" },
  hero: { minHeight: 228, borderRadius: 26, padding: 23, overflow: "hidden", justifyContent: "space-between", gap: 10, marginBottom: 22 },
  heroOrbit: { position: "absolute", width: 280, height: 280, borderRadius: 140, borderWidth: 1, borderColor: "rgba(255,255,255,.14)", end: -95, bottom: -143 },
  heroEyebrow: { color: "#C7DEFF", fontSize: 11, lineHeight: 18, fontWeight: "900" },
  heroTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 39, fontWeight: "900" },
  heroText: { color: "#E1EAFA", fontSize: 13, lineHeight: 22, maxWidth: 470 },
  universityLink: { alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: "rgba(255,255,255,.32)", alignItems: "center", gap: 9, marginTop: 3 },
  universityLinkText: { color: "#FFFFFF", fontSize: 12, lineHeight: 20, fontWeight: "800" },
  searchSection: { gap: 9 },
  searchLabel: { fontSize: 15, lineHeight: 23, fontWeight: "900" },
  scopeRail: { gap: 8, paddingVertical: 14, paddingEnd: 16 },
  scopeButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, alignItems: "center", gap: 7 },
  scopeText: { fontSize: 12, lineHeight: 19, fontWeight: "800" },
  filterBar: { alignItems: "center", gap: 8, marginTop: 12 },
  filterToggle: { flex: 1, minWidth: 0, minHeight: 62, borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, alignItems: "center", gap: 9 },
  filterIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  filterCopy: { flex: 1, minWidth: 0, gap: 2 },
  filterTitle: { fontSize: 12, lineHeight: 19, fontWeight: "900" },
  filterDetail: { fontSize: 10, lineHeight: 17 },
  resetButton: { width: 54, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  filterCard: { marginTop: 9, borderWidth: 1, borderRadius: 19, padding: 16, paddingBottom: 4 },
  filterIntro: { fontSize: 11, lineHeight: 19, marginBottom: 10 },
  warning: { minHeight: 48, borderRadius: 12, padding: 13, marginTop: 12 },
  warningText: { fontSize: 11, lineHeight: 20 },
  resultsHead: { marginTop: 25, marginBottom: 14, alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  resultsEyebrow: { fontSize: 10, lineHeight: 17, fontWeight: "900" },
  resultsTitle: { fontSize: 19, lineHeight: 29, fontWeight: "900" },
  resultsCount: { fontSize: 11, lineHeight: 20, fontWeight: "800" },
  emptyActions: { width: "100%", gap: 8, marginTop: 12 },
});
