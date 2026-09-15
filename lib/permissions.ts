import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staffPermissions } from "@/db/schema";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { ADMIN_PERMISSIONS, OWNER_ONLY, permissionsCover, requiredRoutePermissions, type AdminPermission } from "@/lib/staff-policy";
export { ADMIN_PERMISSIONS, type AdminPermission } from "@/lib/staff-policy";

export async function permissionsForUser(user: SessionUser): Promise<Set<string>> {
  if (user.isPlatformOwner && user.role === "admin") return new Set(Object.values(ADMIN_PERMISSIONS));
  if (user.role !== "supervisor") return new Set();
  const rows = await getDb().select({ permission: staffPermissions.permission }).from(staffPermissions).where(eq(staffPermissions.userId, user.id));
  return new Set([ADMIN_PERMISSIONS.SECURITY_MANAGE_SELF, ...rows.map(row => row.permission).filter(permission => Object.values(ADMIN_PERMISSIONS).includes(permission as AdminPermission) && !OWNER_ONLY.has(permission))]);
}
export async function hasPermission(user: SessionUser | null, permission: AdminPermission) {
  if (!user) return false;
  return permissionsCover(await permissionsForUser(user), [permission]);
}
export async function authorizePermission(request: Request, permission: AdminPermission) {
  const user = await getSessionUser(request);
  return await hasPermission(user, permission) ? user : null;
}
export async function staffRequestAllowed(user: SessionUser, request: Request) {
  if (user.isPlatformOwner && user.role === "admin") return true;
  if (user.role !== "supervisor") return false;
  const required = requiredRoutePermissions(new URL(request.url).pathname, request.method);
  return required !== null && permissionsCover(await permissionsForUser(user), required);
}
