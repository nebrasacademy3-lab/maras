import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { AppHeader } from "@/src/components/AppHeader";
import { CourseCard } from "@/src/components/CourseCard";
import { AppButton, EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";
import type { Catalog } from "@/src/types";

export default function Favorites() {
  const { user } = useAuth();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/api/mobile/catalog") });
  const favorites = useQuery({ queryKey: ["favorites", user?.id], queryFn: () => api<{ courseSlugs: string[] }>("/api/mobile/favorites"), enabled: Boolean(user) });
  if (!user) return <Screen><AppHeader title="المفضلة" back /><EmptyState icon="heart-outline" title="سجّل الدخول" text="المفضلة مرتبطة بحسابك وتبقى محفوظة على كل أجهزتك." action={<AppButton title="تسجيل الدخول" onPress={() => router.push("/(auth)/login")} />} /></Screen>;
  if (catalog.isLoading || favorites.isLoading) return <Screen><LoadingState /></Screen>;
  const rows = catalog.data?.courses.filter((course) => favorites.data?.courseSlugs.includes(course.slug)) || [];
  return <Screen><AppHeader title="المفضلة" subtitle={`${rows.length} مواد محفوظة`} back />{rows.length ? rows.map((course) => <CourseCard key={course.slug} course={course} compact />) : <EmptyState icon="heart-outline" title="لا توجد مواد محفوظة" text="اضغط أيقونة القلب من صفحة المادة لتظهر هنا." action={<AppButton title="تصفح المواد" variant="soft" onPress={() => router.push("/(tabs)/courses")} />} />}</Screen>;
}
