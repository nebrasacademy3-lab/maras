import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rolePermissions, roles, userRoles } from "@/db/schema";
import { getSessionUser, type SessionUser } from "@/lib/auth";

export const ADMIN_PERMISSIONS = {
  FINANCE_VIEW: "finance.view",
  FINANCE_EXPORT: "finance.export",
  FINANCE_MANAGE: "finance.manage",
  NOTIFICATIONS_MANAGE: "notifications.manage",
  NOTIFICATIONS_DISPATCH: "notifications.dispatch",
  RECORDS_DELETE: "records.delete",
  COMPLIANCE_VIEW: "compliance.view",
  COMPLIANCE_MANAGE: "compliance.manage",
  SECURITY_MANAGE_SELF: "security.manage_self",
  AI_MANAGE: "ai.manage",
  REFERRALS_MANAGE: "referrals.manage",
} as const;

export type AdminPermission = typeof ADMIN_PERMISSIONS[keyof typeof ADMIN_PERMISSIONS];

// This is deliberately finite rather than a wildcard. It keeps the existing
// built-in admin account usable before custom roles are seeded, without making
// an unknown future capability implicitly available.
const BUILT_IN_ADMIN_PERMISSIONS = new Set<AdminPermission>(Object.values(ADMIN_PERMISSIONS));

export async function permissionsForUser(user: SessionUser): Promise<Set<string>> {
  if (user.role === "admin") return new Set(BUILT_IN_ADMIN_PERMISSIONS);

  try {
    const rows = await getDb()
      .select({ permission: rolePermissions.permission })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));
    return new Set(rows.map((row) => row.permission));
  } catch (error) {
    console.error("[permissions] lookup failed", error instanceof Error ? error.message : "unknown error");
    return new Set();
  }
}

export async function hasPermission(user: SessionUser | null, permission: AdminPermission) {
  if (!user) return false;
  const permissions = await permissionsForUser(user);
  return permissions.has(permission);
}

export async function authorizePermission(request: Request, permission: AdminPermission) {
  const user = await getSessionUser(request);
  if (!await hasPermission(user, permission)) return null;
  return user;
}
