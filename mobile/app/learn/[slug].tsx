import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { Card, EmptyState, LoadingState, Screen, SectionTitle } from "@/src/components/ui";
import { absoluteUrl, api, ApiError } from "@/src/lib/api";
import { downloadProtectedFile } from "@/src/lib/downloads";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { Catalog, CourseResource, CourseResourcesResponse, Dashboard } from "@/src/types";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function fileIcon(contentType: string): IconName {
  if (contentType.includes("pdf")) return "document-text-outline";
  if (contentType.startsWith("image/")) return "image-outline";
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) return "easel-outline";
  if (contentType.includes("spreadsheet") || contentType.includes("excel")) return "grid-outline";
  return "document-attach-outline";
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} م.ب`;
}

export default function LearningRoom() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const courseSlug = typeof slug === "string" ? slug : "";
  const { user } = useAuth();
  const { colors } = useTheme();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadMessage, setDownloadMessage] = useState("");

  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<Catalog>("/api/mobile/catalog"),
  });
  const dashboard = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: () => api<Dashboard>("/api/mobile/dashboard"),
    enabled: Boolean(user),
  });
  const hasActiveAccess = Boolean(
    user && courseSlug && dashboard.data?.owned.some((item) => item.slug === courseSlug),
  );
  const resources = useQuery({
    queryKey: ["course-resources", courseSlug, user?.id],
    queryFn: () => api<CourseResourcesResponse>(
      `/api/course-resources?course=${encodeURIComponent(courseSlug)}`,
    ),
    enabled: hasActiveAccess,
    retry: 1,
  });

  async function download(resource: CourseResource) {
    setDownloadingId(resource.id);
    setDownloadMessage("");
    try {
      const result = await downloadProtectedFile({
        path: resource.downloadUrl,
        fileName: resource.originalName,
        mimeType: resource.contentType,
        saveToFiles: true,
        openAfterDownload: true,
      });
      setDownloadMessage(
        result.action === "cancelled"
          ? "تم إلغاء اختيار مكان الحفظ."
          : result.action === "stored"
            ? "تم تنزيل الملف داخل مساحة تطبيق مراس."
            : "أصبح الملف جاهزًا للعرض أو الحفظ.",
      );
    } catch (reason) {
      setDownloadMessage(
        reason instanceof ApiError ? reason.message : "تعذر تنزيل الملف. حاول مرة أخرى.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  if (!user) {
    return (
      <Screen>
        <AppHeader title="غرفة التعلم" back />
        <EmptyState title="سجّل الدخول" text="الوصول إلى المادة مرتبط بحساب الطالب." />
      </Screen>
    );
  }
  if (catalog.isLoading || dashboard.isLoading) return <Screen><LoadingState /></Screen>;

  const course = catalog.data?.courses.find((item) => item.slug === courseSlug);
  const owned = dashboard.data?.owned.find((item) => item.slug === courseSlug);
  const progress = dashboard.data?.progress.filter((row) => row.courseSlug === courseSlug) || [];
  if (!course || !owned) {
    return (
      <Screen>
        <AppHeader title="غرفة التعلم" back />
        <EmptyState title="لا توجد صلاحية نشطة" text="فعّل المادة من حسابك ثم أعد المحاولة." />
      </Screen>
    );
  }

  const lessons = course.units.flatMap((unit) => unit.lessons);
  const availableLessons = lessons.filter((lesson) => lesson.ready);
  const upcoming = lessons.length - availableLessons.length;
  const completed = progress.filter(
    (item) => item.completed && availableLessons.some((lesson) => lesson.id === item.lessonId),
  ).length;
  const percentage = availableLessons.length
    ? Math.round(completed / availableLessons.length * 100)
    : 0;

  return (
    <Screen>
      <AppHeader title={course.title} subtitle={`${percentage}% من المحتوى المتاح`} back />
      {course.coverImage ? (
        <Image source={{ uri: absoluteUrl(course.coverImage) }} style={styles.coverImage} resizeMode="cover" />
      ) : null}

      <Card style={styles.progressCard}>
        <View style={styles.progressHead}>
          <Text style={[styles.percent, { color: colors.primary }]}>{percentage}%</Text>
          <View style={styles.progressCopyBox}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>تقدمك في المادة</Text>
            <Text style={[styles.progressCopy, { color: colors.textSoft }]}>
              {completed} من {availableLessons.length} دروس متاحة مكتملة
              {upcoming ? ` · ${upcoming} تُضاف قريبًا` : ""}
            </Text>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${percentage}%` }]} />
        </View>
      </Card>

      <SectionTitle title="ملفات المادة" subtitle="ملفات مساندة يحددها فريق المادة" />
      {downloadMessage ? (
        <Text style={[styles.downloadMessage, { color: colors.primary }]}>{downloadMessage}</Text>
      ) : null}
      {resources.isLoading ? (
        <LoadingState label="نجهّز ملفات المادة…" />
      ) : resources.isError ? (
        <Card style={styles.resourceState}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.textSoft} />
          <Text style={[styles.resourceStateTitle, { color: colors.text }]}>تعذر تحميل الملفات</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void resources.refetch()}
            style={[styles.retryButton, { backgroundColor: colors.surfaceAlt }]}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>إعادة المحاولة</Text>
          </Pressable>
        </Card>
      ) : resources.data?.resources.length ? (
        <View style={styles.resourcesList}>
          {resources.data.resources.map((resource) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`تنزيل ${resource.title}`}
              disabled={downloadingId !== null}
              key={resource.id}
              onPress={() => void download(resource)}
              style={({ pressed }) => [
                styles.resourceRow,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed || downloadingId !== null && downloadingId !== resource.id ? 0.72 : 1,
                },
              ]}
            >
              <View style={[styles.resourceIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name={fileIcon(resource.contentType)} size={22} color={colors.primary} />
              </View>
              <View style={styles.resourceCopy}>
                <Text numberOfLines={2} style={[styles.resourceTitle, { color: colors.text }]}>
                  {resource.title}
                </Text>
                {resource.description ? (
                  <Text numberOfLines={2} style={[styles.resourceDescription, { color: colors.textSoft }]}>
                    {resource.description}
                  </Text>
                ) : null}
                <Text numberOfLines={1} style={[styles.resourceMeta, { color: colors.textSoft }]}>
                  {resource.originalName} · {fileSize(resource.sizeBytes)}
                </Text>
              </View>
              <View style={[styles.downloadIcon, { backgroundColor: colors.primary }]}>
                {downloadingId === resource.id ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="download-outline" size={18} color="#FFF" />
                )}
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Card style={styles.resourceState}>
          <Ionicons name="folder-open-outline" size={25} color={colors.textSoft} />
          <Text style={[styles.resourceStateTitle, { color: colors.text }]}>لا توجد ملفات مضافة حاليًا</Text>
          <Text style={[styles.resourceStateText, { color: colors.textSoft }]}>
            ستظهر هنا تلقائيًا عند إضافتها إلى المادة.
          </Text>
        </Card>
      )}

      <SectionTitle title="الوحدات والدروس" subtitle="اضغط على أي درس للمتابعة" />
      {course.units.map((unit, unitIndex) => (
        <Card key={`${unit.title}-${unitIndex}`} style={styles.unit}>
          <Text style={[styles.unitTitle, { color: colors.text }]}>
            {unitIndex + 1}. {unit.title}
          </Text>
          {unit.description ? (
            <Text style={[styles.unitDescription, { color: colors.textSoft }]}>{unit.description}</Text>
          ) : null}
          {unit.lessons.map((lesson, index) => {
            const row = progress.find((item) => item.lessonId === lesson.id);
            return (
              <Pressable
                key={lesson.id}
                onPress={() => lesson.ready
                  ? router.push({
                    pathname: "/lesson/[courseSlug]/[lessonId]",
                    params: { courseSlug: course.slug, lessonId: lesson.id, from: "learn" },
                  })
                  : undefined}
                style={[styles.lesson, { borderTopColor: colors.border }]}
              >
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: row?.completed ? `${colors.success}20` : colors.surfaceAlt },
                  ]}
                >
                  <Ionicons
                    name={row?.completed ? "checkmark" : lesson.ready ? "play" : "time-outline"}
                    size={17}
                    color={row?.completed ? colors.success : lesson.ready ? colors.primary : colors.textSoft}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.lessonTitle, { color: colors.text }]}>
                    {index + 1}. {lesson.title}
                  </Text>
                  <Text style={[styles.lessonMeta, { color: colors.textSoft }]}>
                    {lesson.duration}
                    {row?.watchedSeconds ? ` · شاهدت ${Math.floor(row.watchedSeconds / 60)} د` : ""}
                    {!lesson.ready ? " · يُضاف قريبًا ضمن اشتراكك" : ""}
                  </Text>
                  {lesson.description ? (
                    <Text style={[styles.lessonDescription, { color: colors.textSoft }]}>
                      {lesson.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  coverImage: { width: "100%", height: 150, borderRadius: 22, marginBottom: 10 },
  progressCard: { marginBottom: 8 },
  progressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  progressCopyBox: { flex: 1, alignItems: "flex-start" },
  percent: { fontSize: 25, fontWeight: "900" },
  progressTitle: { fontSize: 14, fontWeight: "900", textAlign: "right" },
  progressCopy: { fontSize: 9, marginTop: 4, textAlign: "right" },
  track: { height: 8, borderRadius: 4, marginTop: 15, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  downloadMessage: { fontSize: 10, lineHeight: 18, fontWeight: "800", textAlign: "center", marginBottom: 9 },
  resourcesList: { gap: 9, marginBottom: 6 },
  resourceRow: {
    minHeight: 86,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  resourceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  resourceCopy: { flex: 1, alignItems: "flex-start" },
  resourceTitle: { fontSize: 11, lineHeight: 18, fontWeight: "900", textAlign: "right" },
  resourceDescription: { fontSize: 9, lineHeight: 16, marginTop: 3, textAlign: "right" },
  resourceMeta: { fontSize: 8, marginTop: 5, textAlign: "right" },
  downloadIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  resourceState: { minHeight: 112, alignItems: "center", justifyContent: "center", marginBottom: 6, gap: 6 },
  resourceStateTitle: { fontSize: 11, fontWeight: "900", textAlign: "center" },
  resourceStateText: { fontSize: 9, lineHeight: 16, textAlign: "center" },
  retryButton: { minHeight: 36, borderRadius: 11, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  retryText: { fontSize: 9, fontWeight: "900" },
  unit: { paddingVertical: 7, marginBottom: 10 },
  unitTitle: { fontSize: 14, fontWeight: "900", textAlign: "right", padding: 8 },
  unitDescription: { fontSize: 10, lineHeight: 18, textAlign: "right", paddingHorizontal: 8, paddingBottom: 8 },
  lesson: { minHeight: 66, borderTopWidth: 1, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lessonTitle: { fontSize: 11, fontWeight: "800", textAlign: "right" },
  lessonMeta: { fontSize: 8, marginTop: 4, textAlign: "right" },
  lessonDescription: { fontSize: 9, lineHeight: 16, marginTop: 3, textAlign: "right" },
});
