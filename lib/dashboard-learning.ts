import type { Course } from "@/lib/data";

type Progress = { courseSlug: string; lessonId: string; completed: boolean; updatedAt: string };
type Access = { startsAt: string; expiresAt: string | null; suspendedAt: string | null };

/** Shared SSR/live DTO: count only available lessons and resume the latest activity. */
export function dashboardCourseLearning(course: Pick<Course, "slug" | "units" | "access">, rows: readonly Progress[], access: Access, now: string) {
  const lessons = course.units.flatMap(unit => unit.lessons).filter(lesson => lesson.ready);
  const available = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const byLesson = new Map<string, Progress>();
  const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.courseSlug !== course.slug || !available.has(row.lessonId)) continue;
    const previous = byLesson.get(row.lessonId);
    if (!previous || timestamp(row.updatedAt) > timestamp(previous.updatedAt)) byLesson.set(row.lessonId, row);
  }
  const progressRows = [...byLesson.values()];
  const completed = progressRows.filter(row => row.completed).length;
  const latest = progressRows.filter(row => Number.isFinite(timestamp(row.updatedAt))).sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))[0];
  const currentLessonId = latest?.lessonId || lessons[0]?.id || null;
  const total = available.size;
  const progress = total === 0 ? 0 : completed === total ? 100 : Math.min(99, Math.round(completed / total * 100));
  const instant = Date.parse(now);
  const accessState = access.suspendedAt ? "suspended" as const : Date.parse(access.startsAt) > instant ? "scheduled" as const : access.expiresAt && Date.parse(access.expiresAt) <= instant ? "expired" as const : "active" as const;
  const expires = access.expiresAt ? new Date(access.expiresAt) : null;
  return {
    progress, currentLessonId,
    current: currentLessonId ? available.get(currentLessonId)!.title : "ستظهر الدروس المتاحة هنا",
    remaining: expires && Number.isFinite(expires.getTime()) ? "حتى " + expires.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" }) : course.access,
    accessState, expiresAt: access.expiresAt,
  };
}

export function dashboardRecommendationMatch(course: Pick<Course, "universitySlug" | "audienceScope">, universitySlug: string | null | undefined) {
  return course.universitySlug === universitySlug ? course.audienceScope === "institution" ? "جامعتك" as const : "تخصصك" as const : "تخصص مشابه" as const;
}
