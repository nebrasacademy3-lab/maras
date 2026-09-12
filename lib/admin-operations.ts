/** Decisions shared by administrative routes; dates are compared at one request time. */
export function extendAccessExpiry(expiresAt: string | null, days: number, now: string) {
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("Invalid extension duration");
  if (expiresAt === null) return null;
  const base = Math.max(Date.parse(now), Date.parse(expiresAt));
  if (!Number.isFinite(base)) throw new Error("Invalid access timestamp");
  return new Date(base + days * 86_400_000).toISOString();
}

export function adminUserTransitionError(
  before: { id: number; role: string; status: string },
  next: { role: string; status: string },
  actorId: number | null,
  activeAdminCount: number,
) {
  const removesAdmin = next.role !== "admin" || next.status !== "active";
  if (before.id === actorId && removesAdmin) return "لا يمكنك تعطيل صلاحية حسابك الإداري الحالي";
  if (before.role === "admin" && before.status === "active" && removesAdmin && activeAdminCount <= 1) return "لا يمكن تعطيل آخر مدير نشط للمنصة";
  return null;
}

export function adminPage(value: unknown, pageSize = 50) {
  const page = typeof value === "string" && /^\d{1,7}$/.test(value) ? Math.max(1, Number(value)) : 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}
