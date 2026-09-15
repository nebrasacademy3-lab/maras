import { getSessionUser } from "@/lib/auth";
import { permissionsForUser } from "@/lib/permissions";
import { ADMIN_PERMISSIONS, OWNER_ONLY, PERMISSION_LABELS } from "@/lib/staff-policy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user || !["admin", "supervisor"].includes(user.role)) return Response.json({ error: "غير مصرح" }, { status: 403 });
  return Response.json({ user: { id: user.id, fullName: user.fullName, isPlatformOwner: Boolean(user.isPlatformOwner) }, permissions: [...await permissionsForUser(user)], definitions: Object.values(ADMIN_PERMISSIONS).map(key => ({ key, label: PERMISSION_LABELS[key], ownerOnly: OWNER_ONLY.has(key) })) }, { headers: { "cache-control": "private, no-store" } });
}
