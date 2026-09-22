/** Web/native lesson navigation and playback contracts: keep the mirrored mobile copy identical. */
export const LESSON_TABS = [
  { id: "overview", label: "نظرة عامة", icon: "book-outline" },
  { id: "notes", label: "ملاحظاتي", icon: "create-outline" },
  { id: "files", label: "ملفات المادة", icon: "folder-open-outline" },
  { id: "quiz", label: "اختبر نفسك", icon: "help-circle-outline" },
  { id: "tutor", label: "المعلم الذكي", icon: "chatbubbles-outline" },
] as const;
export type LessonTab = typeof LESSON_TABS[number]["id"];
export const STUDY_ACTIONS = ["summary", "translation", "quiz"] as const;
export const QUIZ_DIFFICULTIES = [
  { value: "easy", label: "سهل", description: "تذكّر المفاهيم وفهم الأساسيات" },
  { value: "medium", label: "متوسط", description: "فهم وتطبيق المفاهيم" },
  { value: "hard", label: "صعب", description: "تحليل وربط مفاهيم الملف" },
] as const;
export type QuizDifficulty = typeof QUIZ_DIFFICULTIES[number]["value"];
export function quizDifficulty(value: unknown): QuizDifficulty {
  return value === "easy" || value === "hard" ? value : "medium";
}
export function boundedSeek(current: number, delta: number, duration: number) {
  const time = Number.isFinite(current) ? current : 0;
  const end = Number.isFinite(duration) && duration > 0 ? duration : 0;
  return Math.min(end, Math.max(0, time + (Number.isFinite(delta) ? delta : 0)));
}
/** Physical right/left, independent of Arabic layout direction. */
export function doubleTapDelta(x: number, width: number) { return x >= width / 2 ? 10 : -10; }
export type PlaybackSession = {
  streamUrl: string; sourceUrl?: string; hlsUrl?: string; expiresAt: string; adaptive?: boolean;
  playbackProof?: string; encrypted?: boolean; qualities?: { label: string; width: number; height: number; bitrateKbps: number }[];
  branding?: { whatsapp: string }; processing?: { status: string; progress: number | null; message: string };
};
export function playbackQualitySources(session: PlaybackSession): Record<string, string> {
  if (!session.hlsUrl) return { "الأصلية": session.streamUrl };
  const sources: Record<string, string> = { "تلقائي": session.hlsUrl };
  for (const item of session.qualities || []) if (/^\d{3,4}p$/.test(item.label)) {
    sources[item.label] = session.hlsUrl.replace(/\/master\.m3u8(?=\?|$)/, `/${item.label}/index.m3u8`);
  }
  return sources;
}
