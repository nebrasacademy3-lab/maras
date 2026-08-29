import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserFromHeaders, roleAllowed, type SessionUser, type UserRole } from "@/lib/auth";

export async function currentUser() {
  return getSessionUserFromHeaders(new Headers(await headers()));
}

export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/login?return_to=${encodeURIComponent(returnTo)}`);
  if (!user.profileCompleted) redirect(`/complete-profile?return_to=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireRole(returnTo: string, roles: UserRole[]) {
  const user = await requireUser(returnTo);
  if (!roleAllowed(user, roles)) redirect("/dashboard?error=forbidden");
  return user;
}
