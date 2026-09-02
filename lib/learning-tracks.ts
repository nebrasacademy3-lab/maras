import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { learningTrackInterests, learningTracks } from "@/db/schema";

export const LEARNING_TRACK_STATUSES = ["draft", "coming_soon", "enrollment_open", "available", "archived"] as const;
export const PUBLIC_LEARNING_TRACK_STATUSES = ["coming_soon", "enrollment_open", "available"] as const;
export const LEARNING_TRACK_CATEGORIES = ["english", "training", "foundation", "university", "career", "exam", "skills"] as const;
export const LEARNING_TRACK_ICONS = ["languages", "briefcase", "calculator", "presentation", "rocket", "target", "sparkles"] as const;
export const LEARNING_TRACK_ACCENTS = ["blue", "violet", "emerald", "amber", "rose", "cyan"] as const;

export type LearningTrackStatus = typeof LEARNING_TRACK_STATUSES[number];
export type LearningTrackCategory = typeof LEARNING_TRACK_CATEGORIES[number];
export type LearningTrackIcon = typeof LEARNING_TRACK_ICONS[number];
export type LearningTrackAccent = typeof LEARNING_TRACK_ACCENTS[number];

export type PublicLearningTrack = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: LearningTrackCategory;
  iconKey: LearningTrackIcon;
  accent: LearningTrackAccent;
  status: Extract<LearningTrackStatus, "coming_soon" | "enrollment_open" | "available">;
  ctaLabel: string;
  destination: string | null;
  position: number;
  featured: boolean;
  showInterestCount: boolean;
  interestCount: number;
  launchAt: string | null;
};

const defaults: PublicLearningTrack[] = [
  {
    id: -1,
    slug: "english-boost",
    title: "تقوية الإنجليزية",
    subtitle: "من الأساس إلى الإنجليزية الأكاديمية",
    description: "مسارات متدرجة للمحادثة والقواعد والمصطلحات التي يحتاجها الطالب في الجامعة.",
    category: "english",
    iconKey: "languages",
    accent: "blue",
    status: "coming_soon",
    ctaLabel: "أبلغني عند الإطلاق",
    destination: null,
    position: 10,
    featured: true,
    showInterestCount: false,
    interestCount: 0,
    launchAt: null,
  },
  {
    id: -2,
    slug: "professional-training",
    title: "الدورات التدريبية",
    subtitle: "مهارات عملية تتجاوز حدود المقرر",
    description: "دورات مختارة في الأدوات الرقمية والبرمجة وتحليل البيانات ومهارات العمل.",
    category: "training",
    iconKey: "briefcase",
    accent: "violet",
    status: "coming_soon",
    ctaLabel: "أبلغني عند الإطلاق",
    destination: null,
    position: 20,
    featured: true,
    showInterestCount: false,
    interestCount: 0,
    launchAt: null,
  },
  {
    id: -3,
    slug: "foundation-paths",
    title: "المسارات التأسيسية",
    subtitle: "أساس قوي قبل المقررات المتقدمة",
    description: "تأسيس منظم في الرياضيات والفيزياء والكيمياء والبرمجة قبل الانتقال للمستوى التالي.",
    category: "foundation",
    iconKey: "calculator",
    accent: "emerald",
    status: "coming_soon",
    ctaLabel: "أبلغني عند الإطلاق",
    destination: null,
    position: 30,
    featured: true,
    showInterestCount: false,
    interestCount: 0,
    launchAt: null,
  },
  {
    id: -4,
    slug: "university-skills",
    title: "مهارات الجامعة",
    subtitle: "أدوات للدراسة والبحث والعرض",
    description: "البحث العلمي وكتابة التقارير والعروض وإدارة الوقت بأسلوب تطبيقي واضح.",
    category: "university",
    iconKey: "presentation",
    accent: "amber",
    status: "coming_soon",
    ctaLabel: "أبلغني عند الإطلاق",
    destination: null,
    position: 40,
    featured: false,
    showInterestCount: false,
    interestCount: 0,
    launchAt: null,
  },
  {
    id: -5,
    slug: "career-ready",
    title: "الاستعداد للعمل",
    subtitle: "من مقاعد الجامعة إلى أول فرصة",
    description: "السيرة الذاتية والمقابلات والمهارات المهنية التي تساعد الطالب على دخول سوق العمل بثقة.",
    category: "career",
    iconKey: "rocket",
    accent: "rose",
    status: "coming_soon",
    ctaLabel: "أبلغني عند الإطلاق",
    destination: null,
    position: 50,
    featured: false,
    showInterestCount: false,
    interestCount: 0,
    launchAt: null,
  },
  {
    id: -6,
    slug: "exam-prep",
    title: "الاستعداد للاختبارات",
    subtitle: "تدريب موجّه للهدف",
    description: "مسارات مراجعة وتدريب للاختبارات المعيارية واللغوية عند إطلاقها.",
    category: "exam",
    iconKey: "target",
    accent: "cyan",
    status: "coming_soon",
    ctaLabel: "أبلغني عند الإطلاق",
    destination: null,
    position: 60,
    featured: false,
    showInterestCount: false,
    interestCount: 0,
    launchAt: null,
  },
];

export const DEFAULT_LEARNING_TRACKS = Object.freeze(defaults.map((track) => Object.freeze({ ...track })));

export function isInternalDestination(value: string | null | undefined) {
  return !value || (/^\/[A-Za-z0-9/_?=&%#.-]*$/.test(value) && !value.startsWith("//") && !/(^|\/)\.\.(\/|$)/.test(value));
}

function publicTrack(row: typeof learningTracks.$inferSelect, interestCount: number): PublicLearningTrack {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    category: row.category as LearningTrackCategory,
    iconKey: row.iconKey as LearningTrackIcon,
    accent: row.accent as LearningTrackAccent,
    status: row.status as PublicLearningTrack["status"],
    ctaLabel: row.ctaLabel,
    destination: isInternalDestination(row.destination) ? row.destination : null,
    position: row.position,
    featured: row.featured,
    showInterestCount: row.showInterestCount,
    interestCount: row.showInterestCount ? interestCount : 0,
    launchAt: row.launchAt,
  };
}

export async function getPublicLearningTracks(): Promise<PublicLearningTrack[]> {
  try {
    const db = getDb();
    const [rows, counts] = await Promise.all([
      db.select().from(learningTracks)
        .where(inArray(learningTracks.status, [...PUBLIC_LEARNING_TRACK_STATUSES]))
        .orderBy(desc(learningTracks.featured), asc(learningTracks.position), asc(learningTracks.id)),
      db.select({
        trackId: learningTrackInterests.trackId,
        total: sql<number>`count(*)::int`,
      }).from(learningTrackInterests)
        .where(eq(learningTrackInterests.status, "active"))
        .groupBy(learningTrackInterests.trackId),
    ]);
    if (!rows.length) return [...DEFAULT_LEARNING_TRACKS];
    const countByTrack = new Map(counts.map((row) => [row.trackId, Number(row.total) || 0]));
    return rows.map((row) => publicTrack(row, countByTrack.get(row.id) || 0));
  } catch {
    // Deploys without the latest migration still render a useful, truthful
    // roadmap. Interactive interest registration remains disabled until the
    // database migration has completed.
    return [...DEFAULT_LEARNING_TRACKS];
  }
}
