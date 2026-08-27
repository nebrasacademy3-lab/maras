import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { LoadingState, Screen, SearchBox } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

const ALL_UNIVERSITIES = "كل الجامعات";
const ALL_SPECIALTIES = "كل التخصصات";

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

  const universities = useMemo(() => (catalog.data?.institutions || []).map((institution) => [institution.slug, institution.name] as const).sort((a, b) => a[1].localeCompare(b[1], "ar")), [catalog.data]);
  const specialties = useMemo(() => {
    if (activeUniversity !== ALL_UNIVERSITIES) return [...new Set((programs.data?.programs || []).flatMap((program) => [program.name, ...(program.aliases || [])]))].sort((a, b) => a.localeCompare(b, "ar"));
    return [...new Set((catalog.data?.courses || []).map((course) => course.specialty))].sort((a, b) => a.localeCompare(b, "ar"));
  }, [activeUniversity, catalog.data, programs.data]);
  const rows = useMemo(() => (catalog.data?.courses || []).filter((course) => {
    const matchesScope = activeScope === "الكل" || activeScope === "موادي" && course.universitySlug === user?.universitySlug && course.specialty === user?.specialty || activeScope === "جامعتي" && course.universitySlug === user?.universitySlug || activeScope === "تخصصي" && course.specialty === user?.specialty;
    const matchesUniversity = activeUniversity === ALL_UNIVERSITIES || course.universitySlug === activeUniversity;
    const matchesSpecialty = activeSpecialty === ALL_SPECIALTIES || course.specialty === activeSpecialty;
    const needle = query.trim().toLocaleLowerCase("ar");
    return matchesScope && matchesUniversity && matchesSpecialty && (!needle || `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLocaleLowerCase("ar").includes(needle));
  }), [activeScope, activeSpecialty, activeUniversity, catalog.data, query, user]);

  function showAll() { setScopeOverride("الكل"); setUniversityOverride(ALL_UNIVERSITIES); setSpecialtyOverride(ALL_SPECIALTIES); }
  function showPersonal() { setScopeOverride("موادي"); setUniversityOverride(user?.universitySlug || ALL_UNIVERSITIES); setSpecialtyOverride(user?.specialty || ALL_SPECIALTIES); }
  function chooseUniversity(value: string) { setScopeOverride("الكل"); setUniversityOverride(value); }
  function chooseSpecialty(value: string) { setScopeOverride("الكل"); setSpecialtyOverride(value); }

  if (catalog.isLoading) return <Screen><LoadingState label="نجهّز كتالوج المواد..." /></Screen>;
  return <Screen><AppHeader title="المواد والشروحات" subtitle={`${rows.length} مادة ظاهرة`} /><SearchBox value={query} onChangeText={setQuery} placeholder="اسم المادة، الرمز، الجامعة أو التخصص" />
    {user && <View style={[styles.context, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.contextTitle, { color: colors.text }]}>{activeScope === "موادي" ? "مواد جامعتك وتخصصك أولًا" : "فلترة كتالوج المواد"}</Text><Text style={[styles.contextText, { color: colors.textSoft }]}>غيّر النطاق أو اختر جامعة وتخصصًا آخر في أي وقت.</Text><View style={styles.contextButtons}><Pressable onPress={showPersonal} style={[styles.contextButton, { backgroundColor: activeScope === "موادي" ? colors.primary : colors.surface, borderColor: activeScope === "موادي" ? colors.primary : colors.border }]}><Text style={{ color: activeScope === "موادي" ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>موادي المناسبة</Text></Pressable><Pressable onPress={showAll} style={[styles.contextButton, { backgroundColor: activeScope === "الكل" && activeUniversity === ALL_UNIVERSITIES && activeSpecialty === ALL_SPECIALTIES ? colors.primary : colors.surface, borderColor: colors.border }]}><Text style={{ color: activeScope === "الكل" && activeUniversity === ALL_UNIVERSITIES && activeSpecialty === ALL_SPECIALTIES ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>عرض الكل</Text></Pressable></View></View>}
    {user && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{["موادي", "جامعتي", "تخصصي", "الكل"].map((item) => <Pressable key={item} onPress={() => item === "الكل" ? showAll() : setScopeOverride(item)} style={[styles.filter, { backgroundColor: activeScope === item ? colors.primary : colors.surface, borderColor: activeScope === item ? colors.primary : colors.border }]}><Text style={{ color: activeScope === item ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>{item}</Text></Pressable>)}</ScrollView>}
        <Text style={[styles.label, { color: colors.textSoft }]}>الجامعة · {universities.length} جهة</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>{[ [ALL_UNIVERSITIES, ALL_UNIVERSITIES] as const, ...universities].map(([key, label]) => <Pressable key={key} onPress={() => chooseUniversity(key)} style={[styles.pickerItem, { backgroundColor: activeUniversity === key ? colors.surfaceAlt : colors.surface, borderColor: activeUniversity === key ? colors.primary : colors.border }]}><Text numberOfLines={1} style={{ color: activeUniversity === key ? colors.primary : colors.textSoft, fontSize: 9, fontWeight: "800" }}>{label}</Text></Pressable>)}</ScrollView>
    <Text style={[styles.label, { color: colors.textSoft }]}>{activeUniversity === ALL_UNIVERSITIES ? "التخصص · من المواد المنشورة" : programs.isLoading ? "التخصص · جارٍ تحميل كل تخصصات الجامعة..." : `التخصص · ${specialties.length} تخصصًا`}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>{[ALL_SPECIALTIES, ...specialties].map((item) => <Pressable key={item} onPress={() => chooseSpecialty(item)} disabled={programs.isLoading} style={[styles.pickerItem, { opacity: programs.isLoading ? .55 : 1, backgroundColor: activeSpecialty === item ? colors.surfaceAlt : colors.surface, borderColor: activeSpecialty === item ? colors.primary : colors.border }]}><Text numberOfLines={1} style={{ color: activeSpecialty === item ? colors.primary : colors.textSoft, fontSize: 9, fontWeight: "800" }}>{item}</Text></Pressable>)}</ScrollView>
    <Pressable onPress={showAll} style={[styles.clearButton, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800" }}>مسح الفلاتر والبحث</Text></Pressable>
    <View style={styles.list}>
{rows.map((course) => <CourseCard compact key={course.slug} course={course} />)}</View>{!rows.length && <Text style={[styles.empty, { color: colors.textSoft }]}>لا توجد مواد بهذه الفلاتر. اختر عرض الكل أو جرّب جامعة وتخصصًا آخر.</Text>}
  </Screen>;
}

const styles = StyleSheet.create({
  context: { borderRadius: 17, padding: 13, marginTop: 12 }, contextTitle: { textAlign: "right", writingDirection: "rtl", fontSize: 13, fontWeight: "900" }, contextText: { marginTop: 4, textAlign: "right", writingDirection: "rtl", fontSize: 10 }, contextButtons: { flexDirection: "row-reverse", gap: 8, marginTop: 10 }, contextButton: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" }, filters: { gap: 8, paddingVertical: 14 }, filter: { minWidth: 76, minHeight: 38, paddingHorizontal: 14, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },   label: { marginTop: 4, marginBottom: 7, textAlign: "right", writingDirection: "rtl", fontSize: 10, fontWeight: "800" }, clearButton: { minHeight: 38, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 10 }, picker: { gap: 7, paddingBottom: 6 }, pickerItem: { maxWidth: 210, minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" }, list: { marginTop: 14 }, empty: { padding: 24, textAlign: "center", writingDirection: "rtl", fontSize: 11, lineHeight: 20 },
});
