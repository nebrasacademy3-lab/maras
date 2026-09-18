"use client";
import type { ReactNode } from "react";
import { useAdminAccess } from "@/components/admin-access";
/** Presentation only. The API independently checks capabilities on every request. */
export function AdminCapability({ all, children }: { all: readonly string[]; children: ReactNode }) {
  const { can } = useAdminAccess();
  return can(all) ? <>{children}</> : null;
}
