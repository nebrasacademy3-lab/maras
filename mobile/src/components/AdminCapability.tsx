import React from "react";
import { useAdminCapabilities } from "@/src/lib/admin-capabilities";
/** Does not fetch the protected child subtree without its capability; server checks are separate. */
export function AdminCapability({ all, children }: { all: readonly string[]; children: React.ReactNode }) {
  const access=useAdminCapabilities();
  return access.can(all)?<>{children}</>:null;
}
