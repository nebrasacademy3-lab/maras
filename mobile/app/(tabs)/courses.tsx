import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { LoadingState, Screen, SearchBox } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog } from "@/src/types";

export default function Courses() {
  const { colors } = useTheme(); const { user } = useAuth(); const [query, setQuery] = useState(""); const [scope, setScope] = useState("الكل"); const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const rows = useMemo(() => (catalog.data?.courses || []).filter((course) => (scope === "الكل" || (scope === "جامعتي" && course.universitySlug === user?.universitySlug) || (scope === "تخصصي" && course.specialty === user?.specialty)) && `${course.title} ${course.titleEn} ${course.code || ""} ${course.university} ${course.specialty}`.toLowerCase().includes(query.toLowerCase())), [catalog.data, query, scope, user]);
  if (catalog.isLoading) return <Screen><LoadingState /></Screen>;
  return <Screen><AppHeader title="المواد والشروحات" subtitle={`${rows.length} مادة متاحة`} /><SearchBox value={query} onChangeText={setQuery} placeholder="اسم المادة، الرمز، الجامعة أو التخصص" />{user && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{["الكل", "جامعتي", "تخصصي"].map((item) => <Pressable key={item} onPress={() => setScope(item)} style={[styles.filter, { backgroundColor: scope === item ? colors.primary : colors.surface, borderColor: scope === item ? colors.primary : colors.border }]}><Text style={{ color: scope === item ? "#FFF" : colors.text, fontSize: 10, fontWeight: "800" }}>{item}</Text></Pressable>)}</ScrollView>}<View style={styles.list}>{rows.map((course) => <CourseCard compact key={course.slug} course={course} />)}</View></Screen>;
}
const styles = StyleSheet.create({ filters: { gap: 8, paddingVertical: 14 }, filter: { minWidth: 90, minHeight: 38, paddingHorizontal: 14, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" }, list: { marginTop: 14 } });

