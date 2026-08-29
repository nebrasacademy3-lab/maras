import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { CatalogFilters, type CatalogScope } from "@/src/components/CatalogFilters";
import { CourseCard } from "@/src/components/CourseCard";
import { AppButton, EmptyState, ErrorState, LoadingState, Screen, SearchBox, SectionTitle } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { sanitizeAssistantCourseQuery } from "@/src/lib/assistantRoute";
import { catalogFilterContext, customizeCatalogFilters, resolveCatalogFilterState } from "@/src/lib/catalogFilterState";
import { useAuth } from "@/src/providers/AuthProvider";
import type { Catalog } from "@/src/types";

const ALL_UNIVERSITIES = "__all_universities__";
const ALL_SPECIALTIES = "__all_specialties__";

export default function Courses() {
  const { user, loading: authLoading } = useAuth();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const routedQuery = sanitizeAssistantCourseQuery(params.q);
  const [search, setSearch] = useState(() => ({ source: routedQuery, value: routedQuery }));
  const query = search.source === routedQuery ? search.value : routedQuery;
  const setQuery = (value: string) => setSearch({ source: routedQuery, value });
  const filterContext = useMemo(
    () => catalogFilterContext(authLoading, user, ALL_UNIVERSITIES, ALL_SPECIALTIES),
    [authLoading, user],
  );
  const [storedFilters, setStoredFilters] = useState(() => filterContext);
  const filters = resolveCatalogFilterState(storedFilters, filterContext);
  const { scope, university, specialty } = filters;
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const programs = useQuery({
    queryKey: ["catalog-programs", university],
    queryFn: () => api<{ programs: { name: string; aliases?: string[]; degree?: string; area?: string }[] }>(`/api/catalog/programs?institution=${encodeURIComponent(university)}`),
    enabled: university !== ALL_UNIVERSITIES,
  });

  const universityOptions = useMemo(() => [
    { key: ALL_UNIVERSITIES, label: "كل الجامعات والكليات", detail: "دون تقييد الجهة" },
    ...(catalog.data?.institutions || []).map((item) => ({ key: item.slug, label: item.name, detail: `${item.region} · ${item.type}` })).sort((a, b) => a.label.localeCompare(b.label, "ar")),
  ], [catalog.data]);
  const specialtyOptions = useMemo(() => {
    const names = university === ALL_UNIVERSITIES
      ? (catalog.data?.courses || []).map((course) => course.specialty)
      : (programs.data?.programs || []).flatMap((program) => [program.name, ...(program.aliases || [])]);
    return [{ key: ALL_SPECIALTIES, label: "كل التخصصات", detail: "دون تقييد التخصص" }, ...[...new Set(names)].sort((a, b) => a.localeCompare(b, "ar")).map((name) => ({ key: name, label: name }))];
  }, [catalog.data, programs.data, university]);
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    return (catalog.data?.courses || []).filter((course) => {
      const matchesUniversity = university === ALL_UNIVERSITIES || course.universitySlug === university;
      const matchesSpecialty = specialty === ALL_SPECIALTIES || course.specialty === specialty;
      const haystack = `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLocaleLowerCase("ar");
      return matchesUniversity && matchesSpecialty && (!needle || haystack.includes(needle));
    });
  }, [catalog.data, query, specialty, university]);

  function chooseScope(next: CatalogScope) {
    if (next === "personal") setStoredFilters(customizeCatalogFilters(filters, { scope: next, university: user?.universitySlug || ALL_UNIVERSITIES, specialty: user?.specialty || ALL_SPECIALTIES }));
    if (next === "university") setStoredFilters(customizeCatalogFilters(filters, { scope: next, university: user?.universitySlug || ALL_UNIVERSITIES, specialty: ALL_SPECIALTIES }));
    if (next === "specialty") setStoredFilters(customizeCatalogFilters(filters, { scope: next, university: ALL_UNIVERSITIES, specialty: user?.specialty || ALL_SPECIALTIES }));
    if (next === "all") setStoredFilters(customizeCatalogFilters(filters, { scope: next, university: ALL_UNIVERSITIES, specialty: ALL_SPECIALTIES }));
  }
  function chooseUniversity(next: string) { setStoredFilters(customizeCatalogFilters(filters, { scope: "all", university: next, specialty: ALL_SPECIALTIES })); }
  function chooseSpecialty(next: string) { setStoredFilters(customizeCatalogFilters(filters, { scope: "all", specialty: next })); }
  function reset() { setQuery(""); setStoredFilters(filterContext); }

  if (catalog.isLoading) return <Screen><LoadingState label="نجهّز كتالوج المواد..." /></Screen>;
  if (catalog.isError || !catalog.data) return <Screen><AppHeader title="المواد والشروحات" /><ErrorState title="تعذر تحميل كتالوج المواد" text="لم نتمكن من جلب المواد الآن. تحقق من اتصالك ثم أعد المحاولة." onRetry={() => void catalog.refetch()} /></Screen>;
  return <Screen>
    <AppHeader title="المواد والشروحات" subtitle="ابحث ثم خصّص النتائج من مكان واحد" />
    <SearchBox value={query} onChangeText={setQuery} placeholder="اسم المادة، الرمز، الجامعة أو التخصص" />
    <CatalogFilters
      scope={scope}
      onScopeChange={chooseScope}
      university={university}
      specialty={specialty}
      allUniversitiesKey={ALL_UNIVERSITIES}
      allSpecialtiesKey={ALL_SPECIALTIES}
      universities={universityOptions}
      specialties={specialtyOptions}
      onUniversityChange={chooseUniversity}
      onSpecialtyChange={chooseSpecialty}
      onReset={reset}
      specialtiesLoading={programs.isFetching}
      allowPersonal={Boolean(user)}
    />
    <SectionTitle title="النتائج" subtitle={`${rows.length} مادة مطابقة للبحث والفلاتر`} />
    {rows.length ? <View style={styles.list}>{rows.map((course) => <CourseCard compact key={course.slug} course={course} />)}</View> : <EmptyState icon="search-outline" title="لم نجد مادة مطابقة" text="جرّب كلمة أقصر أو أعد ضبط الفلاتر. وإذا لم تكن المادة متوفرة يمكنك إرسال طلب جديد للإدارة." action={<View style={styles.emptyActions}><AppButton title="إعادة ضبط البحث والفلاتر" icon="refresh-outline" variant="soft" onPress={reset} />{user ? <AppButton title="طلب مادة جديدة" icon="cloud-upload-outline" variant="ghost" onPress={() => router.push("/requests")} /> : null}</View>} />}
  </Screen>;
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  emptyActions: { width: "100%", gap: 8 },
});
