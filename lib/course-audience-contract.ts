export const ACCESS_STATES = ["active", "suspended", "scheduled", "expired", "revoked"] as const;
export const WAITLIST_STATES = ["active", "notified", "converted", "cancelled"] as const;
export function courseAccessState(row: { startsAt: string; expiresAt: string | null; suspendedAt: string | null; revokedAt: string | null }, now = Date.now()) {
  if (row.revokedAt) return "revoked";
  if (row.suspendedAt) return "suspended";
  if (!Number.isFinite(Date.parse(row.startsAt))) return "expired"; // invalid historical timestamps fail closed
  if (Date.parse(row.startsAt) > now) return "scheduled";
  if (row.expiresAt && (!Number.isFinite(Date.parse(row.expiresAt)) || Date.parse(row.expiresAt) <= now)) return "expired";
  return "active";
}
export function audienceQuery(params: URLSearchParams) {
  const kind = params.get("kind") === "waitlist" ? "waitlist" : "subscriptions";
  const statuses: readonly string[] = kind === "waitlist" ? WAITLIST_STATES : ACCESS_STATES;
  const requested = params.get("status") || "all";
  const bounded = (value: string | null, fallback: number, max: number) => value && /^\d+$/.test(value) ? Math.max(1, Math.min(max, Number(value))) : fallback;
  return { kind, status: statuses.includes(requested) ? requested : "all", search: (params.get("q") || "").trim().slice(0, 160), page: bounded(params.get("page"), 1, 100000), pageSize: bounded(params.get("pageSize"), 25, 100) };
}
export function escapedLike(value: string) { return `%${value.replace(/[\\%_]/g, "\\$&")}%`; }

export type CourseAudienceData = {
  ok: boolean; error?: string; generatedAt: string;
  course: { slug: string; title: string; university: string; specialty: string; enrollmentMode: "auto" | "open" | "closed"; status: string; availableForPurchase: boolean; readyLessons: number; updatedAt: string | null; managed: boolean };
  summary: { subscriptions: number; active: number; suspended: number; expired: number; scheduled: number; revoked: number; waiting: number; notified: number; converted: number; cancelled: number };
  items: Array<{ id: number; userEmail: string; fullName: string | null; phone: string | null; userId: number | null; status: string; source: string; createdAt: string; startsAt?: string; expiresAt?: string | null; orderNumber?: string | null; notifiedAt?: string | null; convertedAt?: string | null }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
