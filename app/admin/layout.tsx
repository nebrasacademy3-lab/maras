import {Suspense} from "react";
import {AdminShell} from "@/components/admin-shell";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireRole } from "@/lib/server-auth";
import { permissionsForUser } from "@/lib/permissions";
import { AdminAccessProvider } from "@/components/admin-access";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function AdminMetadataLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("/admin", ["admin", "supervisor"]);
  const permissions = [...await permissionsForUser(user)];
  return <AdminAccessProvider key={user.id} permissions={permissions} owner={Boolean(user.isPlatformOwner)}><Suspense fallback={<main aria-busy="true">تحميل مساحة الإدارة…</main>}><AdminShell name={user.fullName}>{children}</AdminShell></Suspense></AdminAccessProvider>;
}
