import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { Card, EmptyState, LoadingState, Screen, SearchBox, SectionTitle } from "@/src/components/ui";
import { SearchPicker } from "@/src/components/SearchPicker";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

const ALL_UNIVERSITIES = "كل الجامعات";
const ALL_SPECIALTIES = "كل التخصصات";
const scopeOptions = ["موادي", "جامعتي", "تخصصي", "الكل"] as const;

export default function Courses() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [scopeOverride, setScopeOverride] = useState<string | null>(null);
  const [universityOverride, setUniversityOverride] = useState<string | null>(null);
  const [specialtyOverride, setSpecialtyOverride] = useState<string | null>(null);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const activeScope = scopeOverride ?? (user ? "موادي" : "الكل");
  const activeUniversity = universityOverride ?? (user?.universitySlug || ALL_UNIVERSITIES);
  const activeSpecialty = specialtyOverride ?? (user?.specialty || ALL_SPECIALTIES);
  const programs = useQuery({ queryKey: ["catalog-programs", activeUniversity], queryFn: () => api<{ programs: { name: string; aliases?: string[] }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(activeUniversity)}`), enabled: activeUniversity !== ALL_UNIVERSITIES });

  const universities = useMemo(() => (catalog.data?.institutions || []).map((institution) => ({ key: institution.slug, label: institution.name, detail: institution.region })).sort((a, b) => a.label.localeCompare(b.label, "ar")), [catalog.data]);
  const specialties = useMemo(() => {
    if (activeUniversity !== ALL_UNIVERSITIES) {
      return [...new Set((programs.data?.programs || []).flatMap((program) => [program.name, ...(program.aliases || [])]))].sort((a, b) => a.localeCompare(b, "ar"));
    }
    return [...new Set((catalog.data?.courses || []).map((course) => course.specialty))].sort((a, b) => a.localeCompare(b, "ar"));
  }, [activeUniversity, catalog.data, programs.data]);

  const rows = useMemo(() => (catalog.data?.courses || []).filter((course) => {
    const matchesScope = activeScope === "الكل"
      || (activeScope === "موادي" && course.universitySlug === user?.universitySlug && course.specialty === user?.specialty)
      || (activeScope === "جامعتي" && course.universitySlug === user?.universitySlug)
      || (activeScope === "تخصصي" && course.specialty === user?.specialty);
    const matchesUniversity = activeUniversity === ALL_UNIVERSITIES || course.universitySlug === activeUniversity;
    const matchesSpecialty = activeSpecialty === ALL_SPECIALTIES || course.specialty === activeSpecialty;
    const needle = query.trim().toLocaleLowerCase("ar");
    return matchesScope && matchesUniversity && matchesSpecialty && (!needle || `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLocaleLowerCase("ar").includes(needle));
  }), [activeScope, activeSpecialty, activeUniversity, catalog.data, query, user]);

  const selectedUniversityName = activeUniversity === ALL_UNIVERSITIES ? ALL_UNIVERSITIES : universities.find((item) => item.key === activeUniversity)?.label || ALL_UNIVERSITIES;
  const selectedSpecialtyName = activeSpecialty;

  function showAll() {
    setScopeOverride("الكل");
    setUniversityOverride(ALL_UNIVERSITIES);
    setSpecialtyOverride(ALL_SPECIALTIES);
  }

  function showPersonal() {
    setScopeOverride("موادي");
    setUniversityOverride(user?.universitySlug || ALL_UNIVERSITIES);
    setSpecialtyOverride(user?.specialty || ALL_SPECIALTIES);
  }

  function clearAll() {
    setQuery("");
    if (user) showPersonal();
    else showAll();
  }

  if (catalog.isLoading) return <Screen><LoadingState label="نجهّز كتالوج المواد..." /></Screen>;

  return (
    <Screen>
      <AppHeader title="المواد والشروحات" subtitle={`${rows.length} مادة مطابقة`} />

      <Card style={[styles.hero, { backgroundColor: colors.surfaceAlt }]}> 
        <View style={styles.heroHead}>
          <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="funnel-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.flexEnd}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>{user ? "بحث وفلترة بشكل أوضح" : "ابحث في كتالوج مراس"}</Text>
            <Text style={[styles.heroCopy, { color: colors.textSoft }]}>{user ? "موادك تظهر أولًا، ويمكنك التبديل إلى كل الجامعات أو تخصيص البحث بسهولة." : "اختر الجامعة والتخصص ثم استعرض المواد بشكل مرتب وواضح."}</Text>
          </View>
        </View>
      </Card>

      <SearchBox value={query} onChangeText={setQuery} placeholder="اسم المادة، الرمز، الجامعة أو التخصص" />

      {user && <View style={styles.scopeRow}>
        <Pressable onPress={showPersonal} style={[styles.scopeButton, { backgroundColor: activeScope === "موادي" ? colors.primary : colors.surface, borderColor: activeScope === "موادي" ? colors.primary : colors.border }]}>
          <Ionicons name="sparkles-outline" size={16} color={activeScope === "موادي" ? "#FFF" : colors.primary} />
          <Text style={{ color: activeScope === "موادي" ? "#FFF" : colors.text, fontSize: 11, fontWeight: "800" }}>موادي المناسبة</Text>
        </Pressable>
        <Pressable onPress={showAll} style={[styles.scopeButton, { backgroundColor: activeScope === "الكل" && activeUniversity === ALL_UNIVERSITIES && activeSpecialty === ALL_SPECIALTIES ? colors.primary : colors.surface, borderColor: activeScope === "الكل" && activeUniversity === ALL_UNIVERSITIES && activeSpecialty === ALL_SPECIALTIES ? colors.primary : colors.border }]}>
          <Ionicons name="grid-outline" size={16} color={activeScope === "الكل" && activeUniversity === ALL_UNIVERSITIES && activeSpecialty === ALL_SPECIALTIES ? "#FFF" : colors.primary} />
          <Text style={{ color: activeScope === "الكل" && activeUniversity === ALL_UNIVERSITIES && activeSpecialty === ALL_SPECIALTIES ? "#FFF" : colors.text, fontSize: 11, fontWeight: "800" }}>عرض الكل</Text>
        </Pressable>
      </View>}

      <SectionTitle title="الفلترة" subtitle="اختر النطاق ثم الجامعة والتخصص بطريقة مرتبة" />
      <Card>
        {user && <View style={styles.quickScopes}>
          {scopeOptions.map((item) => (
            <Pressable key={item} onPress={() => item === "الكل" ? showAll() : setScopeOverride(item)} style={[styles.quickScope, { backgroundColor: activeScope === item ? colors.primary : colors.surfaceAlt, borderColor: activeScope === item ? colors.primary : colors.border }]}>
              <Text style={{ color: activeScope === item ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>{item}</Text>
            </Pressable>
          ))}
        </View>}

        <SearchPicker label="الجامعة" value={activeUniversity === ALL_UNIVERSITIES ? undefined : activeUniversity} items={universities} placeholder={ALL_UNIVERSITIES} onSelect={(item) => { setScopeOverride("الكل"); setUniversityOverride(item.key); setSpecialtyOverride(ALL_SPECIALTIES); }} />
        <SearchPicker label="التخصص" value={activeSpecialty === ALL_SPECIALTIES ? undefined : activeSpecialty} items={specialties.map((item) => ({ key: item, label: item }))} placeholder={programs.isLoading ? "نجهّز التخصصات..." : ALL_SPECIALTIES} onSelect={(item) => { setScopeOverride("الكل"); setSpecialtyOverride(item.key); }} disabled={activeUniversity !== ALL_UNIVERSITIES && programs.isLoading} />

        <View style={styles.summaryWrap}>
          <FilterPill label={`النطاق: ${activeScope}`} colors={colors} />
          <FilterPill label={`الجامعة: ${selectedUniversityName}`} colors={colors} />
          <FilterPill label={`التخصص: ${selectedSpecialtyName}`} colors={colors} />
        </View>

        <Pressable onPress={clearAll} style={[styles.clearButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="refresh-outline" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>إعادة ضبط البحث والفلاتر</Text>
        </Pressable>
      </Card>

      <SectionTitle title="نتائج المواد" subtitle={`${rows.length} مادة ظاهرة`} />
      <View style={styles.list}>
        {rows.map((course) => <CourseCard compact key={course.slug} course={course} />)}
      </View>
      {!rows.length && <EmptyState icon="search-outline" title="لا توجد نتائج بهذه الفلاتر" text="جرّب اختيار نطاق أوسع أو امسح الفلاتر لإظهار مواد أكثر." />}
    </Screen>
  );
}

function FilterPill({ label, colors }: { label: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={[styles.pill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Text numberOfLines={1} style={[styles.pillText, { color: colors.textSoft }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { marginBottom: 12 },
  heroHead: { flexDirection: "row-reverse", gap: 12, alignItems: "flex-start" },
  heroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  flexEnd: { flex: 1, alignItems: "flex-end" },
  heroTitle: { fontSize: 14, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  heroCopy: { fontSize: 10, lineHeight: 18, textAlign: "right", writingDirection: "rtl", marginTop: 4 },
  scopeRow: { flexDirection: "row-reverse", gap: 10, marginTop: 12 },
  scopeButton: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 },
  quickScopes: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  quickScope: { minWidth: 76, minHeight: 36, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  summaryWrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 14 },
  pill: { maxWidth: "100%", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 34, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 10, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  clearButton: { minHeight: 42, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 7 },
  list: { marginTop: 2 },
});
