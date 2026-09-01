import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { courseBundleItems, courseBundles } from "@/db/schema";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { calculateBundleDiscountMinor, type BundleDiscountType } from "@/lib/bundle-pricing";
import type { Course } from "@/lib/data";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance";

export { allocateBundleDiscountMinor, calculateBundleDiscountMinor } from "@/lib/bundle-pricing";
export type { BundleDiscountType } from "@/lib/bundle-pricing";

export type PublicCourseBundle = {
  slug: string;
  title: string;
  description: string;
  institutionSlug: string | null;
  specialtySlug: string | null;
  featured: boolean;
  discountType: BundleDiscountType;
  discountValue: number;
  startsAt: string | null;
  expiresAt: string | null;
  courseSlugs: string[];
  courses: Array<{
    slug: string;
    title: string;
    price: number;
    university: string;
    specialty: string;
    coverImage?: string;
    color: string;
    icon: string;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
};

type BundleRow = typeof courseBundles.$inferSelect;

const ACTIVE_BUNDLE_SQL = sql`${courseBundles.status} = 'published'
  AND (${courseBundles.startsAt} IS NULL OR ${courseBundles.startsAt}::timestamptz <= NOW())
  AND (${courseBundles.expiresAt} IS NULL OR ${courseBundles.expiresAt}::timestamptz > NOW())`;

function normalizedDiscountType(value: string): BundleDiscountType | null {
  if (value === "percent" || value === "fixed") return value;
  return null;
}

function publicQuote(bundle: BundleRow, itemSlugs: string[], catalog: Course[]): PublicCourseBundle | null {
  const discountType = normalizedDiscountType(bundle.discountType);
  const uniqueSlugs = [...new Set(itemSlugs)];
  if (!discountType || uniqueSlugs.length < 2 || uniqueSlugs.length !== itemSlugs.length) return null;
  const catalogBySlug = new Map(catalog.map((course) => [course.slug, course]));
  const courses = uniqueSlugs.map((slug) => catalogBySlug.get(slug));
  if (courses.some((course) => !course || !course.availableForPurchase)) return null;
  const validCourses = courses.filter((course): course is Course => Boolean(course));
  const subtotalMinor = validCourses.reduce((sum, course) => sum + toMinorUnits(course.price), 0);
  const discountMinor = calculateBundleDiscountMinor(discountType, bundle.discountValue, subtotalMinor);
  if (discountMinor <= 0) return null;
  const totalMinor = subtotalMinor - discountMinor;
  return {
    slug: bundle.slug,
    title: bundle.title,
    description: bundle.description,
    institutionSlug: bundle.institutionSlug,
    specialtySlug: bundle.specialtySlug,
    featured: bundle.featured,
    discountType,
    discountValue: bundle.discountValue,
    startsAt: bundle.startsAt,
    expiresAt: bundle.expiresAt,
    courseSlugs: uniqueSlugs,
    courses: validCourses.map((course) => ({
      slug: course.slug,
      title: course.title,
      price: course.price,
      university: course.university,
      specialty: course.specialty,
      coverImage: course.coverImage,
      color: course.color,
      icon: course.icon,
    })),
    subtotal: fromMinorUnits(subtotalMinor),
    discount: fromMinorUnits(discountMinor),
    total: fromMinorUnits(totalMinor),
    subtotalMinor,
    discountMinor,
    totalMinor,
  };
}

export async function listActiveCourseBundles() {
  const db = getDb();
  const bundles = await db.select().from(courseBundles).where(ACTIVE_BUNDLE_SQL).orderBy(sql`${courseBundles.featured} DESC`, asc(courseBundles.title));
  if (!bundles.length) return [];
  const [items, catalog] = await Promise.all([
    db.select().from(courseBundleItems).where(inArray(courseBundleItems.bundleId, bundles.map((bundle) => bundle.id))).orderBy(asc(courseBundleItems.bundleId), asc(courseBundleItems.position), asc(courseBundleItems.id)),
    getCoursesCatalog(),
  ]);
  const itemsByBundle = new Map<number, string[]>();
  for (const item of items) {
    const bucket = itemsByBundle.get(item.bundleId) || [];
    bucket.push(item.courseSlug);
    itemsByBundle.set(item.bundleId, bucket);
  }
  return bundles.flatMap((bundle) => {
    const quote = publicQuote(bundle, itemsByBundle.get(bundle.id) || [], catalog);
    return quote ? [quote] : [];
  });
}

export async function getActiveCourseBundleQuote(bundleSlug: string, requestedCourseSlugs: string[]) {
  const db = getDb();
  const [bundle] = await db.select().from(courseBundles).where(sql`${eq(courseBundles.slug, bundleSlug)} AND ${ACTIVE_BUNDLE_SQL}`).limit(1);
  if (!bundle) return null;
  const [items, catalog] = await Promise.all([
    db.select().from(courseBundleItems).where(eq(courseBundleItems.bundleId, bundle.id)).orderBy(asc(courseBundleItems.position), asc(courseBundleItems.id)),
    getCoursesCatalog(),
  ]);
  const quote = publicQuote(bundle, items.map((item) => item.courseSlug), catalog);
  if (!quote) return null;
  const requested = [...new Set(requestedCourseSlugs)].sort();
  const included = [...quote.courseSlugs].sort();
  if (requested.length !== included.length || requested.some((slug, index) => slug !== included[index])) return null;
  return quote;
}
