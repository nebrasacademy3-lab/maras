"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { adminPagePermissions, permissionsCover } from "@/lib/staff-policy";
const Access = createContext<{ permissions: string[]; owner: boolean }>({ permissions: [], owner: false });
export function AdminAccessProvider({ permissions, owner, children }: { permissions: string[]; owner: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ permissions, owner }), [permissions, owner]);
  return <Access.Provider value={value}>{children}</Access.Provider>;
}
export function useAdminAccess() {
  const { permissions, owner } = useContext(Access);
  const grants = useMemo(() => new Set(permissions), [permissions]);
  const can = (required: readonly string[]) => owner || permissionsCover(grants, required);
  return { owner, permissions, can, canVisit: (path: string) => { const required = adminPagePermissions(path); return owner || required !== null && can(required); } };
}
