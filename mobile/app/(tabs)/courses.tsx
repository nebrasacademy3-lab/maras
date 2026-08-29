import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { SearchPicker } from "@/src/components/SearchPicker";
import { LoadingState, Screen, SearchBox } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
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

export default function Courses() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [scopeOverride, setScopeOverride] = useState<string | null>(null);
  const [universityOverride, setUniversityOverride] = useState<string | null>(null);
  const [specialtyOverride, setSpecialtyOverride] = useState<string | null>(null);
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog"), retry: 2 });
  const activeScope = scopeOverride ?? (user ? "موادي" : "الكل");
  const activeUniversity = universityOverride ?? (user?.universitySlug || ALL_UNIVERSITIES);
  const activeSpecialty = specialtyOverride ?? (user?.specialty || ALL_SPECIALTIES);
  const programs = useQuery({ queryKey: ["catalog-programs", activeUniversity], queryFn: () => api<{ programs: { name: string; aliases?: string[] }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(activeUniversity)}`), enabled: activeUniversity !== ALL_UNIVERSITIES, retry: 2 });

  const universities = useMemo(() => (catalog.data?.institutions || []).map((institution) => ({ key: institution.slug, label: institution.name, detail: institution.region })).sort((a, b) => a.label.localeCompare(b.label, "ar")), [catalog.data]);
  const specialties = useMemo(() => {
    if (activeUniversity !== ALL_UNIVERSITIES) return [...new Set((programs.data?.programs || []).flatMap((program) => [program.name, ...(program.aliases || [])]))].sort((a, b) => a.localeCompare(b, "ar"));
    return [...new Set((catalog.data?.courses || []).map((course) => course.specialty))].sort((a, b) => a.localeCompare(b, "ar"));
  }, [activeUniversity, catalog.data, programs.data]);
  const universityItems = useMemo(() => [{ key: ALL_UNIVERSITIES, label: ALL_UNIVERSITIES, detail: `${universities.length} جهة تعليمية` }, ...universities], [universities]);
  const specialtyItems = useMemo(() => [{ key: ALL_SPECIALTIES, label: ALL_SPECIALTIES, detail: "من جميع المسارات" }, ...specialties.map((label) => ({ key: label, label }))], [specialties]);

  const rows = useMemo(() => (catalog.data?.courses || []).filter((course) => {
    const matchesScope = activeScope === "الكل" || activeScope === "موادي" && course.universitySlug === user?.universitySlug && course.specialty === user?.specialty || activeScope === "جامعتي" && course.universitySlug === user?.universitySlug || activeScope === "تخصصي" && course.specialty === user?.specialty;
    const matchesUniversity = activeUniversity === ALL_UNIVERSITIES || course.universitySlug === activeUniversity;
    const matchesSpecialty = activeSpecialty === ALL_SPECIALTIES || course.specialty === activeSpecialty;
    const needle = query.trim().toLocaleLowerCase("ar");
    return matchesScope && matchesUniversity && matchesSpecialty && (!needle || `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLocaleLowerCase("ar").includes(needle));
  }), [activeScope, activeSpecialty, activeUniversity, catalog.data, query, user]);

  function showAll() { setScopeOverride("الكل"); setUniversityOverride(ALL_UNIVERSITIES); setSpecialtyOverride(ALL_SPECIALTIES); setQuery(""); }
  function chooseScope(value: string) {
    setScopeOverride(value);
    if (!user || value === "الكل") { setUniversityOverride(ALL_UNIVERSITIES); setSpecialtyOverride(ALL_SPECIALTIES); return; }
    if (value === "موادي") { setUniversityOverride(user.universitySlug || ALL_UNIVERSITIES); setSpecialtyOverride(user.specialty || ALL_SPECIALTIES); }
    if (value === "جامعتي") { setUniversityOverride(user.universitySlug || ALL_UNIVERSITIES); setSpecialtyOverride(ALL_SPECIALTIES); }
    if (value === "تخصصي") { setUniversityOverride(ALL_UNIVERSITIES); setSpecialtyOverride(user.specialty || ALL_SPECIALTIES); }
  }
  function chooseUniversity(value: string) { setScopeOverride("الكل"); setUniversityOverride(value); setSpecialtyOverride(ALL_SPECIALTIES); }
  function chooseSpecialty(value: string) { setScopeOverride("الكل"); setSpecialtyOverride(value); }

  if (catalog.isLoading) return <Screen><LoadingState label="نجهّز كتالوج المواد..." /></Screen>;
  return <Screen><AppHeader title="المواد والشروحات" subtitle={`${rows.length} مادة ظاهرة`} />
    <View style={[styles.hero, { backgroundColor: colors.primary }]}>
      <View style={styles.heroIcon}><Ionicons name="search-outline" size={25} color="#FFF" /></View>
      <View style={styles.heroCopy}><Text style={styles.heroTitle}>ابحث بهدوء، ثم صفِّ عند الحاجة</Text><Text style={styles.heroText}>كل الفلاتر المهمة في بطاقة واحدة بدل صفوف طويلة ومزدحمة.</Text></View>
    </View>
    <SearchBox value={query} onChangeText={setQuery} placeholder="اسم المادة، الرمز، الجامعة أو التخصص" />
    <View style={[styles.filterCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.filterHeading}><View style={[styles.filterIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="options-outline" size={18} color={colors.primary} /></View><View style={styles.filterHeadingCopy}><Text style={[styles.filterTitle, { color: colors.text }]}>تصفية المواد</Text><Text style={[styles.filterHint, { color: colors.textSoft }]}>افتح أي اختيار وابحث داخله مباشرة</Text></View></View>
      {user ? <View style={styles.scopeGrid}>{scopeOptions.map((item) => <Pressable key={item.key} onPress={() => chooseScope(item.key)} style={[styles.scopeButton, { backgroundColor: activeScope === item.key ? colors.primary : colors.surfaceAlt, borderColor: activeScope === item.key ? colors.primary : colors.border }]}><Ionicons name={item.icon} size={16} color={activeScope === item.key ? "#FFF" : colors.primary} /><Text style={{ color: activeScope === item.key ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>{item.label}</Text></Pressable>)}</View> : null}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <SearchPicker label="الجامعة أو الكلية" value={activeUniversity} items={universityItems} placeholder="اختر جهة تعليمية" onSelect={(item) => chooseUniversity(item.key)} />
      <SearchPicker label="التخصص" value={activeSpecialty} items={specialtyItems} placeholder="اختر التخصص" disabled={programs.isLoading} onSelect={(item) => chooseSpecialty(item.key)} />
      <View style={styles.filterSummary}><View style={styles.summaryCopy}><Text style={[styles.summaryTitle, { color: colors.text }]}>{rows.length} نتيجة مطابقة</Text><Text style={[styles.summaryText, { color: colors.textSoft }]} numberOfLines={2}>{activeUniversity === ALL_UNIVERSITIES ? "كل الجامعات" : universityItems.find((item) => item.key === activeUniversity)?.label} · {activeSpecialty}</Text></View><Pressable onPress={showAll} style={[styles.resetButton, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="refresh-outline" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 9, fontWeight: "900" }}>إعادة الضبط</Text></Pressable></View>
    </View>
    <View style={styles.resultsHead}><Text style={[styles.resultsTitle, { color: colors.text }]}>النتائج</Text><Text style={[styles.resultsCount, { color: colors.textSoft }]}>{rows.length} مادة</Text></View>
    <View style={styles.list}>{rows.map((course) => <CourseCard compact key={course.slug} course={course} />)}</View>
    {!rows.length ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search-outline" size={28} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.text }]}>لا توجد نتيجة بهذه الاختيارات</Text><Text style={[styles.emptyText, { color: colors.textSoft }]}>جرّب إزالة بعض الفلاتر أو ابحث باسم مختلف.</Text><Pressable onPress={showAll} style={[styles.emptyAction, { backgroundColor: colors.primary }]}><Text style={styles.emptyActionText}>عرض كل المواد</Text></Pressable></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 104, borderRadius: 22, padding: 18, marginBottom: 13, flexDirection: "row-reverse", alignItems: "center", gap: 13, overflow: "hidden" },
  heroIcon: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.16)" },
  heroCopy: { flex: 1, alignItems: "flex-end" },
  heroTitle: { color: "#FFF", fontSize: 16, fontWeight: "900", textAlign: "right" },
  heroText: { color: "rgba(255,255,255,.78)", fontSize: 10, lineHeight: 18, textAlign: "right", marginTop: 5 },
  filterCard: { borderWidth: 1, borderRadius: 22, padding: 15, marginTop: 13 },
  filterHeading: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 13 },
  filterIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  filterHeadingCopy: { flex: 1, alignItems: "flex-end" },
  filterTitle: { fontSize: 14, fontWeight: "900", textAlign: "right" },
  filterHint: { fontSize: 9, marginTop: 3, textAlign: "right" },
  scopeGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 13 },
  scopeButton: { width: "48.5%", minHeight: 42, borderWidth: 1, borderRadius: 13, paddingHorizontal: 9, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 14 },
  filterSummary: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 2 },
  summaryCopy: { flex: 1, alignItems: "flex-end" },
  summaryTitle: { fontSize: 11, fontWeight: "900" },
  summaryText: { fontSize: 8, lineHeight: 15, textAlign: "right", marginTop: 2 },
  resetButton: { minHeight: 38, borderRadius: 12, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  resultsHead: { marginTop: 20, marginBottom: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  resultsTitle: { fontSize: 17, fontWeight: "900" },
  resultsCount: { fontSize: 9, fontWeight: "700" },
  list: { gap: 10 },
  empty: { borderWidth: 1, borderRadius: 20, padding: 24, alignItems: "center" },
  emptyTitle: { fontSize: 14, fontWeight: "900", marginTop: 10 },
  emptyText: { fontSize: 10, textAlign: "center", marginTop: 5 },
  emptyAction: { minHeight: 40, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", marginTop: 14 },
  emptyActionText: { color: "#FFF", fontSize: 10, fontWeight: "900" },
});
