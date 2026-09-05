import type { Metadata } from "next";
import type { ReactNode } from "react";

// Inherited by future administrative pages; authorization remains in the server.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function AdminMetadataLayout({ children }: { children: ReactNode }) { return children; }
