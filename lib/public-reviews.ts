import { desc, eq, inArray } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";
import { getDb } from "@/db";
import { courseReviews, users } from "@/db/schema";

export type PublicReview = { id: number; courseSlug: string; rating: number; body: string; author: string; specialty: string; createdAt: string };

function publicName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "طالب في مراس";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.at(-1)?.slice(0, 1)}.`;
}

export async function getPublicReviews(limit = 12): Promise<PublicReview[]> {
  noStore();
  if (!process.env.DATABASE_URL) return [];
  try {
    const db = getDb();
    const rows = await db.select().from(courseReviews).where(eq(courseReviews.status, "published")).orderBy(desc(courseReviews.createdAt)).limit(Math.min(24, Math.max(1, limit)));
    const emails = [...new Set(rows.map((row) => row.userEmail))];
    const owners = emails.length ? await db.select({ email: users.email, fullName: users.fullName, specialty: users.specialty }).from(users).where(inArray(users.email, emails)) : [];
    const byEmail = new Map(owners.map((row) => [row.email.toLowerCase(), row]));
    return rows.map((row) => ({ id: row.id, courseSlug: row.courseSlug, rating: Math.max(1, Math.min(5, row.rating)), body: row.body, author: publicName(byEmail.get(row.userEmail.toLowerCase())?.fullName || "طالب في مراس"), specialty: byEmail.get(row.userEmail.toLowerCase())?.specialty || "طالب جامعي", createdAt: row.createdAt }));
  } catch {
    return [];
  }
}
